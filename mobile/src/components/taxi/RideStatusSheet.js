import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, shadows, useTypography } from '../../theme/colors';

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
  progress,
  driverETA,
  driverDistance,
  waitingTimeLeft,
  waitingFee,
  onCancel,
}) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();

  const renderSearchingStatus = () => (
    <>
      <View style={styles.statusHeader}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.statusTitle}>{t('taxi.lookingForDriver')}</Text>
      </View>
      <View style={styles.progressContainer}>
        <Text style={styles.progressLabel}>{t('taxi.searchingForDriver')}</Text>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
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
              <Ionicons name="car" size={20} color={colors.primary} />
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
                  source={{ uri: currentRide.driver.user.profileImage }}
                  style={styles.driverAvatar}
                />
              ) : (
                <View style={styles.driverAvatarPlaceholder}>
                  <Ionicons name="person" size={32} color={colors.mutedForeground} />
                </View>
              )}
            </View>
            <View style={styles.driverInfoMain}>
              <Text style={styles.driverName} numberOfLines={1}>
                {currentRide.driver.user?.firstName} {currentRide.driver.user?.lastName}
              </Text>
              <View style={styles.driverRatingRow}>
                <Ionicons name="star" size={14} color="#FFA500" />
                <Text style={styles.driverRating}>
                  {currentRide.driver.rating?.toFixed(1) || '5.0'}
                </Text>
                <Text style={styles.driverTrips}>
                  • {currentRide.driver.totalTrips || 0} {t('taxi.trips')}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.callButton}>
              <Ionicons name="call" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Vehicle Info */}
          <View style={styles.vehicleInfo}>
            <View style={styles.vehicleIconContainer}>
              <Ionicons name="car-sport" size={24} color={colors.primary} />
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

  const renderDriverArrivedStatus = () => (
    <>
      <View style={styles.statusHeader}>
        <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        <Text style={styles.statusTitle}>{t('taxi.driverArrived')}</Text>
      </View>

      {waitingTimeLeft !== null && (
        <View style={styles.waitingContainer}>
          <View style={styles.waitingHeader}>
            <Ionicons
              name="time-outline"
              size={20}
              color={waitingTimeLeft <= 60 ? colors.destructive : colors.warning}
            />
            <Text style={styles.waitingTitle}>{t('taxi.waitingForYou')}</Text>
          </View>
          <View style={styles.waitingTimeRow}>
            <Text style={[
              styles.waitingTimeValue,
              waitingTimeLeft <= 60 && styles.waitingTimeUrgent
            ]}>
              {Math.floor(waitingTimeLeft / 60)}:{(waitingTimeLeft % 60).toString().padStart(2, '0')}
            </Text>
            <Text style={styles.waitingTimeLabel}>{t('taxi.timeRemaining')}</Text>
          </View>
          <View style={styles.waitingProgressBar}>
            <View style={[
              styles.waitingProgressFill,
              { width: `${(waitingTimeLeft / 180) * 100}%` },
              waitingTimeLeft <= 60 && styles.waitingProgressUrgent
            ]} />
          </View>
          <View style={styles.waitingFeeRow}>
            <Text style={styles.waitingFeeLabel}>
              {waitingFee > 0 ? t('taxi.paidWaiting') : t('taxi.freeWaiting')}
            </Text>
            {waitingFee > 0 && (
              <Text style={styles.waitingFeeValue}>+${waitingFee.toFixed(2)}</Text>
            )}
          </View>
          {waitingTimeLeft <= 60 && (
            <Text style={styles.waitingWarning}>{t('taxi.hurryUp')}</Text>
          )}
        </View>
      )}
    </>
  );

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
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {rideStatus === 'searching' && renderSearchingStatus()}
      {rideStatus === 'found' && renderDriverFoundStatus()}
      {rideStatus === 'driver_arrived' && renderDriverArrivedStatus()}
      {rideStatus === 'in_progress' && renderInProgressStatus()}

      {/* Ride Details */}
      <View style={styles.rideDetailsRow}>
        <View style={styles.rideDetailItem}>
          <Text style={styles.rideDetailLabel}>{t('taxi.estimatedFare')}</Text>
          <Text style={styles.rideDetailValue}>
            ${estimatedPrice}{waitingFee > 0 ? ` (+$${waitingFee.toFixed(2)})` : ''}
          </Text>
        </View>
        <View style={styles.rideDetailItem}>
          <Text style={styles.rideDetailLabel}>{t('taxi.duration')}</Text>
          <Text style={styles.rideDetailValue}>{estimatedDuration} {t('taxi.minutes')}</Text>
        </View>
      </View>

      {/* Cancel Button (not shown during in_progress) */}
      {rideStatus !== 'in_progress' && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>{t('taxi.cancelRide')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    ...shadows.md,
  },
  driverComingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    padding: 12,
    borderRadius: radius.md,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  driverComingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    marginBottom: 12,
  },
  driverAvatarContainer: {
    marginRight: 12,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  driverAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    backgroundColor: colors.warning + '15',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.primary,
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
  waitingTimeRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  waitingTimeValue: {
    fontSize: 36,
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
  },
  waitingFeeLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  waitingFeeValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.warning,
  },
  waitingWarning: {
    ...typography.bodySmall,
    color: colors.destructive,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  inProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '15',
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  inProgressText: {
    ...typography.h2,
    color: colors.primary,
    marginLeft: 8,
  },
  rideDetailsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  rideDetailItem: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: radius.lg,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  rideDetailLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  rideDetailValue: {
    ...typography.h1,
    color: colors.foreground,
  },
  cancelButton: {
    backgroundColor: colors.destructive + '15',
    padding: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
    marginBottom: 24,
  },
  cancelButtonText: {
    ...typography.h2,
    color: colors.destructive,
  },
});
