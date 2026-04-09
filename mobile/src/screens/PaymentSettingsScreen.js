import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, radius, shadows, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function PaymentSettingsScreen() {
  const typography = useTypography();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(typography, colors, insets), [typography, colors, insets]);
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.scrollContent}>
        {/* Payment Methods Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('payment.paymentMethods')}</Text>
          <View style={styles.methodCard}>
            <View style={styles.methodRow}>
              <View style={styles.methodIconContainer}>
                <Ionicons name="cash-outline" size={22} color="#4CAF50" />
              </View>
              <View style={styles.methodInfo}>
                <Text style={styles.methodTitle}>{t('payment.cash')}</Text>
                <Text style={styles.methodDesc}>{t('payment.cashAlwaysAvailable')}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
            </View>
          </View>
        </View>

        {/* Card Payments Coming Soon */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('payment.savedCardsSection')}</Text>
          <View style={styles.comingSoonCard}>
            <View style={styles.comingSoonIconCircle}>
              <Ionicons name="card-outline" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={styles.comingSoonTitle}>{t('common.comingSoon')}</Text>
            <Text style={styles.comingSoonMessage}>{t('payment.comingSoonMessage')}</Text>
          </View>
        </View>

        {/* Security Info */}
        <View style={styles.securitySection}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.mutedForeground} />
          <View style={styles.securityTextContainer}>
            <Text style={styles.securityTitle}>{t('payment.securePayments')}</Text>
            <Text style={styles.securityDesc}>{t('payment.securePaymentsDesc')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (typography, colors, insets) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  methodCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  methodIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4CAF50' + '14',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    ...typography.body,
    color: colors.foreground,
    fontWeight: '600',
  },
  methodDesc: {
    ...typography.small,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  comingSoonCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.sm,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  comingSoonIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.border + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonTitle: {
    ...typography.body,
    color: colors.foreground,
    marginTop: spacing.md,
    fontWeight: '600',
  },
  comingSoonMessage: {
    ...typography.small,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  securitySection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  securityTextContainer: {
    flex: 1,
  },
  securityTitle: {
    ...typography.small,
    color: colors.mutedForeground,
    fontWeight: '600',
    marginBottom: 2,
  },
  securityDesc: {
    ...typography.small,
    color: colors.mutedForeground,
    lineHeight: 18,
    opacity: 0.8,
  },
});
