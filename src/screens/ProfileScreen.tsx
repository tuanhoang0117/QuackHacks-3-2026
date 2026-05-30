import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

const PATIENT = {
  patient_id: 'PT-9942',
  name: 'Marcus Vance',
  dob: 'November 14, 1968',
  biological_sex: 'Male',
  occupation: 'High School Athletics Director',
  emergency_contact: 'Sarah Vance (Spouse) — 555-0192',
  chief_complaint: 'Leg pain and swelling; subsequent dental pain.',
  past_medical_history: [
    'Severe Essential Hypertension (High Blood Pressure)',
    'Hyperlipidemia (High Cholesterol)',
  ],
  past_surgical_history: ['None'],
  allergies: [{ substance: 'Latex', reaction: 'Contact Dermatitis' }],
  active_prescriptions_pre_admission: ['Lisinopril 10mg daily'],
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function Section({ title, icon, children }: {
  title: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={Colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>MV</Text>
          </View>
          <View>
            <Text style={styles.name}>{PATIENT.name}</Text>
            <Text style={styles.idBadge}>ID: {PATIENT.patient_id}</Text>
          </View>
        </View>

        {/* Demographics */}
        <Section title="Demographics" icon="person-outline">
          <InfoRow label="Date of Birth"   value={PATIENT.dob} />
          <InfoRow label="Biological Sex"  value={PATIENT.biological_sex} />
          <InfoRow label="Occupation"      value={PATIENT.occupation} />
        </Section>

        {/* Medical History */}
        <Section title="Past Medical History" icon="medkit-outline">
          {PATIENT.past_medical_history.map((cond, i) => (
            <View key={i} style={styles.listRow}>
              <Ionicons name="ellipse" size={6} color={Colors.primary} />
              <Text style={styles.listText}>{cond}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Text style={styles.subLabel}>Surgical History</Text>
          {PATIENT.past_surgical_history.map((s, i) => (
            <Text key={i} style={styles.infoValue}>{s}</Text>
          ))}
        </Section>

        {/* Allergies */}
        <Section title="Allergies" icon="alert-circle-outline">
          {PATIENT.allergies.map((a, i) => (
            <View key={i} style={styles.allergyRow}>
              <View style={styles.allergySubstance}>
                <Text style={styles.allergySubstanceText}>{a.substance}</Text>
              </View>
              <Text style={styles.allergyReaction}>{a.reaction}</Text>
            </View>
          ))}
        </Section>

        {/* Prescriptions */}
        <Section title="Pre-Admission Prescriptions" icon="medical-outline">
          {PATIENT.active_prescriptions_pre_admission.map((rx, i) => (
            <View key={i} style={styles.rxRow}>
              <Ionicons name="medical" size={13} color={Colors.primaryLight} />
              <Text style={styles.rxText}>{rx}</Text>
            </View>
          ))}
        </Section>

        {/* Chief Complaint */}
        <Section title="Chief Complaint" icon="clipboard-outline">
          <Text style={styles.infoValue}>{PATIENT.chief_complaint}</Text>
        </Section>

        {/* Emergency Contact */}
        <Section title="Emergency Contact" icon="call-outline">
          <Text style={styles.infoValue}>{PATIENT.emergency_contact}</Text>
        </Section>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="shield-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.disclaimerText}>
            PHI is processed locally. Only an opaque SHA-256 event hash is written to the Solana
            public ledger — never raw medical data.
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

  headerCard: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 20, fontWeight: '800' },
  name: { color: Colors.white, fontSize: 20, fontWeight: '700' },
  idBadge: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },

  section: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: Colors.black,
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: { height: 1, backgroundColor: Colors.border },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  infoLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  infoValue: { fontSize: 13, color: Colors.text, flex: 2, fontWeight: '500' },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listText: { fontSize: 13, color: Colors.text, flex: 1 },

  allergyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  allergySubstance: {
    backgroundColor: Colors.blockedLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  allergySubstanceText: { color: Colors.blocked, fontSize: 12, fontWeight: '700' },
  allergyReaction: { fontSize: 13, color: Colors.text },

  rxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rxText: { fontSize: 13, color: Colors.text, fontWeight: '500' },

  disclaimer: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
});
