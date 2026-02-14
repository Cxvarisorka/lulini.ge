import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, shadows, radius, useTypography } from '../../theme/colors';

export default function PaymentMethodModal({ visible, onClose, onSelect }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();

  const handleSelect = (method) => {
    onSelect(method);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContainer}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t('taxi.selectPaymentMethod')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Payment Options */}
            <View style={styles.optionsContainer}>
              {/* Apple Pay */}
              <TouchableOpacity
                style={styles.paymentOption}
                onPress={() => handleSelect('apple_pay')}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="logo-apple" size={28} color={colors.foreground} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{t('taxi.applePay')}</Text>
                  <Text style={styles.optionDescription}>
                    {t('taxi.applePayDesc')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>

              {/* Google Pay */}
              <TouchableOpacity
                style={styles.paymentOption}
                onPress={() => handleSelect('google_pay')}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name="logo-google" size={28} color={colors.foreground} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{t('taxi.googlePay')}</Text>
                  <Text style={styles.optionDescription}>
                    {t('taxi.googlePayDesc')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (typography) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 400,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: radius.xl,
      ...shadows.lg,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      ...typography.h3,
      color: colors.foreground,
      fontWeight: '600',
    },
    closeButton: {
      padding: 4,
    },
    optionsContainer: {
      padding: 20,
      gap: 12,
    },
    paymentOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: radius.lg,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      ...typography.body,
      color: colors.foreground,
      fontWeight: '600',
      marginBottom: 2,
    },
    optionDescription: {
      ...typography.small,
      color: colors.mutedForeground,
    },
  });
