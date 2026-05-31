import * as FileSystem from 'expo-file-system/legacy';
import { DemoScenario } from '../types';

const MED_TO_SCENARIO: Record<string, DemoScenario> = {
  lisinopril:      'happy_path',
  metronidazole:   'lethal_interaction',
  warfarin:        'double_dose',
  pseudoephedrine: 'contraindication',
};

export async function identifyMedication(imageUri: string): Promise<DemoScenario> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  console.log('[MedRecog] API key present:', !!apiKey, '| URI:', imageUri?.slice(-40));
  if (!imageUri || !apiKey) {
    console.log('[MedRecog] Missing key or URI — returning review_required');
    return 'review_required';
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    console.log('[MedRecog] base64 length:', base64.length);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'Read all text visible in this image. Does the text include any of these drug names: warfarin, metronidazole, lisinopril, or pseudoephedrine? Reply with only the matching word in lowercase, or "unknown" if none of those words appear.',
              },
              {
                inline_data: { mime_type: 'image/jpeg', data: base64 },
              },
            ],
          }],
          generationConfig: { maxOutputTokens: 20 },
        }),
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log('[MedRecog] API error', response.status, errText);
      return 'review_required';
    }

    const data = await response.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() ?? '';
    console.log('[MedRecog] Gemini response:', text);

    for (const [med, scenario] of Object.entries(MED_TO_SCENARIO)) {
      if (text.includes(med)) {
        console.log('[MedRecog] Matched:', med, '→', scenario);
        return scenario;
      }
    }
    console.log('[MedRecog] No match → review_required');
    return 'review_required';
  } catch (err) {
    console.log('[MedRecog] Exception:', err);
    return 'review_required';
  }
}
