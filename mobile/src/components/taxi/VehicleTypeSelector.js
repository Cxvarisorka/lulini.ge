import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, useTypography } from '../../theme/colors';

const VEHICLE_TYPES = [
  { id: 'economy', icon: 'car-outline', priceMultiplier: 1 },
  { id: 'comfort', icon: 'car', priceMultiplier: 1.5 },
  { id: 'business', icon: 'car-sport', priceMultiplier: 2 },
];

export default function VehicleTypeSelector({ selectedVehicle, onSelect }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {VEHICLE_TYPES.map((vehicle) => {
        const isSelected = selectedVehicle === vehicle.id;
        return (
          <TouchableOpacity
            key={vehicle.id}
            style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
            onPress={() => onSelect(vehicle.id)}
          >
            <Ionicons
              name={vehicle.icon}
              size={22}
              color={isSelected ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[styles.vehicleName, isSelected && styles.vehicleNameSelected]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t(`taxi.${vehicle.id}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export { VEHICLE_TYPES };

const createStyles = (typography) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
  },
  vehicleCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vehicleCardSelected: {
    borderColor: colors.primary,
  },
  vehicleName: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  vehicleNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
