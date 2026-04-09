import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { shadows, radius, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

export default function PaymentMethodModal({ visible, onClose, onSelect }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const handleCashSelect = () => {
    onSelect('cash');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{t('taxi.selectPaymentMethod')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={styles.optionsContainer}>
              {/* Cash option */}
              <TouchableOpacity style={styles.paymentOption} onPress={handleCashSelect}>
                <View style={styles.iconContainer}>
                  <Ionicons name="cash-outline" size={28} color={colors.success} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{t('taxi.cash')}</Text>
                  <Text style={styles.optionDescription}>{t('payment.cashDesc')}</Text>
                </View>
              </TouchableOpacity>

              {/* Card payments coming soon notice */}
              <View style={[styles.paymentOption, { opacity: 0.5 }]}>
                <View style={styles.iconContainer}>
                  <Ionicons name="card-outline" size={28} color={colors.mutedForeground} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>{t('common.comingSoon')}</Text>
                  <Text style={styles.optionDescription}>{t('payment.cardComingSoon')}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (typography, colors) =>
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
      gap: 8,
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
