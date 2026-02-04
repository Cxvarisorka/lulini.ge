import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../../theme/colors';

const VEHICLE_TYPES = [
  { id: 'economy', icon: 'car-outline', priceMultiplier: 1 },
  { id: 'comfort', icon: 'car', priceMultiplier: 1.5 },
  { id: 'business', icon: 'car-sport', priceMultiplier: 2 },
];

export default function VehicleTypeSelector({ selectedVehicle, onSelect }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {VEHICLE_TYPES.map((vehicle) => (
        <TouchableOpacity
          key={vehicle.id}
          style={[
            styles.vehicleCard,
            selectedVehicle === vehicle.id && styles.vehicleCardSelected,
          ]}
          onPress={() => onSelect(vehicle.id)}
        >
          <View style={[
            styles.vehicleIconContainer,
            selectedVehicle === vehicle.id && styles.vehicleIconContainerSelected,
          ]}>
            <Ionicons
              name={vehicle.icon}
              size={28}
              color={selectedVehicle === vehicle.id ? colors.background : colors.primary}
            />
          </View>
          <Text style={[
            styles.vehicleName,
            selectedVehicle === vehicle.id && styles.vehicleNameSelected,
          ]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {t(`taxi.${vehicle.id}`)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export { VEHICLE_TYPES };

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vehicleCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  vehicleIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  vehicleIconContainerSelected: {
    backgroundColor: colors.primary,
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  vehicleNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
