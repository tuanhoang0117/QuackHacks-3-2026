import * as FileSystem from 'expo-file-system/legacy';
import { ReconciliationResult, SpeakRequest, DemoScenario } from '../types';
import { MOCK_SCENARIOS } from '../mocks/mockScenarios';

// Flip to false when Track B's FastAPI server is running at API_BASE_URL
export const DEMO_MODE = false;

export const API_BASE_URL = 'http://172.20.10.3:8000';

export interface ScanPayload {
  imageUri: string;     // local URI from CameraView / ImageManipulator
  clinicalText: string;
  patientId: string;
}

// POST /verify  (multipart/form-data per CONTRACT.md)
export async function submitScan(
  payload: ScanPayload,
  demoScenario: DemoScenario = 'happy_path'
): Promise<ReconciliationResult> {
  if (DEMO_MODE) {
    await new Promise(res => setTimeout(res, 1800));
    return MOCK_SCENARIOS[demoScenario];
  }

  const form = new FormData();
  form.append('image', {
    uri: payload.imageUri,
    type: 'image/jpeg',
    name: 'scan.jpg',
  } as unknown as Blob);
  form.append('clinical_text', payload.clinicalText);
  form.append('patient_id', payload.patientId);

  // Do NOT set Content-Type manually — fetch sets the multipart boundary automatically
  const response = await fetch(`${API_BASE_URL}/verify`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/verify error ${response.status}: ${text}`);
  }

  return response.json() as Promise<ReconciliationResult>;
}

// DELETE /log-dose/:patient_id  — wipes the backend dose_log for the patient (called on app launch)
export async function clearBackendDoses(patientId: string): Promise<void> {
  if (DEMO_MODE) return;
  try {
    await fetch(`${API_BASE_URL}/log-dose/${patientId}`, { method: 'DELETE' });
  } catch {
    // Non-fatal — backend may not be reachable
  }
}

// POST /log-dose  — informs the backend dose_log so /verify can catch too_soon on next scan
export async function logDoseToBackend(
  medicationName: string,
  timestamp: string
): Promise<void> {
  if (DEMO_MODE) return;
  try {
    await fetch(`${API_BASE_URL}/log-dose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: 'PT-9942', medication_name: medicationName, timestamp }),
    });
  } catch {
    // Non-fatal — local AsyncStorage log is the source of truth for the UI
  }
}

// POST /speak  (CONTRACT.md: returns audio/mpeg binary stream)
// Saves the stream to a temp file and returns the local URI for expo-av.
// In DEMO_MODE returns '' — callers fall back to expo-speech device TTS.
export async function fetchSpeechAudioUri(body: SpeakRequest): Promise<string> {
  if (DEMO_MODE) return '';

  const response = await fetch(`${API_BASE_URL}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`/speak error ${response.status}`);
  }

  // Read as base64 via FileReader, then write to a cache file for expo-av
  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const tempUri = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(tempUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return tempUri;
}
