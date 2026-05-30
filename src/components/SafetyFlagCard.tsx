import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafetyFlag } from '../types';
import { Colors } from '../constants/colors';

interface Props {
  flag: SafetyFlag;
}

const SEVERITY_STYLE: Record<SafetyFlag['severity'], { color: string; bg: string }> = {
  Critical: { color: Colors.severityCritical, bg: '#FFEBEE' },
  High:     { color: Colors.severityHigh,     bg: '#FFF3E0' },
  Moderate: { color: Colors.severityModerate, bg: '#FFF8E1' },
  Low:      { color: Colors.severityLow,      bg: '#FFFDE7' },
};

const FLAG_TYPE_LABEL: Record<SafetyFlag['type'], string> = {
  interaction:     'Drug–Drug Interaction',
  contraindication: 'Contraindication',
  dose_ceiling:    'Dose Ceiling Exceeded',
  too_soon:        'Too Soon to Re-dose',
  duplicate:       'Duplicate Medication',
};

export default function SafetyFlagCard({ flag }: Props) {
  const [expanded, setExpanded] = useState(true);
  const { color, bg } = SEVERITY_STYLE[flag.severity];

  return (
    <View style={[styles.card, { backgroundColor: bg, borderLeftColor: color }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>{flag.severity.toUpperCase()}</Text>
          </View>
          <Text style={styles.flagType}>{FLAG_TYPE_LABEL[flag.type]}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <View style={styles.chipRow}>
            {flag.drugs_involved.map((drug, i) => (
              <View key={i} style={[styles.chip, { borderColor: color }]}>
                <Text style={[styles.chipText, { color }]}>{drug}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.mechanism}>{flag.mechanism}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 4,
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  flagType: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mechanism: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 19,
  },
});
