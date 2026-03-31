import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import VehicleTypeSelector from './VehicleTypeSelector';
import PaymentMethodSelector from './PaymentMethodSelector';
import { radius, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

export default function RideOptionsSheet({
  selectedVehicle,
  paymentMethod,
  estimatedPrice,
  estimatedDuration,
  onVehicleChange,
  onPaymentPress,
  onRequestRide,
  onBack,
  isRequesting,
  pricingConfig,
  routeDistance,
  onScheduleRide,
}) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('taxi.confirmRide')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Vehicle Type */}
      <Text style={styles.sectionLabel}>{t('taxi.vehicleType')}</Text>
      <VehicleTypeSelector
        selectedVehicle={selectedVehicle}
        onSelect={onVehicleChange}
        pricingConfig={pricingConfig}
        routeDistance={routeDistance}
      />

      {/* Payment method selector */}
      <PaymentMethodSelector selected={paymentMethod} onPress={onPaymentPress} />

      {/* Schedule for later */}
      {onScheduleRide && (
        <TouchableOpacity
          style={styles.scheduleButton}
          onPress={onScheduleRide}
          accessibilityRole="button"
          accessibilityLabel={t('schedule.scheduleForLater')}
          accessibilityHint={t('schedule.scheduleHint')}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={styles.scheduleButtonText}>{t('schedule.scheduleForLater')}</Text>
        </TouchableOpacity>
      )}

      {/* Bottom: Price + Request */}
      <View style={styles.bottomRow}>
        {estimatedPrice && (
          <View style={styles.priceInfo}>
            <Text style={styles.priceValue}>{estimatedPrice} ₾</Text>
            <Text style={styles.durationText}>~{estimatedDuration} {t('taxi.minutes')}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.requestButton, isRequesting && styles.requestButtonDisabled]}
          onPress={onRequestRide}
          disabled={isRequesting}
          accessibilityRole="button"
          accessibilityLabel={t('taxi.requestRide')}
          accessibilityState={{ disabled: isRequesting }}
        >
          {isRequesting ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.requestButtonText}>{t('taxi.requestRide')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 5,
    marginTop: 8,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
  },
  scheduleButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 12,
  },
  priceInfo: {
    flex: 1,
  },
  priceValue: {
    ...typography.h2,
    color: colors.foreground,
  },
  durationText: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  requestButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: radius.lg,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonText: {
    ...typography.button,
    color: colors.background,
  },
});
