import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadows, radius } from '../theme/colors';

const CANCELLATION_REASONS = [
  {
    id: 'waiting_time_too_long',
    icon: 'time-outline',
  },
  {
    id: 'driver_not_moving',
    icon: 'car-outline',
  },
  {
    id: 'wrong_pickup_location',
    icon: 'location-outline',
  },
  {
    id: 'changed_my_mind',
    icon: 'close-circle-outline',
  },
  {
    id: 'found_alternative',
    icon: 'swap-horizontal-outline',
  },
  {
    id: 'price_too_high',
    icon: 'cash-outline',
  },
  {
    id: 'emergency',
    icon: 'alert-circle-outline',
  },
  {
    id: 'other',
    icon: 'ellipsis-horizontal-outline',
  },
];

export default function CancelRideModal({
  visible,
  onClose,
  onConfirm,
  isLoading = false,
}) {
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState(null);
  const [additionalNote, setAdditionalNote] = useState('');

  const handleConfirm = () => {
    if (!selectedReason) return;
    onConfirm(selectedReason, additionalNote);
    // Reset state
    setSelectedReason(null);
    setAdditionalNote('');
  };

  const handleClose = () => {
    setSelectedReason(null);
    setAdditionalNote('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('taxi.cancelRide')}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Subtitle */}
          <Text style={styles.subtitle}>{t('taxi.whyCancelRide')}</Text>

          {/* Reasons List */}
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            {CANCELLATION_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.reasonCard,
                  selectedReason === reason.id && styles.reasonCardSelected,
                ]}
                onPress={() => setSelectedReason(reason.id)}
              >
                <View style={styles.reasonContent}>
                  <View
                    style={[
                      styles.iconContainer,
                      selectedReason === reason.id &&
                        styles.iconContainerSelected,
                    ]}
                  >
                    <Ionicons
                      name={reason.icon}
                      size={20}
                      color={
                        selectedReason === reason.id
                          ? colors.primary
                          : colors.mutedForeground
                      }
                    />
                  </View>
                  <Text
                    style={[
                      styles.reasonText,
                      selectedReason === reason.id && styles.reasonTextSelected,
                    ]}
                  >
                    {t(`taxi.cancelReasons.${reason.id}`)}
                  </Text>
                </View>
                {selectedReason === reason.id && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={colors.primary}
                  />
                )}
              </TouchableOpacity>
            ))}

            {/* Additional Note Input */}
            {selectedReason && (
              <View style={styles.noteContainer}>
                <Text style={styles.noteLabel}>
                  {t('taxi.additionalNote')} ({t('taxi.optional')})
                </Text>
                <TextInput
                  style={styles.noteInput}
                  placeholder={t('taxi.addNotePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  value={additionalNote}
                  onChangeText={setAdditionalNote}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                />
                <Text style={styles.characterCount}>
                  {additionalNote.length}/200
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.goBack')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!selectedReason || isLoading) && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!selectedReason || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.confirmButtonText}>
                  {t('taxi.confirmCancel')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    maxHeight: '85%',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
    ...shadows.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 15,
    color: colors.mutedForeground,
    marginBottom: 20,
  },
  scrollView: {
    maxHeight: 400,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.secondary,
    padding: 16,
    borderRadius: radius.lg,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reasonCardSelected: {
    backgroundColor: colors.background,
    borderColor: colors.primary,
  },
  reasonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconContainerSelected: {
    backgroundColor: colors.primary + '15',
  },
  reasonText: {
    fontSize: 15,
    color: colors.foreground,
    flex: 1,
  },
  reasonTextSelected: {
    fontWeight: '600',
    color: colors.primary,
  },
  noteContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  noteInput: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 12,
    fontSize: 15,
    color: colors.foreground,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
  },
  characterCount: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'right',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  confirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.destructive,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
});
