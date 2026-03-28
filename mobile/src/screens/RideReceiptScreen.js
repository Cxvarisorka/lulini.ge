import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { receiptAPI } from '../services/api';

export default function RideReceiptScreen({ route, navigation }) {
  const { rideId, ride: rideProp } = route.params || {};
  const { t, i18n } = useTranslation();
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = rideId || rideProp?._id;
        if (!id) { setLoading(false); return; }
        const res = await receiptAPI.getReceipt(id);
        if (res.data.success && mounted) {
          setReceipt(res.data.data);
        }
      } catch (e) {
        // If API unavailable, fall back to ride prop data
        if (mounted && rideProp) {
          setReceipt(buildFallbackReceipt(rideProp));
        }
        if (__DEV__) console.warn('[Receipt] load error:', e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [rideId, rideProp]);

  const buildFallbackReceipt = (ride) => ({
    rideId: ride._id,
    pickup: ride.pickup,
    dropoff: ride.dropoff,
    distance: ride.quote?.distanceText || `${(ride.quote?.distance || 0).toFixed(1)} km`,
    duration: ride.quote?.durationText || `${ride.quote?.duration || 0} min`,
    baseFare: ride.quote?.basePrice || ride.fare || 0,
    waitingFee: ride.waitingFee || 0,
    totalFare: ride.fare || ride.quote?.totalPrice || 0,
    vehicleType: ride.vehicleType || 'economy',
    driver: ride.driver,
    createdAt: ride.createdAt,
    startTime: ride.startTime,
    endTime: ride.endTime,
  });

  const formatDate = useCallback((dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString(i18n.language, {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }, [i18n.language]);

  const formatShortDate = useCallback((dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString(i18n.language, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }, [i18n.language]);

  const getDriverName = useCallback((driver) => {
    if (!driver) return t('taxi.driver');
    return [driver.user?.firstName, driver.user?.lastName].filter(Boolean).join(' ')
      || driver.user?.fullName
      || t('taxi.driver');
  }, [t]);

  const buildShareText = useCallback(() => {
    if (!receipt) return '';
    const lines = [
      `=== ${t('receipt.title')} ===`,
      `${t('receipt.date')}: ${formatDate(receipt.createdAt)}`,
      '',
      `${t('taxi.pickupPoint')}: ${receipt.pickup?.address || '—'}`,
      `${t('taxi.dropoffPoint')}: ${receipt.dropoff?.address || '—'}`,
      '',
      `${t('taxi.distance')}: ${receipt.distance}`,
      `${t('taxi.duration')}: ${receipt.duration}`,
      '',
      `${t('receipt.baseFare')}: ${Number(receipt.baseFare).toFixed(2)} ₾`,
      receipt.waitingFee > 0 ? `${t('history.waitingFee')}: ${Number(receipt.waitingFee).toFixed(2)} ₾` : null,
      `${t('receipt.total')}: ${Number(receipt.totalFare).toFixed(2)} ₾`,
      '',
      `${t('taxi.driver')}: ${getDriverName(receipt.driver)}`,
    ].filter(Boolean).join('\n');
    return lines;
  }, [receipt, t, formatDate, getDriverName]);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      await Share.share({
        message: buildShareText(),
        title: t('receipt.title'),
      });
    } catch (e) {
      if (e.message !== 'User did not share') {
        Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
      }
    } finally {
      setSharing(false);
    }
  }, [buildShareText, t]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!receipt) {
    return (
      <View style={styles.centered}>
        <Ionicons name="receipt-outline" size={56} color={colors.border} />
        <Text style={styles.emptyTitle}>{t('receipt.notFound')}</Text>
      </View>
    );
  }

  const driverName = getDriverName(receipt.driver);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Receipt Card */}
      <View style={styles.receiptCard}>
        {/* Header */}
        <View style={styles.receiptHeader}>
          <View style={styles.receiptIconBg}>
            <Ionicons name="receipt-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.receiptTitle}>{t('receipt.title')}</Text>
          <Text style={styles.receiptDate}>{formatDate(receipt.createdAt)}</Text>
          <View style={styles.receiptDividerDotted} />
        </View>

        {/* Route */}
        <View style={styles.section}>
          <View style={styles.routeRow}>
            <View style={styles.routeDot} />
            <Text style={styles.routeLabel}>{t('taxi.pickupPoint')}</Text>
          </View>
          <Text style={styles.routeAddress}>{receipt.pickup?.address || '—'}</Text>

          <View style={styles.routeLine} />

          <View style={styles.routeRow}>
            <View style={[styles.routeDot, styles.routeDotDest]} />
            <Text style={styles.routeLabel}>{t('taxi.dropoffPoint')}</Text>
          </View>
          <Text style={styles.routeAddress}>{receipt.dropoff?.address || '—'}</Text>
        </View>

        <View style={styles.divider} />

        {/* Trip Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="navigate-outline" size={18} color={colors.primary} />
            <Text style={styles.statValue}>{receipt.distance}</Text>
            <Text style={styles.statLabel}>{t('taxi.distance')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.statValue}>{receipt.duration}</Text>
            <Text style={styles.statLabel}>{t('taxi.duration')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="car-sport-outline" size={18} color={colors.primary} />
            <Text style={styles.statValue}>{t(`taxi.${receipt.vehicleType || 'economy'}`)}</Text>
            <Text style={styles.statLabel}>{t('taxi.vehicleType')}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Timestamps */}
        {(receipt.startTime || receipt.endTime) && (
          <>
            <View style={styles.section}>
              {receipt.startTime && (
                <View style={styles.timeRow}>
                  <Ionicons name="play-circle-outline" size={16} color={colors.mutedForeground} />
                  <Text style={styles.timeLabel}>{t('history.started')}</Text>
                  <Text style={styles.timeValue}>{formatShortDate(receipt.startTime)}</Text>
                </View>
              )}
              {receipt.endTime && (
                <View style={styles.timeRow}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                  <Text style={styles.timeLabel}>{t('history.ended')}</Text>
                  <Text style={styles.timeValue}>{formatShortDate(receipt.endTime)}</Text>
                </View>
              )}
            </View>
            <View style={styles.divider} />
          </>
        )}

        {/* Fare Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('receipt.fareBreakdown')}</Text>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>{t('receipt.baseFare')}</Text>
            <Text style={styles.fareValue}>{Number(receipt.baseFare).toFixed(2)} ₾</Text>
          </View>
          {receipt.waitingFee > 0 && (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>{t('history.waitingFee')}</Text>
              <Text style={styles.fareValue}>{Number(receipt.waitingFee).toFixed(2)} ₾</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={[styles.fareRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>{t('receipt.total')}</Text>
            <Text style={styles.totalValue}>{Number(receipt.totalFare).toFixed(2)} ₾</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Driver Info */}
        {receipt.driver && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('taxi.driver')}</Text>
            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driverName}</Text>
                {receipt.driver.vehicle && (
                  <Text style={styles.driverVehicle}>
                    {[
                      receipt.driver.vehicle.make,
                      receipt.driver.vehicle.model,
                      receipt.driver.vehicle.licensePlate,
                    ].filter(Boolean).join(' • ')}
                  </Text>
                )}
              </View>
              {receipt.driver.rating > 0 && (
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={12} color={colors.warning} />
                  <Text style={styles.ratingText}>{receipt.driver.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Decorative bottom cut */}
        <View style={styles.receiptBottomCut}>
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={styles.cutCircle} />
          ))}
        </View>
      </View>

      {/* Share Button */}
      <TouchableOpacity
        style={[styles.shareButton, sharing && styles.shareButtonDisabled]}
        onPress={handleShare}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel={t('receipt.share')}
        accessibilityHint={t('receipt.shareHint')}
      >
        {sharing ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <>
            <Ionicons name="share-outline" size={20} color={colors.background} />
            <Text style={styles.shareButtonText}>{t('receipt.share')}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.mutedForeground,
  },
  receiptCard: {
    backgroundColor: colors.background,
    margin: 16,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  receiptHeader: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.primary + '08',
  },
  receiptIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  receiptTitle: {
    ...typography.h2,
    color: colors.foreground,
    fontWeight: '700',
  },
  receiptDate: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  receiptDividerDotted: {
    width: '100%',
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 20,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.mutedForeground,
    marginBottom: 10,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  routeDotDest: {
    backgroundColor: colors.destructive,
  },
  routeLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    fontWeight: '600',
  },
  routeAddress: {
    ...typography.bodyMedium,
    color: colors.foreground,
    marginLeft: 18,
    marginTop: 2,
    marginBottom: 4,
  },
  routeLine: {
    width: 2,
    height: 18,
    backgroundColor: colors.border,
    marginLeft: 4,
    marginVertical: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  statValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.foreground,
    marginTop: 4,
  },
  statLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  timeLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    flex: 1,
  },
  timeValue: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fareLabel: {
    ...typography.bodyMedium,
    color: colors.mutedForeground,
  },
  fareValue: {
    ...typography.bodyMedium,
    fontWeight: '500',
    color: colors.foreground,
  },
  totalRow: {
    marginTop: 4,
  },
  totalLabel: {
    ...typography.h3,
    color: colors.foreground,
    fontWeight: '700',
  },
  totalValue: {
    ...typography.h2,
    color: colors.primary,
    fontWeight: '700',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  driverVehicle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warning + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  ratingText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.foreground,
  },
  receiptBottomCut: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: colors.muted,
  },
  cutCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.background,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: radius.lg,
    ...shadows.md,
  },
  shareButtonDisabled: {
    opacity: 0.5,
  },
  shareButtonText: {
    ...typography.button,
    color: colors.background,
    fontWeight: '600',
  },
});
