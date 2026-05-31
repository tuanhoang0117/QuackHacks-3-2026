import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { DocumentAskResponse, DocumentSummaryResponse } from '../types';
import { DEMO_MODE, API_BASE_URL } from './api';
import { getMockAnswer, MOCK_SUMMARY } from '../mocks/mockDocumentResponses';

export interface AskPayload {
  question: string;
  clinicalContext: string;
  patientId: string;
}

export interface SummarizePayload {
  clinicalText: string;
}

async function playAudioBlob(blob: Blob, onDone: () => void): Promise<() => void> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const tempUri = `${FileSystem.cacheDirectory}tts_doc_${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(tempUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { sound } = await Audio.Sound.createAsync({ uri: tempUri }, { shouldPlay: true });
  sound.setOnPlaybackStatusUpdate(status => {
    if (status.isLoaded && status.didJustFinish) {
      onDone();
      sound.unloadAsync();
    }
  });
  return () => { sound.unloadAsync(); onDone(); };
}

// POST /document/summary — uploads image or PDF, returns extracted clinical text
export async function uploadDocumentForText(uri: string, mimeType: string): Promise<string> {
  if (DEMO_MODE) return MOCK_SUMMARY.summary;

  const form = new FormData();
  form.append('image', {
    uri,
    type: mimeType,
    name: mimeType === 'application/pdf' ? 'document.pdf' : 'document.jpg',
  } as unknown as Blob);
  form.append('patient_id', 'PT-9942');

  const response = await fetch(`${API_BASE_URL}/document/summary`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/document/summary error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return (data.clinical_text ?? data.summary ?? '') as string;
}

export async function askDocumentQuestion(
  payload: AskPayload,
  onDone: () => void
): Promise<{ answer: string; relevant_excerpt: string; stop: () => void }> {
  if (DEMO_MODE) {
    await new Promise(res => setTimeout(res, 1200));
    const { answer, relevant_excerpt } = getMockAnswer(payload.question);
    Speech.speak(answer, { rate: 0.88, onDone, onError: onDone, onStopped: onDone });
    return { answer, relevant_excerpt, stop: () => { Speech.stop(); onDone(); } };
  }

  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: payload.question,
      clinical_context: payload.clinicalContext,
      patient_id: payload.patientId,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/ask error ${response.status}: ${text}`);
  }

  const answer = response.headers.get('X-Answer-Text') ?? '';
  const stop = await playAudioBlob(await response.blob(), onDone);
  return { answer, relevant_excerpt: '', stop };
}

export async function getDocumentSummary(
  payload: SummarizePayload,
  onDone: () => void
): Promise<{ summary: string; stop: () => void }> {
  if (DEMO_MODE) {
    await new Promise(res => setTimeout(res, 1600));
    const { summary } = MOCK_SUMMARY;
    Speech.speak(summary, { rate: 0.88, onDone, onError: onDone, onStopped: onDone });
    return { summary, stop: () => { Speech.stop(); onDone(); } };
  }

  const response = await fetch(`${API_BASE_URL}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinical_text: payload.clinicalText }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/summarize error ${response.status}: ${text}`);
  }

  const summary = response.headers.get('X-Summary-Text') ?? '';
  const stop = await playAudioBlob(await response.blob(), onDone);
  return { summary, stop };
}
