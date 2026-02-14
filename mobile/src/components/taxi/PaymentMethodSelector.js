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
        style={[
          styles.paymentOption,
          selected === 'cash' && styles.paymentOptionSelected,
        ]}
        onPress={() => onSelect('cash')}
      >
        <Ionicons
          name="cash-outline"
          size={20}
          color={selected === 'cash' ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[
            styles.paymentText,
            selected === 'cash' && styles.paymentTextSelected,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {t('taxi.cash')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.paymentOption,
          selected === 'card' && styles.paymentOptionSelected,
        ]}
        onPress={() => onSelect('card')}
      >
        <Ionicons
          name="card-outline"
          size={20}
          color={selected === 'card' ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[
            styles.paymentText,
            selected === 'card' && styles.paymentTextSelected,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
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
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginHorizontal: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  paymentOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
    borderWidth: 3,
  },
  paymentText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  paymentTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
