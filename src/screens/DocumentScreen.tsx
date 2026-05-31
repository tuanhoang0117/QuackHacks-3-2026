import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { DocumentAskResponse } from '../types';
import { askDocumentQuestion, getDocumentSummary } from '../services/documentApi';
import { DEMO_MODE } from '../services/api';
import { MOCK_SUMMARY } from '../mocks/mockDocumentResponses';

type Phase = 'capture' | 'processing' | 'ready' | 'error';

const PROCESSING_STEPS = [
  'Uploading document…',
  'Extracting text (Gemini)…',
  'Building semantic index…',
  'Ready for questions',
];

const DEMO_IMAGE_URI = '';

export default function DocumentScreen() {
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('capture');
  const [showCamera, setShowCamera] = useState(false);
  const [docImageUri, setDocImageUri] = useState<string>('');
  const [clinicalText, setClinicalText] = useState<string>('');
  const [processingStep, setProcessingStep] = useState(0);
  const [question, setQuestion] = useState('');
  const [qaHistory, setQaHistory] = useState<{ q: string; a: DocumentAskResponse }[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const stopAudioRef = useRef<(() => void) | null>(null);

  const runProcessingAnimation = useCallback(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setProcessingStep(i);
      if (i >= PROCESSING_STEPS.length - 1) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, []);

  const stopAudio = useCallback(() => {
    if (stopAudioRef.current) {
      stopAudioRef.current();
      stopAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const processDocument = useCallback(async (uri: string) => {
    setDocImageUri(uri);
    setShowCamera(false);
    setPhase('processing');
    setProcessingStep(0);
    const stopAnim = runProcessingAnimation();

    try {
      await new Promise(res => setTimeout(res, 2200));
      stopAnim();
      setProcessingStep(PROCESSING_STEPS.length - 1);
      setClinicalText(MOCK_SUMMARY.summary);
      setPhase('ready');
    } catch {
      stopAnim();
      setPhase('error');
    }
  }, [runProcessingAnimation]);

  const handleScanDocument = useCallback(async () => {
    if (!camPermission?.granted) {
      await requestCamPermission();
      return;
    }
    setShowCamera(true);
  }, [camPermission, requestCamPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, exif: false });
      if (!photo?.uri) return;
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      await processDocument(resized.uri);
    } catch {
      setPhase('error');
    }
  }, [processDocument]);

  const handleUpload = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    await processDocument(result.assets[0].uri);
  }, [processDocument]);

  const handleAsk = useCallback(async () => {
    if (!question.trim() || isAsking) return;
    stopAudio();
    const q = question.trim();
    setQuestion('');
    setIsAsking(true);
    try {
      const { answer, relevant_excerpt, stop } = await askDocumentQuestion(
        { question: q, clinicalContext: clinicalText, patientId: 'PT-9942' },
        () => setIsSpeaking(false)
      );
      setQaHistory(prev => [{ q, a: { answer, relevant_excerpt } }, ...prev]);
      setIsSpeaking(true);
      stopAudioRef.current = stop;
    } catch {
      // show error inline
      setQaHistory(prev => [{
        q,
        a: { answer: 'Could not get an answer. Please try again.', relevant_excerpt: '' },
      }, ...prev]);
    } finally {
      setIsAsking(false);
    }
  }, [question, isAsking, clinicalText, stopAudio]);

  const handleSummary = useCallback(async () => {
    if (isSpeaking) { stopAudio(); return; }
    setIsSpeaking(true);
    try {
      const { stop } = await getDocumentSummary(
        { clinicalText },
        () => setIsSpeaking(false)
      );
      stopAudioRef.current = stop;
    } catch {
      setIsSpeaking(false);
    }
  }, [isSpeaking, clinicalText, stopAudio]);

  const handleReset = useCallback(() => {
    stopAudio();
    setPhase('capture');
    setDocImageUri('');
    setClinicalText('');
    setQaHistory([]);
    setQuestion('');
    setProcessingStep(0);
  }, [stopAudio]);

  // ── Camera overlay ─────────────────────────────────────────────────────────
  if (showCamera) {
    return (
      <View style={styles.cameraFull}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.cameraHintRow}>
          <Text style={styles.cameraHintText}>Frame the document clearly</Text>
        </View>
        <View style={styles.cameraButtonRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCamera(false)}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={{ width: 72 }} />
        </View>
      </View>
    );
  }

  // ── Processing phase ───────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.processingTitle}>Reading Document</Text>
        <View style={styles.stepsContainer}>
          {PROCESSING_STEPS.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              {i <= processingStep ? (
                <Ionicons
                  name={i < processingStep ? 'checkmark-circle' : 'ellipse'}
                  size={14}
                  color={i < processingStep ? Colors.verified : Colors.primary}
                />
              ) : (
                <Ionicons name="ellipse-outline" size={14} color={Colors.textLight} />
              )}
              <Text style={[styles.stepText, i <= processingStep && styles.stepTextActive]}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Error phase ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle" size={52} color={Colors.blocked} />
        <Text style={styles.errorTitle}>Processing Failed</Text>
        <Text style={styles.errorDetail}>Could not read the document. Try again with better lighting.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleReset}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Capture phase ──────────────────────────────────────────────────────────
  if (phase === 'capture') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.captureContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroIcon}>
            <Ionicons name="document-text" size={64} color={Colors.primary} />
          </View>
          <Text style={styles.captureTitle}>Scan a Discharge Summary</Text>
          <Text style={styles.captureSubtitle}>
            Capture or upload a discharge document to ask questions and hear a full summary read aloud.
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={handleScanDocument} activeOpacity={0.85}>
            <Ionicons name="camera" size={20} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Scan Document</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleUpload} activeOpacity={0.85}>
            <Ionicons name="image-outline" size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Upload from Library</Text>
          </TouchableOpacity>

          {DEMO_MODE && (
            <TouchableOpacity
              style={styles.demoSkipButton}
              onPress={() => processDocument(DEMO_IMAGE_URI)}
              activeOpacity={0.85}
            >
              <Ionicons name="flask-outline" size={16} color="#7B1FA2" />
              <Text style={styles.demoSkipText}>Demo: Use Sample Discharge Summary</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Ready phase (Q&A) ──────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.readyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Document preview */}
          {docImageUri ? (
            <Image source={{ uri: docImageUri }} style={styles.docThumb} resizeMode="cover" />
          ) : (
            <View style={styles.docThumbPlaceholder}>
              <Ionicons name="document-text" size={40} color={Colors.primary} />
              <Text style={styles.docThumbPlaceholderText}>Marcus Vance — Discharge Summary</Text>
            </View>
          )}

          {/* Summary button */}
          <TouchableOpacity
            style={[styles.summaryButton, isSpeaking && styles.summaryButtonActive]}
            onPress={handleSummary}
            activeOpacity={0.85}
          >
            <Ionicons name={isSpeaking ? 'stop-circle' : 'volume-high'} size={20} color={Colors.white} />
            <Text style={styles.summaryButtonText}>
              {isSpeaking ? 'Stop Audio' : 'Hear Full Summary'}
            </Text>
          </TouchableOpacity>

          {/* Q&A input */}
          <View style={styles.qaCard}>
            <Text style={styles.qaLabel}>Ask a Question</Text>
            <TextInput
              style={styles.qaInput}
              value={question}
              onChangeText={setQuestion}
              placeholder="e.g. What medications did Marcus take home?"
              placeholderTextColor={Colors.textLight}
              returnKeyType="send"
              onSubmitEditing={handleAsk}
              editable={!isAsking}
            />
            <TouchableOpacity
              style={[styles.askButton, (isAsking || !question.trim()) && styles.askButtonDisabled]}
              onPress={handleAsk}
              disabled={isAsking || !question.trim()}
              activeOpacity={0.85}
            >
              {isAsking ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="send" size={18} color={Colors.white} />
              )}
              <Text style={styles.askButtonText}>{isAsking ? 'Asking…' : 'Ask'}</Text>
            </TouchableOpacity>
          </View>

          {/* Q&A history */}
          {qaHistory.map(({ q, a }, i) => (
            <View key={i} style={styles.answerCard}>
              <Text style={styles.answerQuestion}>Q: {q}</Text>
              <Text style={styles.answerText}>{a.answer}</Text>
              {a.relevant_excerpt ? (
                <Text style={styles.answerExcerpt}>"{a.relevant_excerpt}"</Text>
              ) : null}
            </View>
          ))}

          <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.85}>
            <Ionicons name="refresh" size={16} color={Colors.textSecondary} />
            <Text style={styles.resetButtonText}>Scan New Document</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 14, backgroundColor: Colors.background,
  },

  // Camera
  cameraFull: { flex: 1, backgroundColor: '#000' },
  cameraHintRow: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
  cameraHintText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  cameraButtonRow: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 36,
  },
  cancelButton: { padding: 12 },
  cancelButtonText: { color: Colors.white, fontSize: 16 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.white },

  // Processing
  processingTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 8 },
  stepsContainer: { width: '100%', gap: 8, marginTop: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepText: { fontSize: 13, color: Colors.textLight },
  stepTextActive: { color: Colors.text },

  // Error
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  errorDetail: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },

  // Capture
  captureContent: { padding: 24, alignItems: 'center', gap: 16, paddingBottom: 40 },
  heroIcon: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  captureTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  captureSubtitle: {
    fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 8,
  },

  primaryButton: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 15, paddingHorizontal: 28,
    borderRadius: 12, width: '100%',
  },
  primaryButtonText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1.5, borderColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 12, width: '100%',
  },
  secondaryButtonText: { color: Colors.primary, fontSize: 15, fontWeight: '600' },
  demoSkipButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3E5F5', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#CE93D8', marginTop: 4,
  },
  demoSkipText: { color: '#7B1FA2', fontSize: 12, fontWeight: '600' },

  // Ready / Q&A
  readyContent: { padding: 16, gap: 14, paddingBottom: 32 },
  docThumb: { width: '100%', height: 180, borderRadius: 12 },
  docThumbPlaceholder: {
    width: '100%', height: 120, borderRadius: 12,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  docThumbPlaceholderText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  summaryButton: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 12,
  },
  summaryButtonActive: { backgroundColor: Colors.textSecondary },
  summaryButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  qaCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, gap: 10,
    shadowColor: Colors.black, shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  qaLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  qaInput: {
    backgroundColor: Colors.background, borderRadius: 8, padding: 12,
    fontSize: 14, color: Colors.text, borderWidth: 1, borderColor: Colors.border, minHeight: 44,
  },
  askButton: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10,
  },
  askButtonDisabled: { backgroundColor: Colors.border },
  askButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  answerCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, gap: 8,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
    shadowColor: Colors.black, shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  answerQuestion: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  answerText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  answerExcerpt: {
    fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic',
    borderLeftWidth: 2, borderLeftColor: Colors.border, paddingLeft: 8, lineHeight: 18,
  },

  resetButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  resetButtonText: { fontSize: 13, color: Colors.textSecondary },
});
