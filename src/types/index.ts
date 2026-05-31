// Named aliases matching the Python Literals in Track B's contract
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

// Exactly the fields defined in CONTRACT.md — no extensions
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

// Frontend-only type (not part of the API contract)
export interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  status_tag: StatusTag;
  matched_medications: string[];
  solana_payload_hash: string;
  safety_flag_count: number;
}

export type DemoScenario =
  | 'happy_path'
  | 'contraindication'
  | 'lethal_interaction'
  | 'double_dose'
  | 'review_required';

export interface DoseLogEntry {
  id: string;
  medication_name: string;
  timestamp: string;
  solana_payload_hash: string;
}

export interface DocumentAskResponse {
  answer: string;
  relevant_excerpt: string;
}

export interface DocumentSummaryResponse {
  summary: string;
}
