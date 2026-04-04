import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Linking, Animated, Modal, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, shadows, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { safetyAPI } from '../../services/api';
import ChatButton from './ChatButton';

// Helper function to convert color names to hex
const getColorHex = (colorName) => {
  const colorMap = {
    'white': '#FFFFFF',
    'black': '#000000',
    'silver': '#C0C0C0',
    'gray': '#808080',
    'grey': '#808080',
    'red': '#FF0000',
    'blue': '#0000FF',
    'green': '#008000',
    'yellow': '#FFFF00',
    'orange': '#FFA500',
    'brown': '#8B4513',
    'beige': '#F5F5DC',
    'gold': '#FFD700',
    'purple': '#800080',
    'pink': '#FFC0CB',
  };
  return colorMap[colorName?.toLowerCase()] || '#808080';
};

export default function RideStatusSheet({
  rideStatus,
  currentRide,
  estimatedPrice,
  estimatedDuration,
  totalDistance,
  progress,
  driverETA,
  driverDistance,
  waitingTimeLeft,
  waitingFee,
  onCancel,
  userLocation,
  onOpenChat,
  unreadChatCount = 0,
}) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  // Pulsing animation for waiting fee accrual
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Active ride states where SOS and Share are relevant
  const isActiveRide = ['found', 'driver_arrived', 'in_progress'].includes(rideStatus);

  const rideId = currentRide?._id || currentRide?.id;

  // Start pulsing animation when waiting fee begins accruing
  useEffect(() => {
    if (waitingFee > 0) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [waitingFee > 0]);

  const handleSOSConfirm = useCallback(async () => {
    setSosLoading(true);
    try {
      await safetyAPI.triggerSOS({
        rideId,
        location: userLocation || null,
      });
      setSosModalVisible(false);
      Alert.alert(
        t('safety.sosAlertTitle'),
        t('safety.sosAlertMessage'),
        [
          {
            text: t('safety.call112'),
            onPress: () => Linking.openURL('tel:112'),
          },
          { text: t('common.ok'), style: 'cancel' },
        ]
      );
    } catch (error) {
      setSosModalVisible(false);
      // Even on API failure, always offer the emergency call option
      Alert.alert(
        t('safety.sosAlertTitle'),
        t('safety.sosAlertFallback'),
        [
          {
            text: t('safety.call112'),
            onPress: () => Linking.openURL('tel:112'),
          },
          { text: t('common.cancel'), style: 'cancel' },
        ]
      );
    } finally {
      setSosLoading(false);
    }
  }, [rideId, userLocation, t]);

  const handleShareTrip = useCallback(async () => {
    if (!rideId) return;
    setShareLoading(true);
    try {
      const res = await safetyAPI.shareRide(rideId);
      const shareUrl = res.data?.shareUrl || `https://lulini.ge/ride/shared/${res.data?.shareToken || rideId}`;
      const etaText = driverETA ? `${driverETA} min` : '';
      const message = t('taxi.shareETAMessage', {
        eta: etaText,
        url: shareUrl,
        defaultValue: `I'm on my way! ${etaText ? `ETA: ${etaText}. ` : ''}Track my ride: ${shareUrl}`,
      });
      await Share.share({
        message,
        url: shareUrl,
        title: t('safety.shareTripTitle'),
      });
    } catch (error) {
      if (error?.message !== 'The user did not share') {
        Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
      }
    } finally {
      setShareLoading(false);
    }
  }, [rideId, driverETA, t]);

  const renderSearchingStatus = () => (
    <>
      <View style={styles.statusHeader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.statusTitle}>{t('taxi.lookingForDriver')}</Text>
      </View>
      <View style={styles.progressContainer}>
        <Text style={styles.progressLabel}>{t('taxi.searchingForDriver')}</Text>
        <View style={styles.progressBarBackground}>
          <Animated.View style={[styles.progressBarFill, { width: progress.interpolate ? progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) : `${progress}%` }]} />
        </View>
      </View>
    </>
  );

  const renderDriverFoundStatus = () => (
    <>
      <View style={styles.statusHeader}>
        <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        <Text style={styles.statusTitle}>{t('taxi.driverFound')}</Text>
      </View>

      {currentRide?.driver && (
        <View style={styles.driverInfoCard}>
          {/* Driver Coming Banner */}
          <View style={styles.driverComingBanner}>
            <View style={styles.driverComingIconContainer}>
              <Ionicons name="car" size={16} color={colors.primary} />
            </View>
            <View style={styles.driverComingTextContainer}>
              <Text style={styles.driverComingTitle}>{t('taxi.driverIsOnTheWay')}</Text>
              {driverETA !== null && driverDistance !== null && (
                <Text style={styles.driverComingSubtitle}>
                  {driverDistance < 1
                    ? `${(driverDistance * 1000).toFixed(0)}m`
                    : `${driverDistance.toFixed(1)}km`} • {driverETA} {t('taxi.minutesAway')}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Driver Info */}
          <View style={styles.driverInfoHeader}>
            <View style={styles.driverAvatarContainer}>
              {currentRide.driver.user?.profileImage ? (
                <Image
                  source={{ uri: currentRide.driver.user.profileImage, cache: 'force-cache' }}
                  style={styles.driverAvatar}
                />
              ) : (
                <View style={styles.driverAvatarPlaceholder}>
                  <Ionicons name="person" size={24} color={colors.mutedForeground} />
                </View>
              )}
            </View>
            <View style={styles.driverInfoMain}>
              <Text style={styles.driverName} numberOfLines={1}>
                {[currentRide.driver.user?.firstName, currentRide.driver.user?.lastName].filter(Boolean).join(' ')
                  || currentRide.driver.user?.fullName
                  || t('taxi.driver')}
              </Text>
              <View style={styles.driverRatingRow}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={styles.driverRating}>
                  {currentRide.driver.rating?.toFixed(1) || '5.0'}
                </Text>
                <Text style={styles.driverTrips}>
                  • {currentRide.driver.totalTrips || 0} {t('taxi.trips')}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.callButton}
              onPress={() => {
                const phone = currentRide.driver.user?.phone;
                if (phone) Linking.openURL(`tel:${phone}`);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('taxi.callDriver', { defaultValue: 'Call driver' })}
            >
              <Ionicons name="call" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Vehicle Info */}
          <View style={styles.vehicleInfo}>
            <View style={styles.vehicleIconContainer}>
              <Ionicons name="car-sport" size={18} color={colors.primary} />
            </View>
            <View style={styles.vehicleDetails}>
              <Text style={styles.vehicleName} numberOfLines={1}>
                {currentRide.driver.vehicle?.make} {currentRide.driver.vehicle?.model}
              </Text>
              <View style={styles.vehicleMetaRow}>
                <View style={styles.vehiclePlate}>
                  <Text style={styles.vehiclePlateText}>
                    {currentRide.driver.vehicle?.licensePlate}
                  </Text>
                </View>
                <View style={styles.vehicleColor}>
                  <View style={[
                    styles.colorDot,
                    { backgroundColor: getColorHex(currentRide.driver.vehicle?.color) }
                  ]} />
                  <Text style={styles.vehicleColorText}>
                    {currentRide.driver.vehicle?.color}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}
    </>
  );

  const renderDriverArrivedStatus = () => {
    const isUrgent = waitingTimeLeft !== null && waitingTimeLeft <= 60;
    const isFeeActive = waitingFee > 0;

    return (
      <>
        <View style={styles.statusHeader}>
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          <Text style={styles.statusTitle}>{t('taxi.driverArrived')}</Text>
        </View>

        {waitingTimeLeft !== null && (
          <Animated.View style={[
            styles.waitingContainer,
            isFeeActive && { transform: [{ scale: pulseAnim }] },
            isUrgent && styles.waitingContainerUrgent,
          ]}>
            {/* Header */}
            <View style={styles.waitingHeader}>
              <Ionicons
                name={isUrgent ? 'warning' : 'time-outline'}
                size={20}
                color={isUrgent ? colors.destructive : colors.warning}
              />
              <Text style={[styles.waitingTitle, isUrgent && styles.waitingTitleUrgent]}>
                {t('taxi.waitingForYou')}
              </Text>
            </View>

            {/* Countdown — large, prominent */}
            <View style={styles.waitingTimeRow}>
              <Text style={[
                styles.waitingTimeValue,
                isUrgent && styles.waitingTimeUrgent,
              ]}>
                {Math.floor(waitingTimeLeft / 60)}:{(waitingTimeLeft % 60).toString().padStart(2, '0')}
              </Text>
              <Text style={styles.waitingTimeLabel}>{t('taxi.timeRemaining')}</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.waitingProgressBar}>
              <Animated.View style={[
                styles.waitingProgressFill,
                { width: `${Math.max(0, (waitingTimeLeft / 180) * 100)}%` },
                isUrgent && styles.waitingProgressUrgent,
              ]} />
            </View>

            {/* Fee display — shown with animation when accruing */}
            <View style={styles.waitingFeeRow}>
              <Text style={styles.waitingFeeLabel}>
                {isFeeActive ? t('taxi.paidWaiting') : t('taxi.freeWaiting')}
              </Text>
              {isFeeActive && (
                <View style={styles.waitingFeeValueContainer}>
                  <Ionicons name="alert-circle" size={14} color={colors.warning} />
                  <Text style={styles.waitingFeeValue}>
                    +{waitingFee.toFixed(2)} ₾
                  </Text>
                </View>
              )}
            </View>

            {isUrgent && (
              <View style={styles.waitingWarningRow}>
                <Ionicons name="flash" size={14} color={colors.destructive} />
                <Text style={styles.waitingWarning}>{t('taxi.hurryUp')}</Text>
              </View>
            )}
          </Animated.View>
        )}
      </>
    );
  };

  const renderInProgressStatus = () => (
    <>
      <View style={styles.statusHeader}>
        <Ionicons name="car" size={24} color={colors.primary} />
        <Text style={styles.statusTitle}>{t('taxi.rideInProgress')}</Text>
      </View>
      <View style={styles.inProgressContainer}>
        <Ionicons name="navigate" size={24} color={colors.primary} />
        <Text style={styles.inProgressText}>{t('taxi.enjoyYourRide')}</Text>
      </View>
    </>
  );

  return (
    <>
      <View style={styles.container}>
        {rideStatus === 'searching' && renderSearchingStatus()}
        {rideStatus === 'found' && renderDriverFoundStatus()}
        {rideStatus === 'driver_arrived' && renderDriverArrivedStatus()}
        {rideStatus === 'in_progress' && renderInProgressStatus()}

        {/* Compact ride details — single row */}
        <View style={styles.rideDetailsRow}>
          <View style={styles.rideDetailItem}>
            <Text style={styles.rideDetailValue}>
              {estimatedPrice}{waitingFee > 0 ? ` +${waitingFee.toFixed(1)}` : ''} ₾
            </Text>
            <Text style={styles.rideDetailLabel}>{t('taxi.estimatedFare')}</Text>
          </View>
          <View style={styles.rideDetailDivider} />
          <View style={styles.rideDetailItem}>
            <Text style={styles.rideDetailValue}>{totalDistance || '—'} {t('taxi.km')}</Text>
            <Text style={styles.rideDetailLabel}>{t('taxi.distance')}</Text>
          </View>
          <View style={styles.rideDetailDivider} />
          <View style={styles.rideDetailItem}>
            <Text style={styles.rideDetailValue}>{estimatedDuration} {t('taxi.minutes')}</Text>
            <Text style={styles.rideDetailLabel}>{t('taxi.duration')}</Text>
          </View>
        </View>

        {/* Compact action bar — all in one row */}
        {isActiveRide && (
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.sosButton}
              onPress={() => setSosModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('safety.sos')}
            >
              <Text style={styles.sosButtonText}>SOS</Text>
            </TouchableOpacity>

            {onOpenChat && (
              <ChatButton
                onPress={onOpenChat}
                unreadCount={unreadChatCount}
              />
            )}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShareTrip}
              disabled={shareLoading}
              accessibilityRole="button"
              accessibilityLabel={t('safety.shareTrip')}
            >
              {shareLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel Button — always visible except in_progress */}
        {rideStatus !== 'in_progress' && (
          <TouchableOpacity
            style={styles.cancelButton}
            accessibilityRole="button"
            accessibilityLabel={t('taxi.cancelRide')}
            onPress={() => {
            if (rideStatus === 'driver_arrived') {
              Alert.alert(
                t('taxi.cancelRide'),
                t('taxi.cancelAfterArrivalWarning', { defaultValue: 'The driver has already arrived. Are you sure you want to cancel? A cancellation fee may apply.' }),
                [
                  { text: t('common.no'), style: 'cancel' },
                  { text: t('taxi.cancelRide'), style: 'destructive', onPress: onCancel },
                ]
              );
            } else {
              onCancel();
            }
          }}>
            <Ionicons name="close-circle-outline" size={18} color={colors.destructive} />
            <Text style={styles.cancelButtonText}>{t('taxi.cancelRide')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* SOS Confirmation Modal */}
      <Modal
        visible={sosModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSosModalVisible(false)}
      >
        <View style={styles.sosModalOverlay}>
          <View style={styles.sosModalCard}>
            <View style={styles.sosModalIconCircle}>
              <Ionicons name="warning" size={40} color={colors.destructive} />
            </View>
            <Text style={styles.sosModalTitle}>{t('safety.sosConfirmTitle')}</Text>
            <Text style={styles.sosModalMessage}>{t('safety.sosConfirmMessage')}</Text>

            {/* Direct 112 call — always visible even before confirming API */}
            <TouchableOpacity
              style={styles.call112Button}
              onPress={() => Linking.openURL('tel:112')}
              accessibilityRole="button"
              accessibilityLabel={t('safety.call112')}
            >
              <Ionicons name="call" size={20} color={colors.background} style={styles.call112Icon} />
              <Text style={styles.call112Text}>{t('safety.call112')}</Text>
            </TouchableOpacity>

            <View style={styles.sosModalActions}>
              <TouchableOpacity
                style={styles.sosModalCancelButton}
                onPress={() => setSosModalVisible(false)}
                disabled={sosLoading}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.sosModalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sosModalConfirmButton}
                onPress={handleSOSConfirm}
                disabled={sosLoading}
                accessibilityRole="button"
                accessibilityLabel={t('safety.sosConfirmButton')}
              >
                {sosLoading ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Text style={styles.sosModalConfirmText}>{t('safety.sosConfirmButton')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusTitle: {
    ...typography.h1,
    color: colors.foreground,
    marginLeft: 10,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  driverInfoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  driverComingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '08',
    padding: 10,
    borderRadius: radius.md,
    marginBottom: 10,
  },
  driverComingIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  driverComingTextContainer: {
    flex: 1,
  },
  driverComingTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: 2,
  },
  driverComingSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  driverInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  driverAvatarContainer: {
    marginRight: 10,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  driverAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInfoMain: {
    flex: 1,
  },
  driverName: {
    ...typography.h2,
    color: colors.foreground,
    marginBottom: 4,
  },
  driverRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.foreground,
    marginLeft: 4,
  },
  driverTrips: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  vehicleDetails: {
    flex: 1,
  },
  vehicleName: {
    ...typography.h3,
    color: colors.foreground,
    marginBottom: 6,
  },
  vehicleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehiclePlate: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.md,
    marginRight: 12,
  },
  vehiclePlateText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
  vehicleColor: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleColorText: {
    ...typography.caption,
    color: colors.mutedForeground,
    textTransform: 'capitalize',
  },
  waitingContainer: {
    backgroundColor: colors.warning + '10',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: colors.warning + '40',
  },
  waitingContainerUrgent: {
    backgroundColor: colors.destructive + '15',
    borderColor: colors.destructive,
  },
  waitingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  waitingTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginLeft: 8,
  },
  waitingTitleUrgent: {
    color: colors.destructive,
  },
  waitingTimeRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  waitingTimeValue: {
    ...typography.display,
    fontWeight: '700',
    color: colors.warning,
  },
  waitingTimeUrgent: {
    color: colors.destructive,
  },
  waitingTimeLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginTop: 4,
  },
  waitingProgressBar: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: 12,
  },
  waitingProgressFill: {
    height: '100%',
    backgroundColor: colors.warning,
    borderRadius: radius.full,
  },
  waitingProgressUrgent: {
    backgroundColor: colors.destructive,
  },
  waitingFeeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  waitingFeeLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  waitingFeeValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  waitingFeeValue: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.warning,
  },
  waitingWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  waitingWarning: {
    ...typography.bodySmall,
    color: colors.destructive,
    textAlign: 'center',
    fontWeight: '600',
  },
  inProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '08',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 12,
  },
  inProgressText: {
    ...typography.h2,
    color: colors.primary,
    marginLeft: 8,
  },
  rideDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  rideDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  rideDetailDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  rideDetailLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  rideDetailValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  // Compact action bar — single row
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sosButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.destructive,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosButtonText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.background,
    letterSpacing: 0.5,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.destructive + '10',
    paddingVertical: 12,
    borderRadius: radius.lg,
    marginBottom: 16,
  },
  cancelButtonText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.destructive,
  },
  // SOS Modal
  sosModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sosModalCard: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    ...shadows.md,
  },
  sosModalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.destructive + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sosModalTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.destructive,
    textAlign: 'center',
    marginBottom: 8,
  },
  sosModalMessage: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  call112Button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
    marginBottom: 16,
    ...shadows.sm,
  },
  call112Icon: {
    marginRight: 8,
  },
  call112Text: {
    ...typography.h2,
    fontWeight: '700',
    color: colors.background,
  },
  sosModalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  sosModalCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minHeight: 48,
  },
  sosModalCancelText: {
    ...typography.h3,
    color: colors.mutedForeground,
  },
  sosModalConfirmButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: 12,
    backgroundColor: colors.destructive + 'CC',
    minHeight: 48,
  },
  sosModalConfirmText: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.background,
  },
});
