import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { radius, useTypography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

export default function AdjustPinSheet({
  target,          // 'pickup' | 'destination'
  address,
  geocoding,
  onConfirm,
  disabled,
}) {
  const typography = useTypography();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);

  const dotColor = target === 'pickup' ? '#10B981' : '#111827';
  const confirmLabel =
    target === 'pickup'
      ? t('taxi.confirmPickup', { defaultValue: 'Confirm pickup' })
      : t('taxi.confirmDropoff', { defaultValue: 'Confirm destination' });

  return (
    <View style={styles.container}>
      <View style={styles.addressRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.addressTextWrap}>
          {geocoding ? (
            <View style={styles.geocodingRow}>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
              <Text style={styles.geocodingText}>
                {t('taxi.findingAddress', { defaultValue: 'Finding address…' })}
              </Text>
            </View>
          ) : (
            <Text style={styles.addressText} numberOfLines={2}>
              {address || t('taxi.droppedPinLocation', { defaultValue: 'Dropped pin' })}
            </Text>
          )}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.cta, disabled && styles.ctaDisabled]}
        onPress={onConfirm}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
      >
        <Text style={styles.ctaText}>{confirmLabel}</Text>
        <Ionicons name="checkmark" size={20} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingBottom: 12,
    gap: 14,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  addressTextWrap: {
    flex: 1,
  },
  addressText: {
    ...typography.bodySmall,
    color: colors.foreground,
    fontWeight: '600',
  },
  geocodingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  geocodingText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    fontWeight: '700',
  },
});
