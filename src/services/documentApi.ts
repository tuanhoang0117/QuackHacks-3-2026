import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { DocumentAskResponse, DocumentSummaryResponse } from '../types';
import { DEMO_MODE, API_BASE_URL } from './api';
import { getMockAnswer, MOCK_SUMMARY } from '../mocks/mockDocumentResponses';

export interface DocumentAskPayload {
  imageUri: string;
  question: string;
  patientId: string;
}

export interface DocumentSummaryPayload {
  imageUri: string;
  patientId: string;
}

export async function askDocumentQuestion(
  payload: DocumentAskPayload
): Promise<DocumentAskResponse> {
  if (DEMO_MODE) {
    await new Promise(res => setTimeout(res, 1200));
    return getMockAnswer(payload.question);
  }

  const form = new FormData();
  form.append('image', {
    uri: payload.imageUri,
    type: 'image/jpeg',
    name: 'document.jpg',
  } as unknown as Blob);
  form.append('question', payload.question);
  form.append('patient_id', payload.patientId);

  const response = await fetch(`${API_BASE_URL}/document/ask`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/document/ask error ${response.status}: ${text}`);
  }

  return response.json() as Promise<DocumentAskResponse>;
}

export async function getDocumentSummary(
  payload: DocumentSummaryPayload
): Promise<DocumentSummaryResponse> {
  if (DEMO_MODE) {
    await new Promise(res => setTimeout(res, 1600));
    return MOCK_SUMMARY;
  }

  const form = new FormData();
  form.append('image', {
    uri: payload.imageUri,
    type: 'image/jpeg',
    name: 'document.jpg',
  } as unknown as Blob);
  form.append('patient_id', payload.patientId);

  const response = await fetch(`${API_BASE_URL}/document/summary`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/document/summary error ${response.status}: ${text}`);
  }

  return response.json() as Promise<DocumentSummaryResponse>;
}

// Plays text via ElevenLabs /speak (live) or device TTS (demo).
// Returns a cleanup function to stop playback.
export async function speakText(
  text: string,
  onDone: () => void
): Promise<() => void> {
  if (!DEMO_MODE) {
    try {
      const response = await fetch(`${API_BASE_URL}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const tempUri = `${FileSystem.cacheDirectory}doc_tts_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(tempUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: tempUri },
          { shouldPlay: true }
        );
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.isLoaded && status.didJustFinish) {
            onDone();
            sound.unloadAsync();
          }
        });
        return () => { sound.unloadAsync(); onDone(); };
      }
    } catch {
      // fall through to TTS
    }
  }

  Speech.speak(text, {
    rate: 0.88,
    onDone,
    onError: onDone,
    onStopped: onDone,
  });
  return () => { Speech.stop(); onDone(); };
}
