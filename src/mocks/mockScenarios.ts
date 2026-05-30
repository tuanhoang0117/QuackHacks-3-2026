import { ReconciliationResult, DemoScenario, ScanHistoryEntry } from '../types';

// Every payload here matches the exact JSON defined in CONTRACT.md
export const MOCK_SCENARIOS: Record<DemoScenario, ReconciliationResult> = {
  // CONTRACT.md Demo 4 — Clean Verification
  happy_path: {
    verification_successful: true,
    matched_medications: ['Lisinopril'],
    safety_flags: [],
    requires_human_review: false,
    review_reason: '',
    status_speech:
      'Verified. Lisinopril is present and matches your prescription. No interactions or contraindications detected. Safe to administer.',
    solana_payload_hash: 'f1a4b9c2d6e3...',
    status_tag: 'VERIFIED_PRESENT',
  },

  // CONTRACT.md Demo 1 — Contraindication (Sudafed + Hypertension)
  contraindication: {
    verification_successful: false,
    matched_medications: ['Pseudoephedrine'],
    safety_flags: [
      {
        type: 'contraindication',
        severity: 'High',
        drugs_involved: ['Pseudoephedrine'],
        mechanism:
          'Pseudoephedrine is a systemic vasoconstrictor. In severe hypertension it can trigger a hypertensive crisis, risking stroke or myocardial infarction.',
      },
    ],
    requires_human_review: false,
    review_reason: '',
    status_speech:
      'BLOCKED. High severity contraindication detected. Pseudoephedrine is contraindicated for your condition. Pseudoephedrine is a systemic vasoconstrictor. In severe hypertension it can trigger a hypertensive crisis, risking stroke or myocardial infarction. Do not take this medication. Contact your provider.',
    solana_payload_hash: 'b2e9f4a1c6d3...',
    status_tag: 'BLOCKED',
  },

  // CONTRACT.md Demo 2 — Lethal Interaction (Warfarin + Metronidazole)
  lethal_interaction: {
    verification_successful: false,
    matched_medications: ['Metronidazole', 'Warfarin'],
    safety_flags: [
      {
        type: 'interaction',
        severity: 'Critical',
        drugs_involved: ['Metronidazole', 'Warfarin'],
        mechanism:
          'Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage.',
      },
    ],
    requires_human_review: false,
    review_reason: '',
    status_speech:
      'BLOCKED. Critical interaction detected between Metronidazole and Warfarin. Metronidazole inhibits the CYP2C9 enzyme, blocking Warfarin metabolism. This causes toxic accumulation of the blood thinner and a severe risk of fatal internal hemorrhage. Do not administer. Contact your provider immediately.',
    solana_payload_hash: 'a3f8c1d2e4b7...',
    status_tag: 'BLOCKED',
  },

  // CONTRACT.md Demo 3 — Double-Dose (Warfarin re-scanned too soon)
  double_dose: {
    verification_successful: false,
    matched_medications: ['Warfarin'],
    safety_flags: [
      {
        type: 'too_soon',
        severity: 'High',
        drugs_involved: ['Warfarin'],
        mechanism:
          'A dose of Warfarin was already logged 47 minutes ago. The minimum re-dose interval is 480 minutes. Administering again this soon risks dangerous anticoagulant accumulation.',
      },
    ],
    requires_human_review: false,
    review_reason: '',
    status_speech:
      'BLOCKED. Too soon to re-administer Warfarin. A dose was already logged 47 minutes ago. The minimum interval is 8 hours. Do not take this dose. Contact your provider if you believe this is an error.',
    solana_payload_hash: 'c7d0e5f2a8b1...',
    status_tag: 'BLOCKED',
  },

  // CONTRACT.md Demo 5 — Human Review Required (unreadable label)
  review_required: {
    verification_successful: false,
    matched_medications: [],
    safety_flags: [],
    requires_human_review: true,
    review_reason:
      "Label partially obscured: 'acetamin...' — identity unconfirmed. Manual verification required before administering.",
    status_speech:
      'Review required. One or more items could not be confirmed from their labels. Please verify manually before administering.',
    solana_payload_hash: 'd5e8f3a2b7c4...',
    status_tag: 'REVIEW_REQUIRED',
  },
};

export const DEMO_SCENARIO_LABELS: Record<DemoScenario, string> = {
  happy_path:          'Demo 4 — Verified Clear (Lisinopril)',
  contraindication:    'Demo 1 — Contraindication (Sudafed + HTN)',
  lethal_interaction:  'Demo 2 — Lethal Interaction (Warfarin + Metro)',
  double_dose:         'Demo 3 — Double Dose (Warfarin, 47 min ago)',
  review_required:     'Demo 5 — Review Required (Partial Label)',
};

// Frontend-only mock history — not from the API
export const MOCK_HISTORY: ScanHistoryEntry[] = [
  {
    id: 'scan-005',
    timestamp: '2026-05-30T09:14:00Z',
    status_tag: 'BLOCKED',
    matched_medications: ['Metronidazole', 'Warfarin'],
    solana_payload_hash: 'a3f8c1d2e4b7...',
    safety_flag_count: 1,
  },
  {
    id: 'scan-004',
    timestamp: '2026-05-29T20:03:00Z',
    status_tag: 'VERIFIED_PRESENT',
    matched_medications: ['Lisinopril'],
    solana_payload_hash: 'f1a4b9c2d6e3...',
    safety_flag_count: 0,
  },
  {
    id: 'scan-003',
    timestamp: '2026-05-29T08:47:00Z',
    status_tag: 'BLOCKED',
    matched_medications: ['Pseudoephedrine'],
    solana_payload_hash: 'b2e9f4a1c6d3...',
    safety_flag_count: 1,
  },
  {
    id: 'scan-002',
    timestamp: '2026-05-28T21:30:00Z',
    status_tag: 'REVIEW_REQUIRED',
    matched_medications: [],
    solana_payload_hash: 'd5e8f3a2b7c4...',
    safety_flag_count: 0,
  },
  {
    id: 'scan-001',
    timestamp: '2026-05-28T08:15:00Z',
    status_tag: 'BLOCKED',
    matched_medications: ['Warfarin'],
    solana_payload_hash: 'c7d0e5f2a8b1...',
    safety_flag_count: 1,
  },
];
