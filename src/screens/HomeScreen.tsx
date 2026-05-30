import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { DEMO_MODE } from '../services/api';

const PATIENT = {
  name: 'Marcus Vance',
  initials: 'MV',
  dob: 'Nov 14, 1968',
  id: 'PT-9942',
  conditions: ['Severe Essential Hypertension', 'Hyperlipidemia'],
  allergies: ['Latex'],
  currentMeds: ['Lisinopril 10mg daily'],
};

const HOW_IT_WORKS = [
  { icon: 'camera-outline',           step: 'Capture',  detail: 'Frame your pill tray with the camera' },
  { icon: 'text-outline',             step: 'Extract',  detail: 'Gemini reads labels & clinical documents' },
  { icon: 'shield-checkmark-outline', step: 'Verify',   detail: 'MongoDB safety engine checks interactions' },
  { icon: 'receipt-outline',          step: 'Record',   detail: 'Hash-only event written to Solana Devnet' },
] as const;

export default function HomeScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {DEMO_MODE && (
          <View style={styles.demoBanner}>
            <Ionicons name="flask-outline" size={14} color="#7B1FA2" />
            <Text style={styles.demoText}>DEMO MODE — No live backend required</Text>
          </View>
        )}

        {/* Patient Card */}
        <View style={styles.patientCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{PATIENT.initials}</Text>
          </View>
          <View style={styles.patientInfo}>
            <Text style={styles.patientName}>{PATIENT.name}</Text>
            <Text style={styles.patientMeta}>DOB: {PATIENT.dob}  ·  ID: {PATIENT.id}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')} hitSlop={12}>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Active Conditions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Active Conditions</Text>
          {PATIENT.conditions.map((c, i) => (
            <View key={i} style={styles.row}>
              <Ionicons name="medkit-outline" size={14} color={Colors.primary} />
              <Text style={styles.rowText}>{c}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Text style={styles.cardSubtitle}>Current Prescriptions</Text>
          {PATIENT.currentMeds.map((m, i) => (
            <View key={i} style={styles.row}>
              <Ionicons name="medical-outline" size={14} color={Colors.primaryLight} />
              <Text style={styles.rowText}>{m}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('Scan')}
            activeOpacity={0.85}
          >
            <Ionicons name="scan-circle" size={22} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Start Medication Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('History')}
            activeOpacity={0.85}
          >
            <Ionicons name="time-outline" size={18} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>View Scan History</Text>
          </TouchableOpacity>
        </View>

        {/* How it Works */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How it Works</Text>
          {HOW_IT_WORKS.map(({ icon, step, detail }, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Ionicons name={icon} size={18} color={Colors.primary} />
              <View style={styles.stepText}>
                <Text style={styles.stepLabel}>{step}</Text>
                <Text style={styles.stepDetail}>{detail}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Scope boundary callout */}
        <View style={styles.scopeCard}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.scopeText}>
            This system verifies object count and reads visible labels. It does not independently
            prove drug identity from shape alone, and it cannot prove ingestion.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },

  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: '#CE93D8',
  },
  demoText: { color: '#7B1FA2', fontSize: 12, fontWeight: '600' },

  patientCard: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 18, fontWeight: '800' },
  patientInfo: { flex: 1 },
  patientName: { color: Colors.white, fontSize: 17, fontWeight: '700' },
  patientMeta: { color: 'rgba(255,255,255,0.78)', fontSize: 11, marginTop: 2 },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  divider: { height: 1, backgroundColor: Colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { fontSize: 14, color: Colors.text, flex: 1 },

  primaryButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryButtonText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  secondaryButtonText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: Colors.white, fontSize: 11, fontWeight: '800' },
  stepText: { flex: 1 },
  stepLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  stepDetail: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  scopeCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scopeText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
});
