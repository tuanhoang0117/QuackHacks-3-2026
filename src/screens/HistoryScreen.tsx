import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { DoseLogEntry } from '../types';
import { getDoses, clearDoses } from '../services/doseLog';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    '  ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

function DoseCard({ item }: { item: DoseLogEntry }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={[styles.statusBadge, { backgroundColor: Colors.verifiedLight, borderColor: Colors.verifiedBorder }]}>
          <Ionicons name={'checkmark-circle' as IconName} size={13} color={Colors.verified} />
          <Text style={[styles.statusLabel, { color: Colors.verified }]}>Dose Logged</Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(item.timestamp)}</Text>
      </View>

      <View style={styles.medsRow}>
        <View style={styles.medChip}>
          <Text style={styles.medChipText}>{item.medication_name}</Text>
        </View>
      </View>

      <View style={styles.hashRow}>
        <Ionicons name={'lock-closed-outline' as IconName} size={12} color={Colors.textLight} />
        <Text style={styles.hashText} numberOfLines={1}>{item.solana_payload_hash}</Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const [doses, setDoses] = useState<DoseLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDoses = useCallback(async () => {
    const entries = await getDoses();
    setDoses(entries);
  }, []);

  // Reload whenever the tab comes into focus
  useFocusEffect(useCallback(() => { loadDoses(); }, [loadDoses]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDoses();
    setRefreshing(false);
  }, [loadDoses]);

  const handleClear = useCallback(async () => {
    await clearDoses();
    setDoses([]);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Summary strip */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryTile, { backgroundColor: Colors.verifiedLight }]}>
          <Text style={[styles.summaryNum, { color: Colors.verified }]}>{doses.length}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.verified }]}>Doses Logged</Text>
        </View>
        <View style={[styles.summaryTile, { backgroundColor: Colors.background }]}>
          <Text style={[styles.summaryNum, { color: Colors.textSecondary }]}>
            {doses.length > 0 ? new Set(doses.map(d => d.medication_name)).size : 0}
          </Text>
          <Text style={[styles.summaryLbl, { color: Colors.textSecondary }]}>Medications</Text>
        </View>
        <TouchableOpacity
          style={[styles.summaryTile, { backgroundColor: '#FFF3E0' }]}
          onPress={handleClear}
          activeOpacity={0.7}
        >
          <Ionicons name={'trash-outline' as IconName} size={18} color="#E65100" />
          <Text style={[styles.summaryLbl, { color: '#E65100' }]}>Clear Log</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={doses}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <DoseCard item={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <Text style={styles.listHeader}>Dose History — Patient PT-9942</Text>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name={'time-outline' as IconName} size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No doses logged yet.</Text>
            <Text style={styles.emptySubtext}>
              After scanning a medication and confirming you took it, it will appear here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  summaryRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  summaryTile: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', gap: 2,
  },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLbl: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  list: { padding: 16, gap: 10, paddingBottom: 32 },
  listHeader: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },

  card: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    borderLeftWidth: 4, borderLeftColor: Colors.verified, gap: 10,
    shadowColor: Colors.black, shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  timestamp: { fontSize: 11, color: Colors.textSecondary, marginLeft: 'auto' },

  medsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 22, alignItems: 'center' },
  medChip: { backgroundColor: '#EEF2FF', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  medChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  hashRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hashText: { flex: 1, fontSize: 10, color: Colors.textLight, fontFamily: 'monospace' },

  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptySubtext: {
    fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 19,
    maxWidth: 280,
  },
});
