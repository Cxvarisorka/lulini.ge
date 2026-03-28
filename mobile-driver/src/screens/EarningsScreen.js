import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDriver } from '../context/DriverContext';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

// TODO: Commission rate should come from the server per-driver config instead of being hardcoded.
//       The server can return it as part of the earnings response payload.
const DEFAULT_COMMISSION_RATE = 0.15; // 15%

// Generate mock daily bar data for visual chart when server doesn't provide it
// todayLabel is the localized string for "Today" passed in from the component
function buildDailyBars(earnings, period, todayLabel) {
  const total = earnings?.total || 0;
  if (period === 'today') {
    // Single bar for today
    return [{ label: todayLabel, value: total }];
  }
  const count = period === 'week' ? 7 : 30;
  // If server returns daily breakdown use it, otherwise generate placeholder zeros
  if (earnings?.daily?.length) {
    return earnings.daily.map((d) => ({ label: d.label || '', value: d.amount || 0 }));
  }
  // Placeholder bars — all zeros
  return Array.from({ length: count }, (_, i) => ({ label: String(i + 1), value: 0 }));
}

export default function EarningsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);
  const { loadEarnings: loadEarningsCached, cachedRides } = useDriver();

  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [earnings, setEarnings] = useState({
    total: 0,
    trips: 0,
    average: 0,
    commission: null, // server may or may not provide this
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchEarnings(selectedPeriod);
  }, [selectedPeriod]);

  const fetchEarnings = async (period) => {
    setLoading(true);
    setError(false);
    try {
      const { earnings: data } = await loadEarningsCached(period);
      setEarnings(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Commission and net earnings calculations
  const grossEarnings = earnings.total || 0;
  const commissionAmount = earnings.commission != null
    ? earnings.commission
    : Math.round(grossEarnings * DEFAULT_COMMISSION_RATE * 100) / 100;
  const netEarnings = Math.max(0, grossEarnings - commissionAmount);

  const periods = [
    { id: 'today', label: t('earnings.today'), icon: 'today' },
    { id: 'week', label: t('earnings.thisWeek'), icon: 'calendar' },
    { id: 'month', label: t('earnings.thisMonth'), icon: 'calendar-outline' },
  ];

  const periodLabel = selectedPeriod === 'today'
    ? t('earnings.today')
    : selectedPeriod === 'week'
    ? t('earnings.thisWeek')
    : t('earnings.thisMonth');

  // Derive earnings history from the rides already cached in DriverContext.
  // Shows the 10 most recent completed rides. When no ride data is available the
  // empty placeholder is shown instead.
  const historyRides = useMemo(() => {
    if (!cachedRides?.length) return [];
    return cachedRides
      .filter((r) => r.status === 'completed')
      .slice(0, 10);
  }, [cachedRides]);

  // Bar chart data — pass localized today label so the bar caption is not hardcoded English
  const dailyBars = useMemo(
    () => buildDailyBars(earnings, selectedPeriod, t('earnings.today')),
    [earnings, selectedPeriod, t]
  );
  const maxBarValue = useMemo(
    () => Math.max(...dailyBars.map((b) => b.value), 1),
    [dailyBars]
  );

  const handleShare = useCallback(async () => {
    try {
      const message = t('earnings.shareSummaryText', {
        period: periodLabel,
        gross: grossEarnings.toFixed(2),
        commission: commissionAmount.toFixed(2),
        net: netEarnings.toFixed(2),
        trips: earnings.trips || 0,
      });
      await Share.share({ message, title: t('earnings.earningsSummary') });
    } catch (e) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    }
  }, [grossEarnings, commissionAmount, netEarnings, earnings.trips, periodLabel, t]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {t('earnings.title')}
        </Text>
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareButton}
          accessibilityRole="button"
          accessibilityLabel={t('earnings.shareEarnings')}
        >
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing['3xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector */}
        <View style={styles.periodSection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('earnings.selectPeriod')}</Text>
          <View
            style={styles.periodSelector}
            accessible
            accessibilityLabel={t('earnings.periodSelector')}
          >
            {periods.map((period) => (
              <TouchableOpacity
                key={period.id}
                style={[
                  styles.periodButton,
                  selectedPeriod === period.id && styles.periodButtonActive,
                ]}
                onPress={() => setSelectedPeriod(period.id)}
                accessibilityRole="button"
                accessibilityLabel={period.label}
                accessibilityState={{ selected: selectedPeriod === period.id }}
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
          ) : error ? (
            <View style={styles.errorContainer}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle-outline" size={36} color={colors.destructive} />
              </View>
              <Text style={styles.errorTitle} numberOfLines={1}>
                {t('errors.somethingWentWrong')}
              </Text>
              <Text style={styles.errorSubtitle} numberOfLines={2}>
                {t('errors.tryAgain')}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => fetchEarnings(selectedPeriod)}
                accessibilityRole="button"
                accessibilityLabel={t('common.tryAgain')}
              >
                <Text style={styles.retryButtonText}>{t('common.tryAgain')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.totalContainer}>
                <View style={styles.totalIconBadge}>
                  <Ionicons name="wallet" size={24} color={colors.primaryForeground} />
                </View>
                <Text style={styles.totalLabel} numberOfLines={1}>{t('earnings.netEarnings')}</Text>
                <Text
                  style={styles.totalAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  accessible
                  accessibilityLabel={t('earnings.statCard', { label: t('earnings.netEarnings'), value: `${netEarnings.toFixed(2)} GEL` })}
                >
                  {netEarnings.toFixed(2)} ₾
                </Text>
                <Text style={styles.periodLabel} numberOfLines={1}>{periodLabel}</Text>
              </View>

              {/* Breakdown: Gross → Commission → Net */}
              <View style={styles.breakdownSection}>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{t('earnings.grossEarnings')}</Text>
                  <Text style={styles.breakdownValue}>{grossEarnings.toFixed(2)} ₾</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.warning }]}>
                    {t('earnings.commission')}
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.warning }]}>
                    -{commissionAmount.toFixed(2)} ₾
                  </Text>
                </View>
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { fontWeight: '700', color: colors.foreground }]}>
                    {t('earnings.netEarnings')}
                  </Text>
                  <Text style={[styles.breakdownValue, { fontWeight: '700', color: colors.success }]}>
                    {netEarnings.toFixed(2)} ₾
                  </Text>
                </View>
              </View>

              {/* Trips + Average */}
              <View style={styles.statsRow}>
                <View
                  style={styles.statItem}
                  accessible
                  accessibilityLabel={t('earnings.statCard', { label: t('earnings.trips'), value: String(earnings.trips || 0) })}
                >
                  <View style={[styles.statIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="car" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {earnings.trips || 0}
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {t('earnings.trips')}
                  </Text>
                </View>
                <View
                  style={styles.statItem}
                  accessible
                  accessibilityLabel={t('earnings.statCard', { label: t('earnings.averagePerTrip'), value: `${earnings.average?.toFixed(2) || '0.00'} GEL` })}
                >
                  <View style={[styles.statIcon, { backgroundColor: colors.info + '15' }]}>
                    <Ionicons name="trending-up" size={20} color={colors.info} />
                  </View>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {earnings.average?.toFixed(2) || '0.00'} ₾
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {t('earnings.averagePerTrip')}
                  </Text>
                </View>
                <View
                  style={styles.statItem}
                  accessible
                  accessibilityLabel={t('earnings.statCard', { label: t('earnings.tips'), value: t('earnings.tipsComingSoon') })}
                >
                  <View style={[styles.statIcon, { backgroundColor: colors.gold + '20' }]}>
                    <Ionicons name="gift-outline" size={20} color={colors.gold} />
                  </View>
                  <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    —
                  </Text>
                  <Text style={styles.statLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {t('earnings.tips')}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Bar Chart — Daily Breakdown */}
        {!loading && selectedPeriod !== 'today' && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle} numberOfLines={1}>{t('earnings.dailyBreakdown')}</Text>
            <View style={styles.barChart} accessibilityRole="none">
              {dailyBars.map((bar, i) => {
                const pct = maxBarValue > 0 ? bar.value / maxBarValue : 0;
                const barH = Math.max(4, Math.round(pct * 80));
                return (
                  <View
                    key={i}
                    style={styles.barWrapper}
                    accessible
                    accessibilityLabel={`${bar.label}: ${bar.value.toFixed(2)} GEL`}
                  >
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: barH,
                            backgroundColor: bar.value > 0 ? colors.primary : colors.border,
                          },
                        ]}
                      />
                    </View>
                    {dailyBars.length <= 10 && (
                      <Text style={styles.barLabel} numberOfLines={1}>{bar.label}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Earnings History — shows recent completed rides from the ride cache */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{t('earnings.history')}</Text>
          {historyRides.length > 0 ? (
            <View style={styles.historyCard}>
              {historyRides.map((ride, index) => {
                const rideDate = ride.endTime || ride.createdAt;
                const dateStr = rideDate
                  ? new Date(rideDate).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                  : '—';
                const fareNet = ride.fare != null
                  ? Math.max(0, ride.fare - Math.round(ride.fare * DEFAULT_COMMISSION_RATE * 100) / 100)
                  : null;
                return (
                  <View key={ride._id || index}>
                    {index > 0 && <View style={styles.historyDivider} />}
                    <View style={styles.historyRow}>
                      <View style={styles.historyIconWrap}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                      </View>
                      <View style={styles.historyInfo}>
                        <Text style={styles.historyAddress} numberOfLines={1}>
                          {ride.dropoff?.address || t('common.unknown')}
                        </Text>
                        <Text style={styles.historyDate} numberOfLines={1}>{dateStr}</Text>
                      </View>
                      {fareNet != null && (
                        <Text style={styles.historyFare}>+{fareNet.toFixed(2)} ₾</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
              </View>
              <Text style={styles.emptyTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t('earnings.noEarnings')}
              </Text>
              <Text style={styles.emptySubtitle} numberOfLines={2}>
                {t('earnings.noEarningsDesc')}
              </Text>
            </View>
          )}
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
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    flex: 1,
  },
  shareButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
  // Error state inside summary card
  errorContainer: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: `${colors.destructive}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  errorSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  retryButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primaryForeground,
  },
  // History list
  historyCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: `${colors.success}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  historyInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  historyAddress: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: 2,
  },
  historyDate: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  historyFare: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.success,
    flexShrink: 0,
  },
  historyDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  // Commission breakdown
  breakdownSection: {
    marginBottom: spacing.lg,
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  breakdownLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  breakdownValue: {
    ...typography.bodySmall,
    color: colors.foreground,
    fontWeight: '600',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  // Bar chart
  chartCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 3,
    marginTop: spacing.sm,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: '80%',
    borderRadius: 3,
    minHeight: 4,
  },
  barLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 3,
    textAlign: 'center',
    fontSize: 9,
  },
});
