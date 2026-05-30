# System Design: MedsCrossLink AI (v2)

### Physical-Digital Medication Reconciler & Immutable Solana Audit Trail

> **What changed in v2 (read this first).**
> The core architectural decision is now explicit and enforced everywhere: **MongoDB + FastAPI are the single deterministic authority for every safety verdict.** Google Gemini is demoted to a *perception layer* — it observes and extracts, it does not judge risk. Several build-blocking errors from v1 are also corrected (dead model string, OpenCV typo), the privacy claims are made truthful (hash-only on-chain), and the frontend is committed to a single target (React Native). A two-person task split is added in Section 8.

---

## 1. Executive Summary & Production Metrics

MedsCrossLink AI is a transitional-care safety system that helps high-risk patients avoid medication reconciliation errors when moving from acute hospital care to self-directed home care. It pairs edge computer vision (OpenCV) for object detection, a multimodal model (Gemini) for reading labels and documents, a **deterministic safety engine (MongoDB + FastAPI)** that renders all clinical verdicts, real-time audio alerts (ElevenLabs), and a tamper-evident audit trail (Solana).

- **The transitional-care problem.** A large share of post-discharge medication errors stem from patients being unable to reliably cross-reference physical pills against discharge paperwork. *(Replace this with a cited figure before any public pitch — the v1 "60%" and "$38–50B" numbers need real sources; judges will ask.)*
- **The accountability gap.** Consumer health-tracking apps offer no physical verification and keep editable, untraceable compliance histories. MedsCrossLink addresses this with deterministic safety checks plus an append-only, tamper-evident ledger entry per event.

> **Honest scope statement (use this in the pitch).** The system verifies the **count and presence** of objects on the tray and reads labels/imprints to *propose* an identity. It does **not** independently prove drug identity from pill shape alone, and it cannot prove ingestion. Any identity not confirmed by a readable label or imprint is escalated to human review.

---

## 2. End-to-End System Architecture

The application uses a split-execution architecture: high-frequency local vision on the client, and an asynchronous backend that runs a **deterministic-before-probabilistic** validation lifecycle.

| Component | Technology Stack | Core Responsibility |
|---|---|---|
| Client App | **React Native** (Expo) + React Navigation | Single deliverable frontend. Captures webcam frames, runs the local blur gate, displays verdicts, plays audio. *(The v1 web React/Tailwind dashboard is dropped — build one frontend, not two.)* |
| Vision Orchestration | OpenCV (Python) | Object **detection and counting** only — contour segmentation, bounding boxes, blur gating. Does **not** identify drugs. |
| Central Gateway & **Safety Engine** | **FastAPI (Python)** | **The decision-maker.** Runs the deterministic MongoDB checks, composes the verdict, generates the alert script, and produces the on-chain hash. |
| Perception Agent | **Google Gemini 2.5 Flash** | **Observation only.** Reads labels/imprints from the image and extracts medication names from clinical text. Returns structured observations — never a safety verdict. |
| Audio Engine | ElevenLabs TTS | Converts the FastAPI-composed `status_speech` string to audio. Proxied through FastAPI to keep the key server-side. |
| Tamper-Evident Ledger | Solana Devnet / web3.js | Writes a **SHA-256 hash** of the verification event (no PHI) to the Memo Program as an append-only proof. |

**Authority model in one sentence:** *Gemini says what it sees; MongoDB says what's true; FastAPI decides what happens.*

---

## 3. Module-by-Module Code Specifications

### Module A: OpenCV Detection Pipeline (`pill_tracker.py`)

Isolates and counts physical objects on a flat surface. **It establishes how many objects are present and where — it does not determine what they are.** Identity is handled downstream by the perception agent reading labels/imprints.

```python
import cv2
import numpy as np

BLUR_VARIANCE_FLOOR = 100   # below this, frame is too blurry to use
NOISE_AREA_FLOOR = 150      # contours smaller than this are ignored

def is_frame_usable(frame_matrix):
    """Laplacian-variance blur gate. Returns False if the frame is too soft to analyze."""
    gray = cv2.cvtColor(frame_matrix, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    return variance >= BLUR_VARIANCE_FLOOR, variance

def process_vision_frame(frame_matrix):
    """
    Accepts a raw BGR image matrix, removes high-frequency noise,
    extracts contours, and returns object count + bounding boxes.
    NOTE: returns *objects*, not *drug identities*.
    """
    gray = cv2.cvtColor(frame_matrix, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (11, 11), 0)

    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 21, 4
    )

    # FIX (v1 bug): cv2.MORPH_ELLIPSIS does not exist -> cv2.MORPH_ELLIPSE
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    processed_targets = []
    pill_count = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < NOISE_AREA_FLOOR:
            continue
        pill_count += 1
        x, y, w, h = cv2.boundingRect(cnt)
        processed_targets.append({"id": pill_count, "bounding_box": [x, y, w, h], "area": area})
        cv2.rectangle(frame_matrix, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(frame_matrix, f"Obj #{pill_count}", (x, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    return frame_matrix, processed_targets
```

### Module B: Perception Agent (`perception_agent.py`)

Gemini's only job is to **report observations**. It extracts drug names from the image (via labels/imprints) and from the clinical text. It is explicitly forbidden from judging safety — that happens in Module D.

```python
import os
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# --- Gemini returns OBSERVATIONS ONLY ---
class IdentifiedItem(BaseModel):
    name: str = Field(description="Best-guess medication name from a visible label or imprint.")
    identification_basis: str = Field(
        description="How identity was determined: 'label_text', 'imprint', 'shape_color', or 'uncertain'."
    )

class PerceptionResult(BaseModel):
    physical_object_count: int = Field(description="Number of distinct physical objects observed on the tray.")
    identified_items: list[IdentifiedItem] = Field(description="Items the agent could name, with the basis for each.")
    document_medications: list[str] = Field(description="Medication names extracted from the clinical text.")
    unreadable_or_partial: list[str] = Field(description="Items/labels too damaged or partial to read; flagged for human review.")
    raw_text_observed: str = Field(description="Any label text literally read from the image.")

def extract_observations(image_bytes, clinical_paper_text):
    """
    Dispatches the frame + clinical text to Gemini 2.5 Flash for EXTRACTION ONLY.
    Returns a PerceptionResult. Makes no safety judgment.
    """
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    system_instruction = """
    You are a perception module. Your ONLY task is to observe and report — never to judge medical safety.
    From the image: count the distinct physical objects on the tray, and read any visible labels or pill imprints.
    For each item you can name, state how you identified it (label_text, imprint, shape_color, or uncertain).
    From the clinical text: list every medication name mentioned.
    If a label is torn/partial, use partial matching (e.g. 'acetamin...' -> Acetaminophen) but place the item in
    'unreadable_or_partial' so a human can confirm.
    Do NOT decide whether anything is safe, dangerous, duplicated, or interacting. Output only what you observe,
    conforming exactly to the requested JSON schema.
    """

    response = client.models.generate_content(
        model='gemini-2.5-flash',   # FIX (v1 bug): gemini-1.5-flash is shut down and 404s.
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type='image/jpeg'),
            f"CLINICAL TEXT:\n{clinical_paper_text}"
        ],
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=PerceptionResult
        )
    )
    return response.text
```

### Module C: On-Chain Audit Logger (`solana_logger.ts`)

Writes a **hash only** to the Solana Memo Program. No drug names, no patient identifiers, ever. The hash is computed server-side by FastAPI (Module D) and passed in.

```typescript
import {
  Connection, Keypair, Transaction, TransactionInstruction,
  PublicKey, sendAndConfirmTransaction
} from '@solana/web3.js';
import bs58 from 'bs58';

// IMPORTANT: `auditHash` MUST already be a SHA-256 hex digest produced by FastAPI.
// Never pass raw medication names, patient IDs, or clinical text into this function.
export async function logAuditToSolana(auditHash: string, statusTag: string): Promise<string> {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const secretKeyString = process.env.SOLANA_PRIVATE_KEY || "";
  const feePayer = Keypair.fromSecretKey(bs58.decode(secretKeyString));

  const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

  // Memo contains ONLY a non-identifying status tag + the opaque hash.
  const memoPayload = `${statusTag}|${auditHash}`;

  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: feePayer.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoPayload, "utf-8"),
  });

  const transaction = new Transaction().add(memoInstruction);
  const txSignature = await sendAndConfirmTransaction(connection, transaction, [feePayer]);
  return `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;
}
```

### Module D: Deterministic Safety Engine (`safety_engine.py`) — NEW, the heart of v2

This is where every verdict is made. It takes Gemini's observations, runs deterministic MongoDB lookups, and composes the result. **Gemini's opinion is never trusted for safety; only MongoDB rows are.**

```python
import hashlib, json, datetime
from pydantic import BaseModel, Field

# --- FastAPI produces the AUTHORITATIVE verdict ---
class SafetyFlag(BaseModel):
    type: str            # 'interaction' | 'contraindication' | 'dose_ceiling' | 'too_soon' | 'duplicate'
    severity: str        # taken verbatim from MongoDB: 'Critical' | 'High' | 'Moderate' | 'Low'
    drugs_involved: list[str]
    mechanism: str       # authoritative explanation pulled from the MongoDB row

class ReconciliationResult(BaseModel):
    verification_successful: bool
    matched_medications: list[str]
    safety_flags: list[SafetyFlag]
    requires_human_review: bool
    review_reason: str
    status_speech: str           # composed deterministically from the flags below
    solana_payload_hash: str     # SHA-256 of the canonical event; safe to publish
    status_tag: str              # 'VERIFIED_PRESENT' | 'BLOCKED' | 'REVIEW_REQUIRED'

def decide(perception: dict, patient_profile: dict, db, now=None) -> ReconciliationResult:
    now = now or datetime.datetime.utcnow()
    flags: list[SafetyFlag] = []

    # Canonical name list = what Gemini saw + what the documents prescribe (deduped).
    observed = [i["name"] for i in perception["identified_items"]]
    candidates = sorted(set(observed + perception["document_medications"]))

    # 1) DRUG-TO-DRUG INTERACTIONS (pairwise, deterministic).
    for a in candidates:
        for b in candidates:
            if a < b:
                hit = db.drug_interactions.find_one({"drug_a": a, "drug_b": b}) \
                   or db.drug_interactions.find_one({"drug_a": b, "drug_b": a})
                if hit:
                    flags.append(SafetyFlag(type="interaction", severity=hit["severity"],
                                            drugs_involved=[a, b], mechanism=hit["mechanism"]))

    # 2) DRUG-TO-CONDITION CONTRAINDICATIONS.
    for drug in candidates:
        for cond in patient_profile.get("past_medical_history", []):
            hit = db.drug_contraindications.find_one({"drug_name": drug, "contraindicated_condition": cond})
            if hit:
                flags.append(SafetyFlag(type="contraindication", severity=hit["severity"],
                                        drugs_involved=[drug], mechanism=hit["mechanism"]))

    # 3) DOSE CEILINGS (guards against scaling/hallucination).
    #    ... query db.dosages for each drug, compare against label-read dose ...

    # 4) TOO-SOON / DOUBLE-DOSE (uses local dose_log, NOT live Solana history).
    for drug in candidates:
        last = db.dose_log.find_one({"patient_id": patient_profile["patient_id"], "drug_name": drug},
                                    sort=[("logged_at", -1)])
        # ... compare (now - last['logged_at']) against db.dosages min-interval; flag 'too_soon' if violated ...

    # --- Compose the verdict deterministically ---
    needs_review = bool(perception["unreadable_or_partial"]) or \
        any(i["identification_basis"] in ("shape_color", "uncertain") for i in perception["identified_items"])

    blocking = any(f.severity in ("Critical", "High") for f in flags)
    success = (not blocking) and (not needs_review) and len(flags) == 0

    speech = compose_speech(flags, needs_review)          # templated, seeded from MongoDB mechanism text
    tag = "BLOCKED" if blocking else ("REVIEW_REQUIRED" if needs_review else "VERIFIED_PRESENT")

    event = {"ts": now.isoformat(), "tag": tag, "drugs": candidates,
             "patient_ref": hashlib.sha256(patient_profile["patient_id"].encode()).hexdigest()[:16]}
    payload_hash = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()

    return ReconciliationResult(
        verification_successful=success, matched_medications=candidates,
        safety_flags=flags, requires_human_review=needs_review,
        review_reason="; ".join(perception["unreadable_or_partial"]) if needs_review else "",
        status_speech=speech, solana_payload_hash=payload_hash, status_tag=tag,
    )
```

> **Why this matters:** in v1, both Gemini *and* MongoDB were described as catching the lethal Warfarin + Metronidazole mix, which means neither truly owned it. Here, MongoDB owns it unconditionally. Gemini could completely fail to mention the interaction and the system would still block, because the block comes from a database row, not from the model's judgment.

---

## 4. Step-by-Step Implementation Roadmap (24h)

1. **Phase 1 — Local Vision Sandbox (Hours 0–4).** `pip install opencv-python numpy fastapi uvicorn pymongo`. Build camera ingest + the blur gate. Verify bounding boxes render over arbitrary desk objects.
2. **Phase 2 — Deterministic Engine (Hours 4–9).** Stand up MongoDB, seed the four collections (Section 7), and implement `safety_engine.decide()`. **Test it with hardcoded perception dicts — no Gemini, no camera yet.** This is the most important code in the project; it must pass all three edge cases from a unit test before anything else is wired in.
3. **Phase 3 — Perception + Web3 (Hours 9–13).** Wire Gemini 2.5 Flash extraction; fund a Devnet wallet via airdrop; confirm hash-only memos appear in Solana Explorer.
4. **Phase 4 — Synthesis & UI (Hours 13–24).** ElevenLabs proxy, React Native screens, end-to-end integration, rehearse the three demos.

---

## 5. Clinical Guardrails & Edge Case Management

### 5.1 Adverse Drug Events & Contraindications
Handled entirely by `safety_engine.decide()` against the `drug_interactions` and `drug_contraindications` collections plus the patient profile. No LLM risk-calculation.

### 5.2 Vision Degradation & Damaged Assets
- **Blur gate:** `pill_tracker.is_frame_usable()` aborts before any API call if Laplacian variance < 100, prompting a refocus.
- **Damaged labels:** Gemini attempts partial matching but must place uncertain items in `unreadable_or_partial`, which forces human review (Section 6.2).

### 5.3 The Physical Adherence Limitation
- **Scope boundary:** vision confirms object **count and presence** and reads labels for a *proposed* identity. It does not prove identity from shape alone, and it cannot prove ingestion.
- **Ledger designation:** memos are tagged `VERIFIED_PRESENT` (never `VERIFIED_CONSUMED`).

---

## 6. Privacy, Compliance & Human-in-the-Loop

### 6.1 Data Handling (truthful version)
1. **Edge-only vision:** OpenCV runs locally; raw frames are not persisted.
2. **PII scrubbing:** a local sanitizer strips obvious identifiers (names, SSNs, DOBs) from clinical text before it is sent to Gemini.
3. **Hash-only ledger:** the Solana memo contains a SHA-256 hash plus a non-identifying status tag — **never** raw medical data. This makes the ledger tamper-evident without publishing PHI.

> **Do not claim "full HIPAA compliance."** A 24-hour hackathon build is not a compliant medical device, and publishing PHI to a public immutable chain would be the *opposite* of compliant. The defensible claim is: *"PHI never leaves the device unhashed, and the public ledger stores only opaque event hashes."* Also note: an opaque hash is not a "zero-knowledge proof" — call it what it is, a tamper-evident hash.

> **On the blockchain choice:** immutability here does not require decentralization — a signed append-only log would give the same audit property with less latency and no PHI-leak risk. If Solana is in scope for hackathon-track reasons, that's a legitimate goal; just keep it hash-only and don't oversell what it buys clinically.

### 6.2 Mandatory Human-in-the-Loop (concrete halt conditions)
The pipeline halts and renders the warning banner **"System Confidence Low: Human Verification Required"** when **any** of these is true (no fabricated confidence percentages):
- the deterministic engine raises **any** flag of severity High or Critical;
- `unreadable_or_partial` is non-empty;
- any identified item's `identification_basis` is `shape_color` or `uncertain` (i.e., identity not confirmed by a readable label or imprint).

---

## 7. Database Architecture (MongoDB) — the source of truth

- **Engine:** MongoDB v6.0+ (local instance simulating an edge-buffered EHR mirror).
- **Database:** `meds_crosslink`
- **Indexes:** `db.drug_interactions.createIndex({ "drug_a": 1, "drug_b": 1 })` (compound, fast pair lookups); `db.drug_contraindications.createIndex({ "drug_name": "text" })` (fuzzy brand/generic matching).

### Collections
1. **`patient_profiles`** — anonymized baseline (conditions, allergies, pre-admission meds).
2. **`drug_interactions`** — authoritative drug-to-drug rows (`drug_a`, `drug_b`, `severity`, `mechanism`).
3. **`drug_contraindications`** — drug-to-condition rows (`drug_name`, `contraindicated_condition`, `severity`, `mechanism`).
4. **`dosages`** — ceilings + minimum re-dose intervals (`drug_name`, `max_single_dose_mg`, `max_daily_dose_mg`, `min_interval_minutes`, `standard_form`).
5. **`dose_log`** — per-event log used for the too-soon/double-dose check (`patient_id`, `drug_name`, `logged_at`). *(This replaces v1's live Solana-history query, which is too slow/flaky for a live demo.)*

### Pipeline execution sequence (deterministic-before-probabilistic)
```
[Webcam frame + document text + patient_id]
        │
        ▼
[Gemini perception]  ── extracts observed items + document meds (NO verdict)
        │
        ▼
[MongoDB deterministic gate] ── interactions, contraindications, dose ceilings, dose_log timing
        │
        ▼
[FastAPI composes ReconciliationResult] ── verdict + status_speech + SHA-256 hash
        │
        ▼
[Client] ── banner + ElevenLabs audio   [Solana] ── hash-only memo
```

### Seed data (drives the three demo edge cases)

**`patient_profiles`**
```json
{
  "patient_id": "PT-9942",
  "name": "Marcus Vance",
  "dob": "1968-11-14",
  "biological_sex": "Male",
  "occupation": "High School Athletics Director",
  "emergency_contact": "Sarah Vance (Spouse) - 555-0192",
  "chief_complaint": "Leg pain and swelling; subsequent dental pain.",
  "past_medical_history": [
    "Severe Essential Hypertension (High Blood Pressure)",
    "Hyperlipidemia (High Cholesterol)"
  ],
  "past_surgical_history": ["None"],
  "allergies": [{ "substance": "Latex", "reaction": "Contact Dermatitis" }],
  "active_prescriptions_pre_admission": ["Lisinopril 10mg daily"]
}
```

**`drug_interactions`**
```json
[
  { "drug_a": "Metronidazole", "drug_b": "Warfarin", "severity": "Critical",
    "mechanism": "Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage." },
  { "drug_a": "Ibuprofen", "drug_b": "Lisinopril", "severity": "Moderate",
    "mechanism": "NSAIDs such as Ibuprofen reduce the antihypertensive effect of Lisinopril and raise the risk of renal impairment." }
]
```

**`drug_contraindications`**
```json
[
  { "drug_name": "Pseudoephedrine", "contraindicated_condition": "Severe Essential Hypertension (High Blood Pressure)",
    "severity": "High",
    "mechanism": "Pseudoephedrine is a systemic vasoconstrictor. In severe hypertension it can trigger a hypertensive crisis, risking stroke or myocardial infarction." }
]
```
*(Note: pair keys are stored alphabetically, e.g. `Metronidazole` < `Warfarin`, to match the lookup convention in `safety_engine.decide()`.)*

---

## 8. Two-Person Task Split

**The seam is the JSON contract.** Both people write Section 3's `PerceptionResult` and `ReconciliationResult` together in the first 30 minutes, then build against mocks of each other.

### Track A — Client, Capture & Presentation
Owner of everything the user sees and the pixels going in.
- React Native app (Home, Scan, History, Profile per the Section 9 spec) with React Navigation bottom tabs.
- Webcam capture + frame submission to the backend.
- OpenCV blob overlay (`pill_tracker.py`) and the local blur gate.
- Rendering verdicts from `ReconciliationResult` (green/red/review banners, status tags).
- Playing `status_speech` audio via the FastAPI `/speak` proxy.
- **Mocks the backend** with a hardcoded `ReconciliationResult` for each of the three demo scenarios, so the full UI is buildable on day one with no backend.

### Track B — Safety Engine, Perception & Ledger
Owner of every verdict and all external services.
- FastAPI gateway implementing the contract + the `/speak` ElevenLabs proxy (keeps the key server-side).
- MongoDB: seed all five collections, build both indexes.
- `safety_engine.decide()` — interactions, contraindications, dose ceilings, dose_log timing, verdict + speech composition + SHA-256 hash. **Unit-tested against hardcoded perception dicts before Gemini is wired in.**
- Gemini 2.5 Flash perception (`perception_agent.py`), extraction-only.
- `solana_logger.ts` + Devnet wallet airdrop; confirm hash-only memos.
- **Mocks the client** with a saved `.jpg` + pasted document text instead of a live webcam.

### Integration timeline
- **Hours 0–1 (together):** lock the JSON contract and the `/speak` endpoint shape.
- **Hours 1–10 (parallel):** A builds screens + capture against mock JSON; B builds engine → perception → ledger against a static image. B's engine must pass all three edge cases as unit tests by hour 9.
- **Hours 10–16:** first live integration — swap mocks for the real endpoint. Do this early; contract mismatches surface here.
- **Hours 16–24:** three demos end-to-end, audio polish, fallback rehearsal.

### Cut order if you fall behind
1. (Already cut) the web dashboard.
2. Solana → single happy-path mint, skip history.
3. Double-dose → in-memory `dose_log` only.
4. ElevenLabs → on-screen text instead of audio.

---

## 9. React Native UI Spec & Demo Scenarios

*(Unchanged from v1 — the 4-screen React Native build prompt, the clinical narrative for Marcus Vance, and the three demo scenarios remain as written. One correction: the demo narration should describe the **MongoDB deterministic gate** catching each error, not "Gemini checks MongoDB." E.g., for the lethal mix: "Gemini reports two pills and reads their labels; FastAPI queries the interaction matrix, finds the Critical Warfarin–Metronidazole row, and forcibly blocks verification.")*

### The three demo scenarios (re-attributed to the deterministic engine)
1. **Contraindication (Sudafed + Hypertension).** Gemini reads "Pseudoephedrine" from the label → FastAPI matches it against the patient's hypertension row in `drug_contraindications` → **BLOCKED**, ElevenLabs warns of vasoconstriction risk.
2. **Lethal interaction (Warfarin + Metronidazole).** Gemini reports both labels → FastAPI finds the Critical CYP2C9 row in `drug_interactions` → **BLOCKED** before any success state.
3. **Double-dose (same Warfarin re-scanned).** Gemini reports one Warfarin → FastAPI checks `dose_log`, sees a recent logged dose inside the minimum interval → **BLOCKED** as a too-soon/overdose risk.
