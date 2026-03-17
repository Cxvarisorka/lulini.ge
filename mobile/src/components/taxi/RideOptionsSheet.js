import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import VehicleTypeSelector from './VehicleTypeSelector';
import PaymentMethodSelector from './PaymentMethodSelector';
import { colors, radius, useTypography } from '../../theme/colors';

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
}) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
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

      {/* Cash payment indicator */}
      <View style={styles.cashRow}>
        <Ionicons name="cash-outline" size={18} color={colors.success} />
        <Text style={styles.cashLabel}>{t('taxi.cash')}</Text>
      </View>

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

const createStyles = (typography) => StyleSheet.create({
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
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  cashLabel: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
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
