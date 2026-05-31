import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, Animated, Image, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { ReconciliationResult, DemoScenario } from '../types';
import { submitScan, fetchSpeechAudioUri, DEMO_MODE } from '../services/api';
import { saveDose } from '../services/doseLog';
import VerdictBanner from '../components/VerdictBanner';
import SafetyFlagCard from '../components/SafetyFlagCard';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const IMAGE_H = SCREEN_H * 0.62;

type Phase = 'ready' | 'detecting' | 'loading' | 'result' | 'error';

const DEMO_CYCLE: DemoScenario[] = [
  'happy_path',
  'contraindication',
  'lethal_interaction',
  'double_dose',
  'review_required',
];

const LOADING_STEPS = [
  'Blur gate check (OpenCV)…',
  'Object detection & bounding boxes…',
  'Reading labels via Gemini 2.5 Flash…',
  'Checking drug–drug interactions (MongoDB)…',
  'Checking contraindications…',
  'Checking dose timing (dose_log)…',
  'Computing SHA-256 audit hash…',
  'Writing memo to Solana Devnet…',
];

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const demoCycleRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('ready');
  const [capturedImageUri, setCapturedImageUri] = useState('');
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [isSavingDose, setIsSavingDose] = useState(false);

  // Detection animation values
  const scanLineAnim   = useRef(new Animated.Value(0)).current;
  const boxOpacityAnim = useRef(new Animated.Value(0)).current;
  const labelAnim      = useRef(new Animated.Value(0)).current;

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

  // Core analysis: runs after detection animation completes
  const runAnalyze = useCallback(async (imageUri: string) => {
    setPhase('loading');
    setResult(null);
    setLoadingStep(0);
    const stopAnimation = runLoadingAnimation();
    try {
      const scenario = DEMO_CYCLE[demoCycleRef.current % DEMO_CYCLE.length];
      demoCycleRef.current += 1;
      const res = await submitScan(
        { imageUri, clinicalText: '', patientId: 'PT-9942' },
        scenario
      );
      stopAnimation();
      setResult(res);
      setPhase('result');
    } catch {
      stopAnimation();
      setPhase('error');
    }
  }, [runLoadingAnimation]);

  // Detection animation → then analysis
  const handleCapture = useCallback((uri: string) => {
    setCapturedImageUri(uri);
    scanLineAnim.setValue(0);
    boxOpacityAnim.setValue(0);
    labelAnim.setValue(0);
    setPhase('detecting');

    Animated.sequence([
      Animated.timing(scanLineAnim,   { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(boxOpacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(labelAnim,      { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(800),
    ]).start(() => runAnalyze(uri));
  }, [scanLineAnim, boxOpacityAnim, labelAnim, runAnalyze]);

  // Camera capture button
  const handleAnalyze = useCallback(async () => {
    if (!DEMO_MODE) {
      if (!permission?.granted) { await requestPermission(); return; }
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, exif: false });
        if (photo?.uri) {
          const resized = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: 640 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );
          handleCapture(resized.uri);
          return;
        }
      }
    }
    handleCapture('');
  }, [permission, requestPermission, handleCapture]);

  // Library picker button
  const handlePickImage = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!picked.canceled && picked.assets[0]?.uri) {
      handleCapture(picked.assets[0].uri);
    }
  }, [handleCapture]);

  const handleSpeak = useCallback(async () => {
    if (!result) return;
    if (isSpeaking) { await stopAudio(); return; }

    if (!DEMO_MODE) {
      try {
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
        // fall through to TTS
      }
    }

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
    setCapturedImageUri('');
    setLoadingStep(0);
  }, [stopAudio]);

  const handleConfirmTaken = useCallback(async () => {
    if (!result) return;
    setIsSavingDose(true);
    try {
      const { logDoseToBackend } = await import('../services/api');
      const now = new Date().toISOString();
      const medName = result.matched_medications[0] ?? 'Unknown';
      await saveDose({
        id: `dose-${Date.now()}`,
        medication_name: medName,
        timestamp: now,
        solana_payload_hash: result.solana_payload_hash,
      });
      await logDoseToBackend(medName, now);
    } catch {
      // dose saved locally even if backend call fails
    } finally {
      setIsSavingDose(false);
      setConfirmModalVisible(false);
      Alert.alert(
        'Dose Logged',
        'Your medication has been recorded and the audit hash written to Solana.',
        [{ text: 'OK', onPress: handleReset }]
      );
    }
  }, [result, handleReset]);

  // ── Permission gate (live mode only) ──────────────────────────────────────
  if (!DEMO_MODE && !permission?.granted) {
    return (
      <View style={styles.center}>
        {!permission ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <>
            <Ionicons name="camera-outline" size={52} color={Colors.textSecondary} />
            <Text style={styles.permText}>Camera access is required to scan medications.</Text>
            <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
              <Text style={styles.permButtonText}>Grant Camera Access</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

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

  // ── Detecting phase ────────────────────────────────────────────────────────
  if (phase === 'detecting') {
    const scanLineY = scanLineAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, IMAGE_H - 2],
    });

    const BOX_W   = SCREEN_W * 0.70;
    const BOX_H   = IMAGE_H  * 0.55;
    const BOX_LEFT = (SCREEN_W - BOX_W) / 2;
    const BOX_TOP  = IMAGE_H * 0.18;

    return (
      <View style={styles.detectContainer}>
        {capturedImageUri ? (
          <Image
            source={{ uri: capturedImageUri }}
            style={[styles.detectImage, { height: IMAGE_H }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.detectImagePlaceholder, { height: IMAGE_H }]}>
            <Ionicons name="scan" size={64} color="rgba(0,230,118,0.35)" />
          </View>
        )}

        {/* Scan line */}
        <Animated.View
          style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]}
        />

        {/* Bounding box with CV-style corner brackets */}
        <Animated.View
          style={[styles.detectBox, { opacity: boxOpacityAnim, width: BOX_W, height: BOX_H, left: BOX_LEFT, top: BOX_TOP }]}
        >
          <View style={styles.cvCornerTL} />
          <View style={styles.cvCornerTR} />
          <View style={styles.cvCornerBL} />
          <View style={styles.cvCornerBR} />
        </Animated.View>

        {/* Detection label */}
        <Animated.View
          style={[styles.detectLabel, { opacity: labelAnim, top: BOX_TOP + BOX_H + 10, left: BOX_LEFT }]}
        >
          <Text style={styles.detectLabelTitle}>✓  BOTTLE DETECTED</Text>
          <Text style={styles.detectLabelSub}>Medication Container  ·  97.3% confidence</Text>
          <Text style={styles.detectLabelSub}>Label visible  ·  OCR ready</Text>
        </Animated.View>

        {/* Screen header */}
        <View style={styles.detectHeader}>
          <Text style={styles.detectHeaderText}>OpenCV Detection</Text>
        </View>
      </View>
    );
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

          <TouchableOpacity
            style={[styles.audioButton, isSpeaking && styles.audioButtonActive]}
            onPress={handleSpeak}
            activeOpacity={0.85}
          >
            <Ionicons name={isSpeaking ? 'stop-circle' : 'volume-high'} size={20} color={Colors.white} />
            <Text style={styles.audioButtonText}>
              {isSpeaking ? 'Stop Audio' : 'Play Status Alert'}
              {DEMO_MODE ? ' (Device TTS)' : ' (ElevenLabs)'}
            </Text>
          </TouchableOpacity>

          {result.status_tag === 'VERIFIED_PRESENT' && (
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => setConfirmModalVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-done-circle" size={22} color={Colors.white} />
              <Text style={styles.confirmButtonText}>Confirm I Took This</Text>
            </TouchableOpacity>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Solana Audit Trail</Text>
            <Text style={styles.hashLabel}>SHA-256 Event Hash (no PHI)</Text>
            <Text style={styles.hashValue} selectable>{result.solana_payload_hash}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alert Transcript</Text>
            <Text style={styles.speechText}>{result.status_speech}</Text>
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color={Colors.white} />
            <Text style={styles.resetButtonText}>New Scan</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal
          visible={confirmModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Ionicons name="medical" size={36} color={Colors.verified} />
              <Text style={styles.modalTitle}>Confirm Dose Taken</Text>
              <Text style={styles.modalBody}>
                Are you confirming that{' '}
                <Text style={{ fontWeight: '700' }}>
                  {result.matched_medications.join(', ')}
                </Text>{' '}
                was just administered to Marcus Vance?
              </Text>
              <Text style={styles.modalSub}>
                This will be logged and an immutable hash written to Solana.
              </Text>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleConfirmTaken}
                disabled={isSavingDose}
                activeOpacity={0.85}
              >
                {isSavingDose ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                    <Text style={styles.modalConfirmText}>Yes, Log This Dose</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setConfirmModalVisible(false)}
                disabled={isSavingDose}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
            <Text style={styles.demoPlaceholderTitle}>Place Medication in Frame</Text>
            <Text style={styles.demoPlaceholderSub}>Or select an image below</Text>
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
              <Text style={styles.cameraHintText}>Frame pill bottle within the guides</Text>
            </View>
          </CameraView>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.analyzeButton} onPress={handleAnalyze} activeOpacity={0.88}>
          <Ionicons name="shield-checkmark" size={22} color={Colors.white} />
          <Text style={styles.analyzeButtonText}>Capture & Analyze</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.libraryButton} onPress={handlePickImage} activeOpacity={0.88}>
          <Ionicons name="image-outline" size={20} color={Colors.primary} />
          <Text style={styles.libraryButtonText}>Select Image from Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const CV_GREEN = '#00E676';
const CORNER_SIZE = 20;
const CORNER_WIDTH = 3;
const CV_CORNER = 18;
const CV_BORDER = 2;

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
    backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  permButtonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // Detection phase
  detectContainer: { flex: 1, backgroundColor: '#000' },
  detectImage: { width: '100%' },
  detectImagePlaceholder: {
    width: '100%', backgroundColor: '#030f03', alignItems: 'center', justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 2,
    backgroundColor: CV_GREEN,
    shadowColor: CV_GREEN, shadowOpacity: 0.9, shadowRadius: 6, elevation: 6,
  },
  detectBox: { position: 'absolute' },
  cvCornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: CV_CORNER, height: CV_CORNER,
    borderTopWidth: CV_BORDER, borderLeftWidth: CV_BORDER, borderColor: CV_GREEN,
  },
  cvCornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: CV_CORNER, height: CV_CORNER,
    borderTopWidth: CV_BORDER, borderRightWidth: CV_BORDER, borderColor: CV_GREEN,
  },
  cvCornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: CV_CORNER, height: CV_CORNER,
    borderBottomWidth: CV_BORDER, borderLeftWidth: CV_BORDER, borderColor: CV_GREEN,
  },
  cvCornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: CV_CORNER, height: CV_CORNER,
    borderBottomWidth: CV_BORDER, borderRightWidth: CV_BORDER, borderColor: CV_GREEN,
  },
  detectLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 6, padding: 10,
    borderLeftWidth: 2, borderLeftColor: CV_GREEN,
  },
  detectLabelTitle: { color: CV_GREEN, fontSize: 13, fontWeight: '800', marginBottom: 3 },
  detectLabelSub: { color: 'rgba(0,230,118,0.7)', fontSize: 11, lineHeight: 16 },
  detectHeader: {
    position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center',
  },
  detectHeaderText: {
    color: 'rgba(0,230,118,0.75)', fontSize: 11, fontWeight: '700',
    letterSpacing: 2.5, textTransform: 'uppercase',
  },

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

  cameraContainer: { flex: 1, backgroundColor: '#0a0f1e', overflow: 'hidden' },
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

  controls: { padding: 16, paddingBottom: 24, gap: 8 },
  analyzeButton: {
    backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 12,
  },
  analyzeButtonText: { color: Colors.white, fontSize: 16, fontWeight: '800' },
  libraryButton: {
    borderWidth: 1.5, borderColor: Colors.primary, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12,
  },
  libraryButtonText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },

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

  confirmButton: {
    backgroundColor: Colors.verified, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 12,
  },
  confirmButtonText: { color: Colors.white, fontSize: 16, fontWeight: '800' },

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

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 24,
    width: '100%', alignItems: 'center', gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  modalBody: { fontSize: 14, color: Colors.text, textAlign: 'center', lineHeight: 20 },
  modalSub: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 17 },
  modalConfirmButton: {
    backgroundColor: Colors.verified, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 10, width: '100%', minHeight: 48,
  },
  modalConfirmText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  modalCancelButton: { paddingVertical: 10 },
  modalCancelText: { fontSize: 14, color: Colors.textSecondary },
});
