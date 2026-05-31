import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { ScanHistoryEntry } from '../types';
import { MOCK_HISTORY } from '../mocks/mockScenarios';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const STATUS_CONFIG: Record<
  ScanHistoryEntry['status_tag'],
  { color: string; bg: string; border: string; icon: IconName; label: string }
> = {
  VERIFIED_PRESENT: {
    color: Colors.verified,
    bg: Colors.verifiedLight,
    border: Colors.verifiedBorder,
    icon: 'checkmark-circle',
    label: 'Verified',
  },
  BLOCKED: {
    color: Colors.blocked,
    bg: Colors.blockedLight,
    border: Colors.blockedBorder,
    icon: 'close-circle',
    label: 'Blocked',
  },
  REVIEW_REQUIRED: {
    color: Colors.review,
    bg: Colors.reviewLight,
    border: Colors.reviewBorder,
    icon: 'warning',
    label: 'Review',
  },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + '  ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function HistoryCard({ item }: { item: ScanHistoryEntry }) {
  const cfg = STATUS_CONFIG[item.status_tag];
  return (
    <View style={[styles.card, { borderLeftColor: cfg.color }]}>
      <View style={styles.cardTop}>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Ionicons name={cfg.icon} size={13} color={cfg.color} />
          <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        {item.safety_flag_count > 0 && (
          <View style={styles.flagCount}>
            <Text style={styles.flagCountText}>
              {item.safety_flag_count} flag{item.safety_flag_count !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
        <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
      </View>

      <View style={styles.medsRow}>
        {item.matched_medications.length === 0 ? (
          <Text style={styles.noMedsText}>No meds confirmed</Text>
        ) : (
          item.matched_medications.map((med, i) => (
            <View key={i} style={styles.medChip}>
              <Text style={styles.medChipText}>{med}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.hashRow}>
        <Ionicons name="lock-closed-outline" size={12} color={Colors.textLight} />
        <Text style={styles.hashText} numberOfLines={1}>{item.solana_payload_hash}</Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const verified = MOCK_HISTORY.filter(h => h.status_tag === 'VERIFIED_PRESENT').length;
  const blocked  = MOCK_HISTORY.filter(h => h.status_tag === 'BLOCKED').length;
  const review   = MOCK_HISTORY.filter(h => h.status_tag === 'REVIEW_REQUIRED').length;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Summary strip */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryTile, { backgroundColor: Colors.verifiedLight }]}>
          <Text style={[styles.summaryNum, { color: Colors.verified }]}>{verified}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.verified }]}>Verified</Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: Colors.blockedLight }]}>
          <Text style={[styles.summaryNum, { color: Colors.blocked }]}>{blocked}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.blocked }]}>Blocked</Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: Colors.reviewLight }]}>
          <Text style={[styles.summaryNum, { color: Colors.review }]}>{review}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.review }]}>Review</Text>
        </View>
      </View>

      <FlatList
        data={MOCK_HISTORY}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <HistoryCard item={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.listHeader}>Recent Scans — Patient PT-9942</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  summaryTile: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLbl: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  list: { padding: 16, gap: 10, paddingBottom: 32 },
  listHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    gap: 10,
    shadowColor: Colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  flagCount: {
    backgroundColor: Colors.blockedLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  flagCountText: { fontSize: 10, color: Colors.blocked, fontWeight: '700' },
  timestamp: { fontSize: 11, color: Colors.textSecondary, marginLeft: 'auto' },

  medsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 22, alignItems: 'center' },
  noMedsText: { fontSize: 12, color: Colors.textLight, fontStyle: 'italic' },
  medChip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  medChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  hashRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hashText: {
    flex: 1,
    fontSize: 10,
    color: Colors.textLight,
    fontFamily: 'monospace',
  },
});
