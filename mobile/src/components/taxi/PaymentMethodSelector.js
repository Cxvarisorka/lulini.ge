import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

export default function PaymentMethodSelector({ selected, onSelectCash, onSelectCard, selectedCardLast4 }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();

  const isCardSelected = selected === 'saved_card' || selected === 'card' || selected === 'apple_pay' || selected === 'google_pay';

  return (
    <View style={styles.container}>
      {/* Cash pill */}
      <TouchableOpacity
        style={[styles.pill, !isCardSelected && styles.pillSelected]}
        onPress={onSelectCash}
        activeOpacity={0.7}
      >
        <Ionicons
          name="cash-outline"
          size={18}
          color={!isCardSelected ? colors.primary : colors.mutedForeground}
        />
        <Text style={[styles.pillText, !isCardSelected && styles.pillTextSelected]}>
          {t('taxi.cash')}
        </Text>
      </TouchableOpacity>

      {/* Card pill */}
      <TouchableOpacity
        style={[styles.pill, isCardSelected && styles.pillSelected]}
        onPress={onSelectCard}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isCardSelected ? 'card' : 'card-outline'}
          size={18}
          color={isCardSelected ? colors.primary : colors.mutedForeground}
        />
        <Text style={[styles.pillText, isCardSelected && styles.pillTextSelected]} numberOfLines={1}>
          {selectedCardLast4 ? `•••• ${selectedCardLast4}` : t('taxi.card')}
        </Text>
        {isCardSelected && (
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  pillText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    fontWeight: '500',
  },
  pillTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
