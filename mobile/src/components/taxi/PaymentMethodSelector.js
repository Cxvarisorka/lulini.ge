import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../../theme/colors';

export default function PaymentMethodSelector({ selected, onSelect }) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.paymentOption, selected === 'cash' && styles.paymentOptionSelected]}
        onPress={() => onSelect('cash')}
      >
        <Ionicons
          name="cash-outline"
          size={18}
          color={selected === 'cash' ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[styles.paymentText, selected === 'cash' && styles.paymentTextSelected]}
          numberOfLines={1}
        >
          {t('taxi.cash')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.paymentOption, selected === 'card' && styles.paymentOptionSelected]}
        onPress={() => onSelect('card')}
      >
        <Ionicons
          name="card-outline"
          size={18}
          color={selected === 'card' ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[styles.paymentText, selected === 'card' && styles.paymentTextSelected]}
          numberOfLines={1}
        >
          {t('taxi.card')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentOptionSelected: {
    borderColor: colors.primary,
  },
  paymentText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  paymentTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
