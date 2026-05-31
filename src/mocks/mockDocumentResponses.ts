import { DocumentAskResponse, DocumentSummaryResponse } from '../types';

export const MOCK_SUMMARY: DocumentSummaryResponse = {
  summary:
    'This is a discharge medication reconciliation for Marcus Vance, patient PT-9942, ' +
    'under the care of Dr. A. Thornton. ' +
    'Marcus has been prescribed three medications to take at home. ' +
    'First, Warfarin 5 milligrams — one tablet daily as an anticoagulant. ' +
    'Second, Metronidazole 500 milligrams — one tablet twice daily for 7 days as an antibiotic. ' +
    'Third, Lisinopril 10 milligrams — continue daily for blood pressure management. ' +
    'A follow-up appointment is scheduled in two weeks. Marcus must not miss any doses.',
};

export const MOCK_QA_RESPONSES: Record<string, DocumentAskResponse> = {
  default: {
    answer:
      'Based on the discharge summary, Marcus Vance has been prescribed Warfarin 5mg daily, ' +
      'Metronidazole 500mg twice daily for 7 days, and Lisinopril 10mg daily. ' +
      'A follow-up is scheduled in two weeks.',
    relevant_excerpt: 'MEDICATIONS TO TAKE AT HOME: Warfarin 5mg, Metronidazole 500mg, Lisinopril 10mg.',
  },
  warfarin: {
    answer:
      'Warfarin 5 milligrams is prescribed once daily as a blood thinner, also known as an anticoagulant. ' +
      'It should be taken consistently at the same time each day.',
    relevant_excerpt: '1. Warfarin 5mg — Take one tablet daily (anticoagulant)',
  },
  metronidazole: {
    answer:
      'Metronidazole 500 milligrams is prescribed twice daily for a 7-day course as an antibiotic ' +
      'to treat a bacterial infection.',
    relevant_excerpt: '2. Metronidazole 500mg — Take one tablet twice daily for 7 days (antibiotic)',
  },
  lisinopril: {
    answer:
      'Lisinopril 10 milligrams should be continued daily. It is a blood pressure medication that ' +
      'Marcus was already taking before admission.',
    relevant_excerpt: '3. Lisinopril 10mg — Continue daily (blood pressure)',
  },
  followup: {
    answer:
      'Marcus has a follow-up appointment scheduled in two weeks with Dr. A. Thornton. ' +
      'He must not miss any doses of his prescribed medications in the meantime.',
    relevant_excerpt: 'Follow up in 2 weeks. Do not miss doses.',
  },
};

export function getMockAnswer(question: string): DocumentAskResponse {
  const q = question.toLowerCase();
  if (q.includes('warfarin') || q.includes('blood thinner')) return MOCK_QA_RESPONSES.warfarin;
  if (q.includes('metronidazole') || q.includes('antibiotic')) return MOCK_QA_RESPONSES.metronidazole;
  if (q.includes('lisinopril') || q.includes('blood pressure')) return MOCK_QA_RESPONSES.lisinopril;
  if (q.includes('follow') || q.includes('appointment')) return MOCK_QA_RESPONSES.followup;
  return MOCK_QA_RESPONSES.default;
}
