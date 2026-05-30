# MedsCrossLink AI — JSON Contract & API Endpoint Spec

> **This is the shared interface between Track A (frontend) and Track B (backend).**
> Both tracks build against this document. Do not change it without coordinating first.

---

## Endpoints

### `POST /verify`

Accepts a webcam frame, clinical document text, and a patient ID. Returns the full reconciliation verdict.

**Request** — `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `image` | file (JPEG/PNG) | The webcam frame to analyze |
| `clinical_text` | string | Raw discharge paperwork text (PII will be stripped server-side before Gemini) |
| `patient_id` | string | Patient reference ID, e.g. `"PT-9942"` |

**Response** — `application/json` → `ReconciliationResult`

```json
{
  "verification_successful": false,
  "matched_medications": ["Metronidazole", "Warfarin"],
  "safety_flags": [
    {
      "type": "interaction",
      "severity": "Critical",
      "drugs_involved": ["Metronidazole", "Warfarin"],
      "mechanism": "Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage."
    }
  ],
  "requires_human_review": false,
  "review_reason": "",
  "status_speech": "BLOCKED. Critical interaction detected between Metronidazole and Warfarin. Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. Do not administer. Contact your provider immediately.",
  "solana_payload_hash": "a3f8c1d2e4b7...",
  "status_tag": "BLOCKED"
}
```

---

### `POST /speak`

Proxies `status_speech` text to ElevenLabs TTS. The ElevenLabs API key never leaves the server.

**Request** — `application/json`

```json
{
  "text": "BLOCKED. Critical interaction detected between Metronidazole and Warfarin..."
}
```

**Response** — `audio/mpeg` (binary audio stream)

---

## Shared Types

### TypeScript (Track A — React Native)

```typescript
export type IdentificationBasis = 'label_text' | 'imprint' | 'shape_color' | 'uncertain';

export type SafetyFlagType = 'interaction' | 'contraindication' | 'dose_ceiling' | 'too_soon' | 'duplicate';

export type Severity = 'Critical' | 'High' | 'Moderate' | 'Low';

export type StatusTag = 'VERIFIED_PRESENT' | 'BLOCKED' | 'REVIEW_REQUIRED';

export interface SafetyFlag {
  type: SafetyFlagType;
  severity: Severity;
  drugs_involved: string[];
  mechanism: string;
}

export interface ReconciliationResult {
  verification_successful: boolean;
  matched_medications: string[];
  safety_flags: SafetyFlag[];
  requires_human_review: boolean;
  review_reason: string;
  status_speech: string;
  solana_payload_hash: string;
  status_tag: StatusTag;
}

export interface SpeakRequest {
  text: string;
}
```

### Python (Track B — FastAPI)

```python
from pydantic import BaseModel
from typing import Literal

class SafetyFlag(BaseModel):
    type: Literal['interaction', 'contraindication', 'dose_ceiling', 'too_soon', 'duplicate']
    severity: Literal['Critical', 'High', 'Moderate', 'Low']
    drugs_involved: list[str]
    mechanism: str

class ReconciliationResult(BaseModel):
    verification_successful: bool
    matched_medications: list[str]
    safety_flags: list[SafetyFlag]
    requires_human_review: bool
    review_reason: str
    status_speech: str
    solana_payload_hash: str
    status_tag: Literal['VERIFIED_PRESENT', 'BLOCKED', 'REVIEW_REQUIRED']
```

---

## UI Rendering Rules (for Track A)

| `status_tag` | Banner color | Action |
|---|---|---|
| `VERIFIED_PRESENT` | Green | Play `status_speech` audio, show matched meds |
| `BLOCKED` | Red | Play `status_speech` audio, list each `SafetyFlag` with severity badge |
| `REVIEW_REQUIRED` | Yellow | Show `review_reason`, prompt human verification |

**Human review banner text:** `"System Confidence Low: Human Verification Required"`

Show this banner when `requires_human_review` is `true`, regardless of `status_tag`.

---

## Mock Responses for Track A Development

Use these as hardcoded responses to build and test the UI before the backend is ready.

### Demo 1 — Contraindication (Sudafed + Hypertension)

```json
{
  "verification_successful": false,
  "matched_medications": ["Pseudoephedrine"],
  "safety_flags": [
    {
      "type": "contraindication",
      "severity": "High",
      "drugs_involved": ["Pseudoephedrine"],
      "mechanism": "Pseudoephedrine is a systemic vasoconstrictor. In severe hypertension it can trigger a hypertensive crisis, risking stroke or myocardial infarction."
    }
  ],
  "requires_human_review": false,
  "review_reason": "",
  "status_speech": "BLOCKED. High severity contraindication detected. Pseudoephedrine is contraindicated for your condition. Pseudoephedrine is a systemic vasoconstrictor. In severe hypertension it can trigger a hypertensive crisis, risking stroke or myocardial infarction. Do not take this medication. Contact your provider.",
  "solana_payload_hash": "b2e9f4a1c6d3...",
  "status_tag": "BLOCKED"
}
```

### Demo 2 — Lethal Interaction (Warfarin + Metronidazole)

```json
{
  "verification_successful": false,
  "matched_medications": ["Metronidazole", "Warfarin"],
  "safety_flags": [
    {
      "type": "interaction",
      "severity": "Critical",
      "drugs_involved": ["Metronidazole", "Warfarin"],
      "mechanism": "Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage."
    }
  ],
  "requires_human_review": false,
  "review_reason": "",
  "status_speech": "BLOCKED. Critical interaction detected between Metronidazole and Warfarin. Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage. Do not administer. Contact your provider immediately.",
  "solana_payload_hash": "a3f8c1d2e4b7...",
  "status_tag": "BLOCKED"
}
```

### Demo 3 — Double-Dose (Warfarin re-scanned too soon)

```json
{
  "verification_successful": false,
  "matched_medications": ["Warfarin"],
  "safety_flags": [
    {
      "type": "too_soon",
      "severity": "High",
      "drugs_involved": ["Warfarin"],
      "mechanism": "A dose of Warfarin was already logged 47 minutes ago. The minimum re-dose interval is 480 minutes. Administering again this soon risks dangerous anticoagulant accumulation."
    }
  ],
  "requires_human_review": false,
  "review_reason": "",
  "status_speech": "BLOCKED. Too soon to re-administer Warfarin. A dose was already logged 47 minutes ago. The minimum interval is 8 hours. Do not take this dose. Contact your provider if you believe this is an error.",
  "solana_payload_hash": "c7d0e5f2a8b1...",
  "status_tag": "BLOCKED"
}
```

### Demo 4 — Clean Verification

```json
{
  "verification_successful": true,
  "matched_medications": ["Lisinopril"],
  "safety_flags": [],
  "requires_human_review": false,
  "review_reason": "",
  "status_speech": "Verified. Lisinopril is present and matches your prescription. No interactions or contraindications detected. Safe to administer.",
  "solana_payload_hash": "f1a4b9c2d6e3...",
  "status_tag": "VERIFIED_PRESENT"
}
```

### Demo 5 — Human Review Required (unreadable label)

```json
{
  "verification_successful": false,
  "matched_medications": [],
  "safety_flags": [],
  "requires_human_review": true,
  "review_reason": "Label partially obscured: 'acetamin...' — identity unconfirmed. Manual verification required before administering.",
  "status_speech": "Review required. One or more items could not be confirmed from their labels. Please verify manually before administering.",
  "solana_payload_hash": "d5e8f3a2b7c4...",
  "status_tag": "REVIEW_REQUIRED"
}
```

---

## Base URL

- **Development:** `http://localhost:8000`
- **Track A mock:** hardcode the responses above; swap base URL to `http://localhost:8000` at integration (Hour 10).
