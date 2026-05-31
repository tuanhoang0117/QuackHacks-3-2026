import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReconciliationResult } from '../types';
import { Colors } from '../constants/colors';

interface Props {
  result: ReconciliationResult;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface BannerConfig {
  bg: string;
  border: string;
  color: string;
  icon: IconName;
  label: string;
  detail: (r: ReconciliationResult) => string;
}

function getConfig(tag: ReconciliationResult['status_tag']): BannerConfig {
  switch (tag) {
    case 'VERIFIED_PRESENT':
      return {
        bg: Colors.verifiedLight,
        border: Colors.verifiedBorder,
        color: Colors.verified,
        icon: 'checkmark-circle',
        label: 'VERIFIED PRESENT',
        detail: r =>
          `${r.matched_medications.length} medication${r.matched_medications.length !== 1 ? 's' : ''} verified. No safety concerns detected.`,
      };
    case 'BLOCKED':
      return {
        bg: Colors.blockedLight,
        border: Colors.blockedBorder,
        color: Colors.blocked,
        icon: 'close-circle',
        label: 'BLOCKED — DO NOT ADMINISTER',
        detail: r => {
          const critical = r.safety_flags.filter(f => f.severity === 'Critical').length;
          const high = r.safety_flags.filter(f => f.severity === 'High').length;
          if (critical > 0)
            return `${critical} CRITICAL safety issue${critical !== 1 ? 's' : ''} detected. Immediate action required.`;
          return `${high} high-severity issue${high !== 1 ? 's' : ''} detected. Do not administer.`;
        },
      };
    case 'REVIEW_REQUIRED':
      return {
        bg: Colors.reviewLight,
        border: Colors.reviewBorder,
        color: Colors.review,
        icon: 'warning',
        label: 'HUMAN REVIEW REQUIRED',
        detail: () =>
          'System confidence low. Human verification required before proceeding.',
      };
  }
}

export default function VerdictBanner({ result }: Props) {
  const config = getConfig(result.status_tag);

  return (
    <View style={[styles.container, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Ionicons name={config.icon} size={36} color={config.color} />
      <View style={styles.textBlock}>
        <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
        <Text style={[styles.detail, { color: config.color }]}>{config.detail(result)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 12,
  },
  textBlock: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  detail: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
    fontWeight: '500',
  },
});
