import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors, shadows, radius, useTypography } from '../theme/colors';

const { width } = Dimensions.get('window');

export default function RentalDetailScreen({ route, navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const { car } = route.params;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const handleBookNow = () => {
    if (!car.available) {
      Alert.alert(t('errors.error'), t('rentals.unavailable'));
      return;
    }
    // Navigate to booking flow or show booking modal
    Alert.alert(
      t('rentals.bookNow'),
      `${car.brand} ${car.model} - $${car.pricePerDay}/${t('rentals.perDay')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.confirm'), onPress: () => {} },
      ]
    );
  };

  const renderImagePagination = () => {
    if (!car.images || car.images.length <= 1) return null;

    return (
      <View style={styles.pagination}>
        {car.images.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              index === currentImageIndex && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    );
  };

  const specifications = [
    {
      icon: 'people-outline',
      label: t('rentals.passengers'),
      value: car.passengers,
    },
    {
      icon: 'briefcase-outline',
      label: t('rentals.luggage'),
      value: car.luggage,
    },
    {
      icon: 'git-merge-outline',
      label: t('rentals.doors'),
      value: car.doors,
    },
    {
      icon: 'cog-outline',
      label: t('rentals.transmission'),
      value: car.transmission === 'automatic' ? t('rentals.automatic') : t('rentals.manual'),
    },
    {
      icon: 'flash-outline',
      label: t('rentals.fuelType'),
      value: car.fuelType,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          {car.images && car.images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / width);
                setCurrentImageIndex(index);
              }}
            >
              {car.images.map((image, index) => (
                <Image
                  key={index}
                  source={{ uri: image }}
                  style={styles.carImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="car" size={80} color={colors.mutedForeground} />
            </View>
          )}
          {renderImagePagination()}

          <View style={[
            styles.availabilityBadge,
            { backgroundColor: car.available ? colors.success + '20' : colors.destructive + '20' }
          ]}>
            <Ionicons
              name={car.available ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={car.available ? colors.success : colors.destructive}
            />
            <Text style={[
              styles.availabilityText,
              { color: car.available ? colors.success : colors.destructive }
            ]}>
              {car.available ? t('rentals.available') : t('rentals.unavailable')}
            </Text>
          </View>
        </View>

        {/* Car Info */}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.carName}>{car.brand} {car.model}</Text>
              <Text style={styles.carYear}>{car.year} - {car.category}</Text>
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.priceValue}>${car.pricePerDay}</Text>
              <Text style={styles.priceLabel}>/{t('rentals.perDay')}</Text>
            </View>
          </View>

          {/* Specifications */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('rentals.specifications')}</Text>
            <View style={styles.specsGrid}>
              {specifications.map((spec, index) => (
                <View key={index} style={styles.specCard}>
                  <View style={styles.specIconContainer}>
                    <Ionicons name={spec.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.specLabel}>{spec.label}</Text>
                  <Text style={styles.specValue}>{spec.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Features */}
          {car.features && car.features.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('rentals.features')}</Text>
              <View style={styles.featuresContainer}>
                {car.features.map((feature, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          {car.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('rentals.description')}</Text>
              <Text style={styles.description}>{car.description}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomPriceContainer}>
          <Text style={styles.bottomPriceLabel}>{t('rentals.perDay')}</Text>
          <Text style={styles.bottomPriceValue}>${car.pricePerDay}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.bookButton,
            !car.available && styles.bookButtonDisabled,
          ]}
          onPress={handleBookNow}
          disabled={!car.available}
        >
          <Text style={styles.bookButtonText}>{t('rentals.bookNow')}</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.background} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  imageContainer: {
    position: 'relative',
  },
  carImage: {
    width: width,
    height: 280,
  },
  imagePlaceholder: {
    width: width,
    height: 280,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagination: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: colors.background,
    width: 24,
  },
  availabilityBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  availabilityText: {
    marginLeft: 4,
    ...typography.bodySmall,
    fontWeight: '600',
  },
  content: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  carName: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 4,
  },
  carYear: {
    ...typography.body,
    color: colors.mutedForeground,
    textTransform: 'capitalize',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  priceValue: {
    fontSize: 28, // Custom large price display
    fontWeight: '700',
    color: colors.foreground,
  },
  priceLabel: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h1,
    color: colors.foreground,
    marginBottom: 16,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  specCard: {
    width: '33.33%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  specIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  specLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  specValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.foreground,
  },
  featuresContainer: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureText: {
    marginLeft: 10,
    ...typography.body,
    color: colors.foreground,
  },
  description: {
    ...typography.body,
    lineHeight: 22,
    color: colors.mutedForeground,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  bottomPriceContainer: {
    flex: 1,
  },
  bottomPriceLabel: {
    ...typography.caption,
    color: colors.mutedForeground,
  },
  bottomPriceValue: {
    fontSize: 24, // Custom large price display
    fontWeight: '700',
    color: colors.foreground,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  bookButtonDisabled: {
    backgroundColor: colors.mutedForeground,
  },
  bookButtonText: {
    color: colors.background,
    ...typography.h2,
    marginRight: 8,
  },
});
