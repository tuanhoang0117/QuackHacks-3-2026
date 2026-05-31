import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { DoseLogEntry } from '../types';
import { getDoses, clearDoses } from '../services/doseLog';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const CELL_SIZE = Math.floor((Dimensions.get('window').width - 32) / 7);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toDateKey(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatSelectedDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

export default function HistoryScreen() {
  const [doses, setDoses] = useState<DoseLogEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadDoses = useCallback(async () => {
    const entries = await getDoses();
    setDoses(entries);
  }, []);

  useFocusEffect(useCallback(() => { loadDoses(); }, [loadDoses]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDoses();
    setRefreshing(false);
  }, [loadDoses]);

  const handleClear = useCallback(async () => {
    await clearDoses();
    setDoses([]);
    setSelectedDate(null);
  }, []);

  const dosesByDate = useMemo(() => {
    const map: Record<string, DoseLogEntry[]> = {};
    for (const dose of doses) {
      const key = toDateKey(dose.timestamp);
      if (!map[key]) map[key] = [];
      map[key].push(dose);
    }
    for (const key in map) {
      map[key].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
    return map;
  }, [doses]);

  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; dateStr: string | null }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const y = year;
      const mo = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ day: d, dateStr: `${y}-${mo}-${dd}` });
    }
    return cells;
  }, [currentMonth]);

  const todayKey = toDateKey(new Date().toISOString());
  const selectedDoses = selectedDate ? (dosesByDate[selectedDate] ?? []) : [];
  const uniqueMedCount = useMemo(() => new Set(doses.map(d => d.medication_name)).size, [doses]);

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDate(null);
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDate(null);
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
          <Text style={[styles.summaryNum, { color: Colors.textSecondary }]}>{uniqueMedCount}</Text>
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={goToPrevMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name={'chevron-back' as IconName} size={22} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name={'chevron-forward' as IconName} size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {/* Day-of-week headers */}
          {DAY_LABELS.map((label, i) => (
            <View key={`hdr-${i}`} style={styles.cell}>
              <Text style={styles.dayLabel}>{label}</Text>
            </View>
          ))}

          {/* Day cells */}
          {calendarCells.map((cell, i) => {
            if (!cell.dateStr) {
              return <View key={`pad-${i}`} style={styles.cell} />;
            }
            const hasDoses = !!dosesByDate[cell.dateStr]?.length;
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayKey;

            return (
              <TouchableOpacity
                key={cell.dateStr}
                style={styles.cell}
                onPress={() => setSelectedDate(isSelected ? null : cell.dateStr!)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.dayCircle,
                  isSelected && styles.dayCircleSelected,
                  isToday && !isSelected && styles.dayCircleToday,
                ]}>
                  <Text style={[
                    styles.dayNum,
                    isSelected && styles.dayNumSelected,
                    isToday && !isSelected && styles.dayNumToday,
                  ]}>
                    {cell.day}
                  </Text>
                </View>
                <View style={[styles.dot, hasDoses ? styles.dotVisible : styles.dotHidden, isSelected && styles.dotOnSelected]} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Day detail panel */}
        {selectedDate && (
          <View style={styles.detailPanel}>
            <Text style={styles.detailHeader}>{formatSelectedDate(selectedDate)}</Text>
            {selectedDoses.length === 0 ? (
              <View style={styles.detailEmpty}>
                <Ionicons name={'time-outline' as IconName} size={28} color={Colors.textLight} />
                <Text style={styles.detailEmptyText}>No doses logged on this day</Text>
              </View>
            ) : (
              selectedDoses.map((dose, idx) => (
                <View
                  key={dose.id}
                  style={[styles.doseRow, idx < selectedDoses.length - 1 && styles.doseRowBorder]}
                >
                  <View style={styles.doseTop}>
                    <View style={styles.medChip}>
                      <Text style={styles.medChipText}>{dose.medication_name}</Text>
                    </View>
                    <Text style={styles.doseTime}>{formatTime(dose.timestamp)}</Text>
                  </View>
                  <View style={styles.hashRow}>
                    <Ionicons name={'lock-closed-outline' as IconName} size={11} color={Colors.textLight} />
                    <Text style={styles.hashText} numberOfLines={1}>{dose.solana_payload_hash}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Global empty state */}
        {doses.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name={'calendar-outline' as IconName} size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No doses logged yet.</Text>
            <Text style={styles.emptySubtext}>
              After scanning a medication and confirming you took it, it will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  summaryRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  summaryTile: {
    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', gap: 2,
  },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLbl: { fontSize: 11, fontWeight: '600', marginTop: 1 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
  },
  monthTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },

  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE + 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
    gap: 3,
  },
  dayLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, lineHeight: 30 },

  dayCircle: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  dayCircleSelected: { backgroundColor: Colors.primary },
  dayCircleToday: { borderWidth: 1.5, borderColor: Colors.primary },

  dayNum: { fontSize: 14, fontWeight: '400', color: Colors.text },
  dayNumSelected: { color: Colors.white, fontWeight: '700' },
  dayNumToday: { color: Colors.primary, fontWeight: '700' },

  dot: { width: 6, height: 6, borderRadius: 3 },
  dotVisible: { backgroundColor: Colors.verified },
  dotHidden: { backgroundColor: 'transparent' },
  dotOnSelected: { backgroundColor: Colors.white },

  detailPanel: {
    marginTop: 16,
    backgroundColor: Colors.card,
    borderRadius: 14, padding: 16, gap: 0,
    shadowColor: Colors.black, shadowOpacity: 0.06,
    shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  detailHeader: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },
  detailEmpty: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  detailEmptyText: { fontSize: 13, color: Colors.textSecondary },

  doseRow: { paddingVertical: 10, gap: 6 },
  doseRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  doseTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  medChip: {
    backgroundColor: '#EEF2FF', borderRadius: 12,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  medChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  doseTime: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  hashRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hashText: { flex: 1, fontSize: 10, color: Colors.textLight, fontFamily: 'monospace' },

  emptyContainer: { alignItems: 'center', paddingTop: 32, gap: 10 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptySubtext: {
    fontSize: 13, color: Colors.textLight, textAlign: 'center', lineHeight: 19, maxWidth: 280,
  },
});
