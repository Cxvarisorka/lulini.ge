import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import VehicleTypeSelector from './VehicleTypeSelector';
import PaymentMethodSelector from './PaymentMethodSelector';
import { colors, radius } from '../../theme/colors';

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
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('taxi.confirmRide')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Vehicle Type Selection */}
      <Text style={styles.sectionTitle}>{t('taxi.vehicleType')}</Text>
      <VehicleTypeSelector
        selectedVehicle={selectedVehicle}
        onSelect={onVehicleChange}
      />

      {/* Payment Method */}
      <Text style={styles.sectionTitle}>{t('taxi.paymentMethod')}</Text>
      <PaymentMethodSelector
        selected={paymentMethod}
        onSelect={onPaymentChange}
      />

      {/* Price and Request Button Row */}
      <View style={styles.bottomRow}>
        {estimatedPrice && (
          <View style={styles.priceInfo}>
            <Text style={styles.priceLabel}>{t('taxi.estimatedFare')}</Text>
            <Text style={styles.priceValue}>${estimatedPrice}</Text>
            <Text style={styles.durationText}>{estimatedDuration} {t('taxi.minutes')}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.requestButton, isRequesting && styles.requestButtonDisabled]}
          onPress={onRequestRide}
          disabled={isRequesting}
        >
          {isRequesting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name="car" size={20} color={colors.background} />
              <Text style={styles.requestButtonText}>{t('taxi.requestRide')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  headerSpacer: {
    width: 36,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: 12,
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceInfo: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  durationText: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
  },
  requestButtonDisabled: {
    opacity: 0.5,
  },
  requestButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
