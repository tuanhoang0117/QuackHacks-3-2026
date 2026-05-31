export interface DosingInfo {
  displayName: string;
  instructions: string;
  intervalHours: number;
}

export const DOSING_SCHEDULE: Record<string, DosingInfo> = {
  warfarin:        { displayName: 'Warfarin 5mg',        instructions: 'Take one tablet daily',                intervalHours: 24 },
  metronidazole:   { displayName: 'Metronidazole 500mg', instructions: 'Take one tablet twice daily × 7 days', intervalHours: 12 },
  lisinopril:      { displayName: 'Lisinopril 10mg',     instructions: 'Continue once daily',                  intervalHours: 24 },
  pseudoephedrine: { displayName: 'Pseudoephedrine',     instructions: 'Take as directed (OTC)',               intervalHours: 6  },
};

export function findDosingInfo(medName: string): DosingInfo | null {
  const lower = medName.toLowerCase();
  for (const [key, info] of Object.entries(DOSING_SCHEDULE)) {
    if (lower.includes(key)) return info;
  }
  return null;
}

export function findDosingKey(info: DosingInfo): string {
  return Object.entries(DOSING_SCHEDULE).find(([, v]) => v === info)?.[0] ?? '';
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}
