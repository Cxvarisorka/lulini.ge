import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { driverAPI } from '../services/api';
import { colors, shadows, radius } from '../theme/colors';

export default function EarningsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [earnings, setEarnings] = useState({
    total: 0,
    trips: 0,
    average: 0,
  });

  useEffect(() => {
    loadEarnings(selectedPeriod);
  }, [selectedPeriod]);

  const loadEarnings = async (period) => {
    try {
      const response = await driverAPI.getEarnings(period);
      if (response.data.success) {
        setEarnings(response.data.data.earnings);
      }
    } catch (error) {
      console.log('Error loading earnings:', error);
    }
  };

  const periods = [
    { id: 'today', label: t('earnings.today') },
    { id: 'week', label: t('earnings.thisWeek') },
    { id: 'month', label: t('earnings.thisMonth') },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('earnings.title')}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.id}
              style={[
                styles.periodButton,
                selectedPeriod === period.id && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period.id)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period.id && styles.periodButtonTextActive,
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Earnings Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>{t('earnings.total')}</Text>
            <Text style={styles.totalAmount}>${earnings.total?.toFixed(2) || '0.00'}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="car" size={24} color={colors.primary} />
              <Text style={styles.statValue}>{earnings.trips || 0}</Text>
              <Text style={styles.statLabel}>{t('earnings.trips')}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statItem}>
              <Ionicons name="trending-up" size={24} color={colors.primary} />
              <Text style={styles.statValue}>${earnings.average?.toFixed(2) || '0.00'}</Text>
              <Text style={styles.statLabel}>{t('earnings.averagePerTrip')}</Text>
            </View>
          </View>
        </View>

        {/* Earnings History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>{t('earnings.history')}</Text>
          <View style={styles.emptyContainer}>
            <Ionicons name="wallet-outline" size={64} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>{t('earnings.noEarnings')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  periodSelector: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  periodButtonTextActive: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 24,
    marginBottom: 20,
    ...shadows.lg,
  },
  totalContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  totalLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.foreground,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 60,
    backgroundColor: colors.border,
  },
  historySection: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginTop: 16,
  },
});
