import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

const CAR_IMAGES = {
  economy: require('../../../assets/cars/economy.png'),
  comfort: require('../../../assets/cars/comfort.png'),
  business: require('../../../assets/cars/business.png'),
  van: require('../../../assets/cars/xl.png'),
};

import PaymentMethodSelector from './PaymentMethodSelector';
import { VEHICLE_TYPES } from './VehicleTypeSelector';
import { radius, shadows, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

function formatMinutes(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return Math.max(1, Math.round(seconds / 60));
}

function getPriceFor(vehicleId, pricingConfig, routeDistance) {
  if (!pricingConfig || !routeDistance) return null;
  const cat = pricingConfig.categories[vehicleId] || pricingConfig.categories.economy;
  return (cat.basePrice + routeDistance * cat.kmPrice).toFixed(1);
}

function CarIcon({ type, size = 36 }) {
  const source = CAR_IMAGES[type] || CAR_IMAGES.economy;
  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

export default function RideOptionsSheet({
  snapIndex,
  onExpand,
  onCollapse,
  selectedVehicle,
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
  driverEtaSeconds,
  quoteLoading,
}) {
  const isExpanded = snapIndex === 1;

  if (isExpanded) {
    return (
      <ExpandedCarList
        selectedVehicle={selectedVehicle}
        pricingConfig={pricingConfig}
        routeDistance={routeDistance}
        driverEtaSeconds={driverEtaSeconds}
        onSelect={(vehicleId) => {
          onVehicleChange(vehicleId);
          onCollapse?.();
        }}
        onClose={onCollapse}
        onScheduleRide={onScheduleRide}
      />
    );
  }

  return (
    <CompactView
      selectedVehicle={selectedVehicle}
      estimatedPrice={estimatedPrice}
      estimatedDuration={estimatedDuration}
      routeDistance={routeDistance}
      onPaymentPress={onPaymentPress}
      onRequestRide={onRequestRide}
      onBack={onBack}
      onExpand={onExpand}
      isRequesting={isRequesting}
      driverEtaSeconds={driverEtaSeconds}
      quoteLoading={quoteLoading}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Compact view — single car row + payment + CTA                              */
/* -------------------------------------------------------------------------- */

function CompactView({
  selectedVehicle,
  estimatedPrice,
  estimatedDuration,
  routeDistance,
  onPaymentPress,
  onRequestRide,
  onBack,
  onExpand,
  isRequesting,
  driverEtaSeconds,
  quoteLoading,
}) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createCompactStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const driverEtaMin = formatMinutes(driverEtaSeconds);
  const vehicleLabel = selectedVehicle === 'van' ? 'XL' : t(`taxi.${selectedVehicle}`);
  const distanceText = routeDistance != null ? `${Number(routeDistance).toFixed(1)} ${t('taxi.km')}` : null;
  const durationText = estimatedDuration != null ? `${estimatedDuration} ${t('taxi.minutes')}` : null;
  const priceText = estimatedPrice != null ? `${estimatedPrice} ₾` : null;
  const hasTripStats = distanceText || durationText || priceText;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('taxi.confirmRide')}</Text>
        <View style={{ width: 22 }} />
      </View>

      <TouchableOpacity
        style={styles.carRow}
        onPress={onExpand}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('taxi.changeVehicle', { defaultValue: 'Change vehicle class' })}
      >
        <View style={styles.carIconWrap}>
          <CarIcon type={selectedVehicle} size={52} />
        </View>
        <View style={styles.carInfo}>
          <Text style={styles.carName}>{vehicleLabel}</Text>
          {quoteLoading ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} style={{ alignSelf: 'flex-start' }} />
          ) : driverEtaMin != null ? (
            <Text style={styles.carEta}>~{driverEtaMin} {t('taxi.minutes')}</Text>
          ) : (
            <Text style={styles.carEta}>{t('taxi.chooseYourRide')}</Text>
          )}
        </View>
        <View style={styles.priceCol}>
          {estimatedPrice && <Text style={styles.carPrice}>{estimatedPrice} ₾</Text>}
          <Ionicons name="chevron-up" size={16} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>

      {hasTripStats && (
        <View style={styles.tripStatsRow}>
          <View style={styles.tripStat}>
            <Text style={styles.tripStatValue}>{priceText || '—'}</Text>
            <Text style={styles.tripStatLabel}>{t('taxi.estimatedFare')}</Text>
          </View>
          <View style={styles.tripStatDivider} />
          <View style={styles.tripStat}>
            <Text style={styles.tripStatValue}>{distanceText || '—'}</Text>
            <Text style={styles.tripStatLabel}>{t('taxi.distance')}</Text>
          </View>
          <View style={styles.tripStatDivider} />
          <View style={styles.tripStat}>
            <Text style={styles.tripStatValue}>{durationText || '—'}</Text>
            <Text style={styles.tripStatLabel}>{t('taxi.duration')}</Text>
          </View>
        </View>
      )}

      <PaymentMethodSelector onPress={onPaymentPress} />

      <TouchableOpacity
        style={[styles.cta, isRequesting && styles.ctaDisabled]}
        onPress={onRequestRide}
        disabled={isRequesting}
        accessibilityRole="button"
        accessibilityLabel={t('common.submit')}
        accessibilityState={{ disabled: isRequesting }}
      >
        {isRequesting ? (
          <ActivityIndicator color={colors.background} size="small" />
        ) : (
          <Text style={styles.ctaText}>
            {t('common.submit')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Expanded view — full car class list                                        */
/* -------------------------------------------------------------------------- */

function ExpandedCarList({
  selectedVehicle,
  pricingConfig,
  routeDistance,
  driverEtaSeconds,
  onSelect,
  onClose,
  onScheduleRide,
}) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createExpandedStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const driverEtaMin = formatMinutes(driverEtaSeconds);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-down" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('taxi.chooseYourRide')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {VEHICLE_TYPES.map((vehicle) => (
          <CarClassCard
            key={vehicle.id}
            vehicle={vehicle}
            isSelected={selectedVehicle === vehicle.id}
            price={getPriceFor(vehicle.id, pricingConfig, routeDistance)}
            etaMin={driverEtaMin}
            onPress={() => onSelect(vehicle.id)}
          />
        ))}

        {onScheduleRide && (
          <TouchableOpacity
            style={styles.scheduleButton}
            onPress={onScheduleRide}
            accessibilityRole="button"
            accessibilityLabel={t('schedule.scheduleForLater')}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={styles.scheduleButtonText}>{t('schedule.scheduleForLater')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function CarClassCard({ vehicle, isSelected, price, etaMin, onPress }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createCardStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const label = vehicle.id === 'van' ? 'XL' : t(`taxi.${vehicle.id}`);
  const description = t(`taxi.${vehicle.id}Desc`, { defaultValue: '' });

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${label}${price ? `, ${price} ₾` : ''}`}
    >
      <View style={styles.cardIconWrap}>
        <CarIcon type={vehicle.id} size={68} />
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardName, isSelected && styles.cardNameSelected]}>{label}</Text>
          <View style={styles.cardSeats}>
            <Ionicons name="person" size={12} color={colors.mutedForeground} />
            <Text style={styles.cardSeatsText}>{vehicle.passengers}</Text>
          </View>
        </View>
        {!!description && (
          <Text style={styles.cardDescription} numberOfLines={1}>{description}</Text>
        )}
        {etaMin != null && (
          <Text style={styles.cardEta}>~{etaMin} {t('taxi.minutes')}</Text>
        )}
      </View>
      {price && (
        <Text style={[styles.cardPrice, isSelected && styles.cardPriceSelected]}>{price} ₾</Text>
      )}
    </TouchableOpacity>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const createCompactStyles = (typography, colors) => StyleSheet.create({
  container: {
    gap: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  carRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0A',
  },
  carIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carInfo: {
    flex: 1,
    gap: 2,
  },
  carName: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '400',
  },
  carEta: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  carPrice: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '400',
  },
  tripStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tripStat: {
    flex: 1,
    alignItems: 'center',
  },
  tripStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  tripStatValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  tripStatLabel: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    ...typography.button,
    color: colors.background,
  },
});

const createExpandedStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '700',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 8,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
  },
  scheduleButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});

const createCardStyles = (typography, colors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0A',
    ...shadows.sm,
  },
  cardIconWrap: {
    width: 56,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardName: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '400',
  },
  cardNameSelected: {
    color: colors.primary,
  },
  cardSeats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  cardSeatsText: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    fontWeight: '400',
  },
  cardDescription: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
  cardEta: {
    ...typography.captionSmall,
    color: colors.foreground,
    fontWeight: '400',
  },
  cardPrice: {
    ...typography.bodyMedium,
    color: colors.foreground,
    fontWeight: '400',
  },
  cardPriceSelected: {
    color: colors.primary,
  },
});
