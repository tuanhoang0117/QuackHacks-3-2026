# MedsCrossLink AI

### Physical-Digital Medication Reconciler with Immutable Audit Trail

---

## The Problem

Every year, patients leave hospitals with discharge paperwork listing multiple new medications — and go home alone to manage them.

The transition from hospital to home care is one of the most dangerous moments in a patient's medical journey. Patients juggle prescriptions from multiple providers who may not be in contact with each other. A cardiologist prescribes a blood thinner. A dentist, unaware of that prescription, prescribes an antibiotic. The patient, not a medical professional, has no way of knowing those two drugs together can cause fatal internal hemorrhage.

This is not a rare edge case. Medication reconciliation errors are a leading cause of preventable harm in post-discharge care. Consumer health apps offer reminders and logs — but none of them physically verify what's in the patient's hand, cross-reference it against their full medical history, and stop them before they take something dangerous.

**MedsCrossLink AI does.**

---

## What It Does

MedsCrossLink AI is a transitional-care safety system that helps high-risk patients avoid medication errors when moving from acute hospital care to self-directed home care.

The patient scans their pill tray with their phone camera. In seconds:

- **Computer vision** detects and counts the physical objects on the tray
- **Gemini 2.5 Flash** reads the labels and extracts medication names from discharge paperwork
- **A deterministic safety engine** cross-references every drug against a medical database — checking for dangerous interactions, contraindications with the patient's conditions, and double-dose timing violations
- **ElevenLabs** speaks the verdict out loud in plain language the patient can actually understand
- **Solana** writes a tamper-evident hash of the event to the blockchain — a permanent, uneditable audit record

If anything is wrong, the system blocks the dose and explains exactly why. If everything is clear, the patient gets a spoken confirmation and can proceed safely.

---

## Demo Scenarios

All three scenarios use our demo patient **Marcus Vance** — a 68-year-old male discharged after a DVT (blood clot) diagnosis, with pre-existing hypertension.

### Demo 1 — Contraindication
Marcus reaches for Sudafed (pseudoephedrine) for a cold.
> **Result: BLOCKED** — Pseudoephedrine is a vasoconstrictor. In severe hypertension it can trigger a hypertensive crisis, risking stroke or myocardial infarction.

### Demo 2 — Lethal Drug Interaction
Marcus is on Warfarin (blood thinner) from the hospital. His dentist prescribed Metronidazole for an abscess.
> **Result: BLOCKED (Critical)** — Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage.

### Demo 3 — Double Dose
Marcus scans his Warfarin again 47 minutes after already taking a dose.
> **Result: BLOCKED** — A dose was already logged. Minimum re-dose interval is 8 hours.

---

## Architecture

```
React Native App (Track A)
        ↓
FastAPI Gateway (Track B)
        ↓              ↓              ↓             ↓
  Gemini 2.5      MongoDB         ElevenLabs     Solana
  Flash           Safety Engine   TTS Audio      Devnet
  (perception)    (all verdicts)  (spoken alert) (audit hash)
```

**The core design principle:** Gemini observes — it reads labels and extracts names. MongoDB decides — it owns every safety verdict. These two responsibilities never cross.

| Component | Role |
|---|---|
| React Native | Camera capture, verdict display, audio playback |
| OpenCV | Object detection and pill counting |
| Gemini 2.5 Flash | Label reading and document extraction — observation only |
| FastAPI + MongoDB | Deterministic safety engine — all clinical verdicts |
| ElevenLabs | Plain-language spoken alerts |
| Solana Devnet | Tamper-evident hash-only audit trail |

---

## Patient Q&A

Beyond safety checks, patients can ask plain-language questions about their medications:

- *"What is Warfarin for?"*
- *"Will this make me drowsy?"*
- *"Can I eat before taking this?"*

The system summarizes discharge documents in spoken plain language and answers follow-up questions grounded in the document and medical database — always ending with a provider disclaimer. Never replacing their doctor, always making their doctor's instructions more accessible.

---

## Safety Guardrails

- **AI never makes safety decisions.** Every block comes from a database row, not a model's judgment. Gemini could be completely wrong about an interaction and the system would still block it — because the block comes from MongoDB, not from the model.
- **PHI never touches the blockchain.** Solana memos contain only a SHA-256 hash of the event — no drug names, no patient identifiers.
- **Human review is mandatory** when labels are unreadable, identity is uncertain, or any High/Critical flag is raised.
- **Honest scope:** the system verifies count and presence of objects and reads labels for a proposed identity. It does not prove drug identity from pill shape alone, and it cannot prove ingestion.

---

## Tech Stack

**Backend (Track B)**
- Python 3.14 / FastAPI / Uvicorn
- MongoDB 6.0
- Google Gemini 2.5 Flash
- ElevenLabs Turbo v2.5
- Solana Web3.js / Devnet

**Frontend (Track A)**
- React Native / Expo
- React Navigation

---

## Running the Backend

```bash
# 1. Install dependencies
cd backend
pip install -r requirements.txt

# 2. Set up environment
cp .env.example .env
# Fill in: GEMINI_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, SOLANA_PRIVATE_KEY

# 3. Seed the database (requires MongoDB running locally)
python seed_db.py

# 4. Start the server
uvicorn main:app --port 8000 --reload
```

**Run tests:**
```bash
python -m pytest test_engine.py -v   # unit tests (no API keys needed)
python test_static.py                 # full pipeline test
```

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST /verify` | Full scan pipeline — image + clinical text → safety verdict |
| `POST /speak` | ElevenLabs TTS proxy — text → audio |
| `POST /summarize` | Discharge document → plain-language spoken summary |
| `POST /ask` | Patient Q&A — question + document context → spoken answer |
| `GET /health` | Server + database health check |

---

## Built at QuackHacks 2026
