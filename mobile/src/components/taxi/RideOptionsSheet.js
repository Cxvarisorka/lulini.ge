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
  onPaymentChange,
  onRequestRide,
  onBack,
  isRequesting,
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
      />

      {/* Payment */}
      <Text style={styles.sectionLabel}>{t('taxi.paymentMethod')}</Text>
      <PaymentMethodSelector
        selected={paymentMethod}
        onSelect={onPaymentChange}
      />

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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 8,
    marginTop: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
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
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: radius.lg,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.background,
  },
});
