import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadows, radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function RideReviewModal({ visible, ride, onClose, onSubmit, isLoading }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [scaleValues] = useState([1, 2, 3, 4, 5].map(() => new Animated.Value(1)));

  const handleStarPress = (selectedRating) => {
    setRating(selectedRating);

    // Animate the selected star
    Animated.sequence([
      Animated.timing(scaleValues[selectedRating - 1], {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleValues[selectedRating - 1], {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSubmit = async () => {
    if (rating > 0) {
      try {
        await onSubmit(rating, review);
        // Only reset form after successful submission
        setRating(0);
        setReview('');
      } catch {
        // Keep user input on failure so they can retry
      }
    }
  };

  const handleClose = () => {
    setRating(0);
    setReview('');
    onClose();
  };

  if (!ride) return null;

  const driver = ride.driver;
  const driverUser = driver?.user;
  const driverName = [driverUser?.firstName, driverUser?.lastName].filter(Boolean).join(' ')
    || driverUser?.fullName
    || t('taxi.driver');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, spacing['3xl']) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            </View>
            <Text style={styles.title}>{t('taxi.rideCompleted')}</Text>
            <Text style={styles.subtitle}>
              {t('taxi.howWasYourRide')}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Driver Info */}
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Ionicons name="person" size={32} color={colors.primary} />
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName} numberOfLines={1}>{driverName}</Text>
                <View style={styles.driverMeta}>
                  {driver?.rating > 0 && (
                    <View style={styles.driverRatingRow}>
                      <Ionicons name="star" size={14} color={colors.warning} />
                      <Text style={styles.driverRating}>
                        {driver.rating.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  {driver?.totalTrips > 0 && (
                    <Text style={styles.driverTrips}>
                      {driver.rating > 0 ? '• ' : ''}{driver.totalTrips} {t('taxi.trips')}
                    </Text>
                  )}
                </View>
                <View style={styles.vehicleInfo}>
                  <Ionicons name="car" size={14} color={colors.mutedForeground} />
                  <Text style={styles.vehicleText}>
                    {driver?.vehicle?.make} {driver?.vehicle?.model}
                  </Text>
                  {driver?.vehicle?.licensePlate && (
                    <View style={styles.licensePlateBadge}>
                      <Text style={styles.licensePlateText}>{driver.vehicle.licensePlate}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Rating Stars */}
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingLabel}>{t('taxi.rateYourDriver')}</Text>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => handleStarPress(star)}
                    style={styles.starButton}
                    disabled={isLoading}
                    accessibilityRole="button"
                    accessibilityLabel={`${star} ${star === 1 ? t('taxi.star', { defaultValue: 'star' }) : t('taxi.stars', { defaultValue: 'stars' })}`}
                    accessibilityState={{ selected: star <= rating }}
                  >
                    <Animated.View
                      style={{
                        transform: [{ scale: scaleValues[star - 1] }],
                      }}
                    >
                      <Ionicons
                        name={star <= rating ? 'star' : 'star-outline'}
                        size={44}
                        color={star <= rating ? colors.warning : colors.border}
                      />
                    </Animated.View>
                  </TouchableOpacity>
                ))}
              </View>
              {rating > 0 && (
                <Text style={styles.ratingText}>
                  {rating === 5 && t('taxi.excellent')}
                  {rating === 4 && t('taxi.good')}
                  {rating === 3 && t('taxi.okay')}
                  {rating === 2 && t('taxi.bad')}
                  {rating === 1 && t('taxi.terrible')}
                </Text>
              )}
            </View>

            {/* Review Text Input */}
            <View style={styles.reviewContainer}>
              <Text style={styles.reviewLabel}>
                {t('taxi.additionalComments')} {t('common.optional')}
              </Text>
              <TextInput
                style={styles.reviewInput}
                placeholder={t('taxi.shareYourExperience')}
                placeholderTextColor={colors.mutedForeground}
                value={review}
                onChangeText={setReview}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isLoading}
              />
            </View>

            {/* Ride Summary */}
            <View style={styles.rideSummary}>
              <View style={styles.summaryRow}>
                <Ionicons name="cash-outline" size={20} color={colors.mutedForeground} />
                <Text style={styles.summaryLabel}>{t('taxi.totalFare')}</Text>
                <Text style={styles.summaryValue}>{ride.fare || ride.quote?.totalPrice} ₾</Text>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name="time-outline" size={20} color={colors.mutedForeground} />
                <Text style={styles.summaryLabel}>{t('taxi.duration')}</Text>
                <Text style={styles.summaryValue}>{ride.quote?.durationText}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name="navigate-outline" size={20} color={colors.mutedForeground} />
                <Text style={styles.summaryLabel}>{t('taxi.distance')}</Text>
                <Text style={styles.summaryValue}>{ride.quote?.distanceText}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.submitButton, rating === 0 && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={rating === 0 || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.submitButtonText}>{t('taxi.submitReview')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleClose}
              disabled={isLoading}
            >
              <Text style={styles.skipButtonText}>{t('taxi.skipForNow')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingTop: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    maxHeight: '90%',
    ...shadows.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    marginBottom: 12,
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 24,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    ...typography.h2,
    color: colors.foreground,
    marginBottom: 4,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
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
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginLeft: 4,
  },
  licensePlateBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginLeft: 8,
  },
  licensePlateText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
  ratingContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ratingLabel: {
    ...typography.h2,
    color: colors.foreground,
    marginBottom: 16,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: {
    padding: 4,
    marginHorizontal: 4,
  },
  ratingText: {
    ...typography.h2,
    color: colors.primary,
    marginTop: 8,
  },
  reviewContainer: {
    marginBottom: 24,
  },
  reviewLabel: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  reviewInput: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: 12,
    ...typography.bodyMedium,
    color: colors.foreground,
    minHeight: 100,
  },
  rideSummary: {
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    flex: 1,
    ...typography.body,
    color: colors.mutedForeground,
    marginLeft: 12,
  },
  summaryValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
  },
  actions: {
    gap: 12,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    ...typography.h2,
    color: colors.background,
  },
  skipButton: {
    padding: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    ...typography.body,
    color: colors.mutedForeground,
  },
});
