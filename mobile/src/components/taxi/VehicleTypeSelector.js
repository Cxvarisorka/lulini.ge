import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, shadows, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

const VEHICLE_TYPES = [
  { id: 'economy', icon: 'car-outline', priceMultiplier: 1, passengers: 4 },
  { id: 'comfort', icon: 'car', priceMultiplier: 1.5, passengers: 4 },
  { id: 'business', icon: 'car-sport', priceMultiplier: 2, passengers: 3 },
  { id: 'van', icon: 'bus-outline', priceMultiplier: 1.5, passengers: 7 },
];

function CarIcon({ type, size = 36, color }) {
  const iconMap = {
    economy: 'car-outline',
    comfort: 'car',
    business: 'car-sport',
    van: 'bus-outline',
  };
  return (
    <View style={carIconStyles.wrapper}>
      <Ionicons name={iconMap[type]} size={size} color={color} />
      <View style={[carIconStyles.shadow, { backgroundColor: color + '18' }]} />
    </View>
  );
}

const carIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 48,
  },
  shadow: {
    width: 36,
    height: 6,
    borderRadius: 12,
    marginTop: -2,
  },
});

export default function VehicleTypeSelector({ selectedVehicle, onSelect, pricingConfig, routeDistance }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const getPrice = (vehicleId) => {
    if (!pricingConfig || !routeDistance) return null;
    const cat = pricingConfig.categories[vehicleId] || pricingConfig.categories.economy;
    return (cat.basePrice + routeDistance * cat.kmPrice).toFixed(1);
  };

  const getLabel = (vehicleId) => {
    if (vehicleId === 'van') return 'XL';
    return t(`taxi.${vehicleId}`);
  };

  return (
    <View style={styles.container}>
      {VEHICLE_TYPES.map((vehicle) => {
        const isSelected = selectedVehicle === vehicle.id;
        const price = getPrice(vehicle.id);
        const iconColor = isSelected ? colors.primary : colors.mutedForeground;
        return (
          <TouchableOpacity
            key={vehicle.id}
            style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
            onPress={() => onSelect(vehicle.id)}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityLabel={`${getLabel(vehicle.id)}${price ? `, ${price} ₾` : ''}, ${vehicle.passengers} ${t('taxi.passengers', { defaultValue: 'passengers' })}`}
            accessibilityState={{ checked: isSelected }}
          >
            <CarIcon type={vehicle.id} size={36} color={iconColor} />

            <View style={styles.infoSection}>
              <Text
                style={[styles.vehicleName, isSelected && styles.vehicleNameSelected]}
                numberOfLines={1}
              >
                {getLabel(vehicle.id)}
              </Text>
              <View style={styles.passengerRow}>
                <Ionicons name="person" size={11} color={isSelected ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.passengerText, isSelected && styles.passengerTextSelected]}>
                  {vehicle.passengers}
                </Text>
              </View>
            </View>

            {price && (
              <Text style={[styles.price, isSelected && styles.priceSelected]}>
                {price} ₾
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export { VEHICLE_TYPES };

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flexDirection: 'column',
    gap: 6,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 10,
  },
  vehicleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
    ...shadows.sm,
  },
  infoSection: {
    flex: 1,
    gap: 2,
  },
  vehicleName: {
    ...typography.bodySmall,
    color: colors.foreground,
    fontWeight: '600',
  },
  vehicleNameSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  passengerText: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  passengerTextSelected: {
    color: colors.primary,
  },
  price: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '700',
  },
  priceSelected: {
    color: colors.primary,
  },
});
