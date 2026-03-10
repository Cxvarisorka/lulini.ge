import React from 'react';
import { Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, useTypography } from '../../theme/colors';

const PAYMENT_ICONS = {
  cash: 'cash-outline',
  card: 'card-outline',
  apple_pay: 'logo-apple',
  google_pay: 'logo-google',
};

export default function PaymentMethodSelector({ selected, onPress }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();

  const getLabel = () => {
    switch (selected) {
      case 'apple_pay': return t('taxi.applePay');
      case 'google_pay': return t('taxi.googlePay');
      case 'card': return t('taxi.card');
      default: return t('taxi.cash');
    }
  };

  const icon = PAYMENT_ICONS[selected] || PAYMENT_ICONS.cash;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.label} numberOfLines={1}>{getLabel()}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  label: {
    ...typography.bodySmall,
    color: colors.foreground,
    fontWeight: '500',
    flex: 1,
  },
});
