import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { driverAPI } from '../services/api';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function EarningsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [earnings, setEarnings] = useState({
    total: 0,
    trips: 0,
    average: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEarnings(selectedPeriod);
  }, [selectedPeriod]);

  const loadEarnings = async (period) => {
    setLoading(true);
    try {
      const response = await driverAPI.getEarnings(period);
      if (response.data.success) {
        setEarnings(response.data.data.earnings);
      }
    } catch (error) {
      // Failed to load earnings
    } finally {
      setLoading(false);
    }
  };

  const periods = [
    { id: 'today', label: t('earnings.today'), icon: 'today' },
    { id: 'week', label: t('earnings.thisWeek'), icon: 'calendar' },
    { id: 'month', label: t('earnings.thisMonth'), icon: 'calendar-outline' },
  ];

  const stats = [
    {
      id: 'trips',
      icon: 'car',
      value: earnings.trips || 0,
      label: t('earnings.trips'),
      color: colors.primary,
    },
    {
      id: 'average',
      icon: 'trending-up',
      value: `$${earnings.average?.toFixed(2) || '0.00'}`,
      label: t('earnings.averagePerTrip'),
      color: colors.info,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('earnings.title')}</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing['3xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector */}
        <View style={styles.periodSection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('earnings.selectPeriod') || 'SELECT PERIOD'}</Text>
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
                <Ionicons
                  name={period.icon}
                  size={18}
                  color={selectedPeriod === period.id ? colors.primaryForeground : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.periodButtonText,
                    selectedPeriod === period.id && styles.periodButtonTextActive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {period.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Earnings Summary Card */}
        <View style={styles.summaryCard}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={styles.totalContainer}>
                <View style={styles.totalIconBadge}>
                  <Ionicons name="wallet" size={24} color={colors.primaryForeground} />
                </View>
                <Text style={styles.totalLabel} numberOfLines={1}>{t('earnings.total')}</Text>
                <Text style={styles.totalAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>${earnings.total?.toFixed(2) || '0.00'}</Text>
                <Text style={styles.periodLabel} numberOfLines={1}>
                  {selectedPeriod === 'today'
                    ? t('earnings.today')
                    : selectedPeriod === 'week'
                    ? t('earnings.thisWeek')
                    : t('earnings.thisMonth')}
                </Text>
              </View>

              <View style={styles.statsRow}>
                {stats.map((stat) => (
                  <View key={stat.id} style={styles.statItem}>
                    <View style={[styles.statIcon, { backgroundColor: `${stat.color}15` }]}>
                      <Ionicons name={stat.icon} size={20} color={stat.color} />
                    </View>
                    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stat.value}</Text>
                    <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStatsSection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('earnings.summary') || 'SUMMARY'}</Text>
          <View style={styles.quickStatsCard}>
            <View style={styles.quickStatRow}>
              <View style={styles.quickStatLeft}>
                <View style={[styles.quickStatDot, { backgroundColor: colors.success }]} />
                <Text style={styles.quickStatLabel} numberOfLines={1}>{t('earnings.completedTrips') || 'Completed Trips'}</Text>
              </View>
              <Text style={styles.quickStatValue} numberOfLines={1}>{earnings.trips || 0}</Text>
            </View>

            <View style={styles.quickStatDivider} />

            <View style={styles.quickStatRow}>
              <View style={styles.quickStatLeft}>
                <View style={[styles.quickStatDot, { backgroundColor: colors.info }]} />
                <Text style={styles.quickStatLabel} numberOfLines={1}>{t('earnings.averagePerTrip')}</Text>
              </View>
              <Text style={styles.quickStatValue} numberOfLines={1}>${earnings.average?.toFixed(2) || '0.00'}</Text>
            </View>

            <View style={styles.quickStatDivider} />

            <View style={styles.quickStatRow}>
              <View style={styles.quickStatLeft}>
                <View style={[styles.quickStatDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.quickStatLabel} numberOfLines={1}>{t('earnings.totalEarnings') || 'Total Earnings'}</Text>
              </View>
              <Text style={[styles.quickStatValue, styles.quickStatValueHighlight]} numberOfLines={1}>
                ${earnings.total?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* Earnings History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('earnings.history')}</Text>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
            </View>
            <Text style={styles.emptyTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('earnings.noEarnings')}</Text>
            <Text style={styles.emptySubtitle} numberOfLines={2}>
              {t('earnings.noEarningsDesc') || 'Your earnings history will appear here'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius['2xl'],
    borderBottomRightRadius: radius['2xl'],
    ...shadows.sm,
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  periodSection: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  periodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    gap: spacing.xs,
    ...shadows.sm,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.mutedForeground,
  },
  periodButtonTextActive: {
    color: colors.primaryForeground,
  },
  summaryCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.md,
  },
  loadingContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  totalContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  totalIconBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  totalLabel: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 42,
    color: colors.foreground,
    marginBottom: spacing.xs,
    maxWidth: '100%',
  },
  periodLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statItem: {
    flex: 1,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  quickStatsSection: {
    marginBottom: spacing.xl,
  },
  quickStatsCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  quickStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  quickStatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
  },
  quickStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.md,
  },
  quickStatLabel: {
    ...typography.bodySmall,
    color: colors.foreground,
    flex: 1,
  },
  quickStatValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
    flexShrink: 0,
  },
  quickStatValueHighlight: {
    color: colors.success,
    fontWeight: '700',
  },
  quickStatDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  historySection: {
    marginBottom: spacing.xl,
  },
  emptyContainer: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
