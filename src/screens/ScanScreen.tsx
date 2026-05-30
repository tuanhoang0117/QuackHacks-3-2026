import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { ReconciliationResult, DemoScenario } from '../types';
import { submitScan, fetchSpeechAudioUri, DEMO_MODE } from '../services/api';
import { DEMO_SCENARIO_LABELS } from '../mocks/mockScenarios';
import VerdictBanner from '../components/VerdictBanner';
import SafetyFlagCard from '../components/SafetyFlagCard';

type Phase = 'ready' | 'loading' | 'result' | 'error';

const DEMO_SCENARIOS = Object.entries(DEMO_SCENARIO_LABELS) as [DemoScenario, string][];

const SAMPLE_CLINICAL_TEXT = `DISCHARGE MEDICATION RECONCILIATION
Patient: Marcus Vance  (PT-9942)
Prescribing Physician: Dr. A. Thornton

MEDICATIONS TO TAKE AT HOME:
1. Warfarin 5mg — Take one tablet daily (anticoagulant)
2. Metronidazole 500mg — Take one tablet twice daily for 7 days (antibiotic)
3. Lisinopril 10mg — Continue daily (blood pressure)

Follow up in 2 weeks. Do not miss doses.`;

const LOADING_STEPS = [
  'Blur gate check (OpenCV)...',
  'Object detection & bounding boxes...',
  'Reading labels via Gemini 2.5 Flash...',
  'Checking drug–drug interactions (MongoDB)...',
  'Checking contraindications...',
  'Checking dose timing (dose_log)...',
  'Computing SHA-256 audit hash...',
  'Writing memo to Solana Devnet...',
];

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const [phase, setPhase] = useState<Phase>('ready');
  const [selectedDemo, setSelectedDemo] = useState<DemoScenario>('lethal_interaction');
  const [clinicalText, setClinicalText] = useState(SAMPLE_CLINICAL_TEXT);
  const [showClinical, setShowClinical] = useState(false);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const runLoadingAnimation = useCallback(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setLoadingStep(i);
      if (i >= LOADING_STEPS.length - 1) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const stopAudio = useCallback(async () => {
    await Speech.stop();
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const handleAnalyze = useCallback(async () => {
    setPhase('loading');
    setResult(null);
    setLoadingStep(0);
    const stopAnimation = runLoadingAnimation();

    try {
      let imageUri = '';

      if (!DEMO_MODE && permission?.granted && cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.6,
          exif: false,
        });
        if (photo?.uri) {
          const resized = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: 640 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          imageUri = resized.uri;
        }
      }

      // POST /verify with multipart/form-data (see CONTRACT.md)
      const res = await submitScan(
        { imageUri, clinicalText, patientId: 'PT-9942' },
        selectedDemo
      );

      stopAnimation();
      setResult(res);
      setPhase('result');
    } catch {
      stopAnimation();
      setPhase('error');
    }
  }, [permission, clinicalText, selectedDemo, runLoadingAnimation]);

  const handleSpeak = useCallback(async () => {
    if (!result) return;

    if (isSpeaking) {
      await stopAudio();
      return;
    }

    if (!DEMO_MODE) {
      try {
        // /speak returns audio/mpeg — fetched, cached to disk, played via expo-av
        const tempUri = await fetchSpeechAudioUri({ text: result.status_speech });
        if (tempUri) {
          setIsSpeaking(true);
          const { sound } = await Audio.Sound.createAsync(
            { uri: tempUri },
            { shouldPlay: true }
          );
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate(status => {
            if (status.isLoaded && status.didJustFinish) {
              setIsSpeaking(false);
              sound.unloadAsync();
              soundRef.current = null;
            }
          });
          return;
        }
      } catch {
        // Fall through to device TTS
      }
    }

    // Demo mode (or live-mode fallback): device TTS
    setIsSpeaking(true);
    Speech.speak(result.status_speech, {
      rate: 0.88,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  }, [result, isSpeaking, stopAudio]);

  const handleReset = useCallback(async () => {
    await stopAudio();
    setPhase('ready');
    setResult(null);
    setLoadingStep(0);
  }, [stopAudio]);

  // ── Error phase ────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle" size={52} color={Colors.blocked} />
        <Text style={styles.errorTitle}>Analysis Failed</Text>
        <Text style={styles.errorDetail}>
          Could not reach the verification server. Check your connection and try again.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={handleReset}>
          <Text style={styles.permButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Permission gate (live mode only) ──────────────────────────────────────
  if (!DEMO_MODE) {
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={52} color={Colors.textSecondary} />
          <Text style={styles.permText}>Camera access is required to scan medications.</Text>
          <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
            <Text style={styles.permButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  // ── Loading phase ──────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingTitle}>Analyzing</Text>
        <Text style={styles.loadingSubtitle}>Running deterministic safety pipeline</Text>
        <View style={styles.loadingSteps}>
          {LOADING_STEPS.map((step, i) => (
            <View key={i} style={styles.loadingStepRow}>
              {i <= loadingStep ? (
                <Ionicons
                  name={i < loadingStep ? 'checkmark-circle' : 'ellipse'}
                  size={13}
                  color={i < loadingStep ? Colors.verified : Colors.primary}
                />
              ) : (
                <Ionicons name="ellipse-outline" size={13} color={Colors.textLight} />
              )}
              <Text style={[styles.loadingStepText, i <= loadingStep && styles.loadingStepActive]}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Result phase ───────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          <VerdictBanner result={result} />

          {/* Mandatory human-review banner (CONTRACT.md UI Rendering Rules) */}
          {result.requires_human_review && (
            <View style={styles.reviewWarning}>
              <Ionicons name="warning" size={20} color={Colors.review} />
              <View style={styles.reviewWarningText}>
                <Text style={styles.reviewWarningTitle}>
                  System Confidence Low: Human Verification Required
                </Text>
                <Text style={styles.reviewWarningDetail}>{result.review_reason}</Text>
              </View>
            </View>
          )}

          {/* Safety Flags */}
          {result.safety_flags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Safety Flags ({result.safety_flags.length})
              </Text>
              {result.safety_flags.map((flag, i) => (
                <SafetyFlagCard key={i} flag={flag} />
              ))}
            </View>
          )}

          {/* Matched Medications */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Medications Identified
              {result.matched_medications.length > 0
                ? ` (${result.matched_medications.length})`
                : ' — none confirmed'}
            </Text>
            {result.matched_medications.length === 0 ? (
              <Text style={styles.noMedsText}>No medications confirmed from labels.</Text>
            ) : (
              result.matched_medications.map((med, i) => (
                <View key={i} style={styles.medRow}>
                  <Ionicons name="medical" size={13} color={Colors.primary} />
                  <Text style={styles.medName}>{med}</Text>
                </View>
              ))
            )}
          </View>

          {/* Audio — ElevenLabs in live mode, device TTS in demo mode */}
          <TouchableOpacity
            style={[styles.audioButton, isSpeaking && styles.audioButtonActive]}
            onPress={handleSpeak}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isSpeaking ? 'stop-circle' : 'volume-high'}
              size={20}
              color={Colors.white}
            />
            <Text style={styles.audioButtonText}>
              {isSpeaking ? 'Stop Audio' : 'Play Status Alert'}
              {DEMO_MODE ? ' (Device TTS)' : ' (ElevenLabs)'}
            </Text>
          </TouchableOpacity>

          {/* Solana Audit Trail — hash only per CONTRACT.md */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Solana Audit Trail</Text>
            <Text style={styles.hashLabel}>SHA-256 Event Hash (no PHI)</Text>
            <Text style={styles.hashValue} selectable>{result.solana_payload_hash}</Text>
          </View>

          {/* Alert Transcript */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alert Transcript</Text>
            <Text style={styles.speechText}>{result.status_speech}</Text>
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color={Colors.white} />
            <Text style={styles.resetButtonText}>New Scan</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Ready / camera phase ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.cameraContainer}>
        {DEMO_MODE ? (
          <View style={styles.demoPlaceholder}>
            <Ionicons name="scan" size={56} color="rgba(255,255,255,0.5)" />
            <Text style={styles.demoPlaceholderTitle}>Demo Mode Active</Text>
            <Text style={styles.demoPlaceholderSub}>No camera required — select a scenario below</Text>
          </View>
        ) : (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back">
            <View style={styles.cameraFrame}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
            <View style={styles.cameraHint}>
              <Text style={styles.cameraHintText}>Frame pill tray within the guides</Text>
            </View>
          </CameraView>
        )}
      </View>

      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {DEMO_MODE && (
          <View style={styles.demoSelector}>
            <Text style={styles.controlLabel}>Demo Scenario</Text>
            {DEMO_SCENARIOS.map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.scenarioRow, selectedDemo === key && styles.scenarioRowSelected]}
                onPress={() => setSelectedDemo(key)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, selectedDemo === key && styles.radioSelected]}>
                  {selectedDemo === key && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.scenarioText, selectedDemo === key && styles.scenarioTextSelected]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.clinicalToggle}
          onPress={() => setShowClinical(v => !v)}
          activeOpacity={0.8}
        >
          <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
          <Text style={styles.clinicalToggleText}>
            {showClinical ? 'Hide' : 'Edit'} Clinical Document Text
          </Text>
          <Ionicons
            name={showClinical ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.primary}
          />
        </TouchableOpacity>

        {showClinical && (
          <TextInput
            style={styles.clinicalInput}
            multiline
            numberOfLines={6}
            value={clinicalText}
            onChangeText={setClinicalText}
            placeholder="Paste discharge summary or prescription text…"
            placeholderTextColor={Colors.textLight}
            textAlignVertical="top"
          />
        )}

        <TouchableOpacity style={styles.analyzeButton} onPress={handleAnalyze} activeOpacity={0.88}>
          <Ionicons name="shield-checkmark" size={22} color={Colors.white} />
          <Text style={styles.analyzeButtonText}>
            {DEMO_MODE ? 'Run Demo Scenario' : 'Capture & Analyze'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const CORNER_SIZE = 20;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 16, backgroundColor: Colors.background,
  },
  permText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  errorDetail: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  permButton: {
    backgroundColor: Colors.primary, paddingHorizontal: 24,
    paddingVertical: 12, borderRadius: 8,
  },
  permButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 10, backgroundColor: Colors.background,
  },
  loadingTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginTop: 8 },
  loadingSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  loadingSteps: { width: '100%', gap: 6 },
  loadingStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingStepText: { fontSize: 13, color: Colors.textLight },
  loadingStepActive: { color: Colors.text },

  cameraContainer: { height: 220, backgroundColor: '#0a0f1e', overflow: 'hidden' },
  cameraFrame: { flex: 1, margin: 32, position: 'relative' },
  cornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderColor: Colors.white,
  },
  cornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderColor: Colors.white,
  },
  cornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderColor: Colors.white,
  },
  cornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderColor: Colors.white,
  },
  cameraHint: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
  cameraHintText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  demoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  demoPlaceholderTitle: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  demoPlaceholderSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },

  controls: { flex: 1 },
  controlsContent: { padding: 14, gap: 12, paddingBottom: 24 },
  controlLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },

  demoSelector: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, gap: 6,
    shadowColor: Colors.black, shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  scenarioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8,
  },
  scenarioRowSelected: { backgroundColor: '#EEF2FF' },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: Colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  scenarioText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  scenarioTextSelected: { color: Colors.primary, fontWeight: '600' },

  clinicalToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.card, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  clinicalToggleText: { flex: 1, fontSize: 13, color: Colors.primary, fontWeight: '600' },
  clinicalInput: {
    backgroundColor: Colors.card, borderRadius: 10, padding: 12,
    fontSize: 12, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
    minHeight: 120, fontFamily: 'monospace', lineHeight: 18,
  },

  analyzeButton: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 12,
  },
  analyzeButtonText: { color: Colors.white, fontSize: 16, fontWeight: '800' },

  resultContent: { padding: 16, gap: 14, paddingBottom: 32 },

  reviewWarning: {
    flexDirection: 'row', gap: 10, backgroundColor: Colors.reviewLight,
    borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: Colors.reviewBorder,
    alignItems: 'flex-start',
  },
  reviewWarningText: { flex: 1, gap: 2 },
  reviewWarningTitle: { fontSize: 13, fontWeight: '700', color: Colors.review },
  reviewWarningDetail: { fontSize: 12, color: Colors.review, lineHeight: 17 },

  section: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14, gap: 10,
    shadowColor: Colors.black, shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  medRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medName: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  noMedsText: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  audioButton: {
    backgroundColor: Colors.primaryLight, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12,
  },
  audioButtonActive: { backgroundColor: Colors.textSecondary },
  audioButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  hashLabel: { fontSize: 11, color: Colors.textSecondary },
  hashValue: {
    fontSize: 11, color: Colors.text, fontFamily: 'monospace',
    backgroundColor: '#F5F5F5', borderRadius: 6, padding: 8, lineHeight: 16,
  },

  speechText: { fontSize: 13, color: Colors.text, lineHeight: 20, fontStyle: 'italic' },

  resetButton: {
    backgroundColor: Colors.primaryDark, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12,
  },
  resetButtonText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
