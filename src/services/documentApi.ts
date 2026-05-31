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
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
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

// POST /document/ocr — uploads image or PDF, returns extracted clinical text only (no summary)
export async function uploadDocumentForText(uri: string, mimeType: string): Promise<string> {
  if (DEMO_MODE) return MOCK_SUMMARY.summary;

  const form = new FormData();
  form.append('image', {
    uri,
    type: mimeType,
    name: mimeType === 'application/pdf' ? 'document.pdf' : 'document.jpg',
  } as unknown as Blob);
  form.append('patient_id', 'PT-9942');

  const response = await fetch(`${API_BASE_URL}/document/ocr`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`/document/ocr error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return (data.clinical_text ?? '') as string;
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

  const body = JSON.stringify({
    question: payload.question,
    clinical_context: payload.clinicalContext,
    patient_id: payload.patientId,
  });

  // Try ElevenLabs audio first; fall back to text-only + expo-speech
  try {
    const response = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!response.ok) throw new Error(`/ask ${response.status}`);
    const answer = response.headers.get('X-Answer-Text') ?? '';
    const stop = await playAudioBlob(await response.blob(), onDone);
    return { answer, relevant_excerpt: '', stop };
  } catch {
    const textRes = await fetch(`${API_BASE_URL}/ask/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!textRes.ok) {
      const msg = await textRes.text().catch(() => '');
      throw new Error(`/ask/text ${textRes.status}: ${msg}`);
    }
    const { answer } = await textRes.json() as { answer: string };
    Speech.speak(answer, { rate: 0.88, onDone, onError: onDone, onStopped: onDone });
    return { answer, relevant_excerpt: '', stop: () => { Speech.stop(); onDone(); } };
  }
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

  // Step 1: Get summary text from Gemini only (no ElevenLabs, no timeout risk)
  const textRes = await fetch(`${API_BASE_URL}/summarize/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clinical_text: payload.clinicalText }),
  });
  if (!textRes.ok) {
    const msg = await textRes.text().catch(() => '');
    throw new Error(`/summarize/text ${textRes.status}: ${msg}`);
  }
  const { summary } = await textRes.json() as { summary: string };

  // Step 2: Speak via /speak — same endpoint scan screen uses, proven reliable
  try {
    const speakRes = await fetch(`${API_BASE_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summary }),
    });
    if (!speakRes.ok) throw new Error(`/speak ${speakRes.status}`);
    const stop = await playAudioBlob(await speakRes.blob(), onDone);
    return { summary, stop };
  } catch {
    Speech.speak(summary, { rate: 0.88, onDone, onError: onDone, onStopped: onDone });
    return { summary, stop: () => { Speech.stop(); onDone(); } };
  }
}
