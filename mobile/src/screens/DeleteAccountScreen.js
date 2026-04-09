import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { shadows, radius, spacing, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { accountAPI } from '../services/api';

export default function DeleteAccountScreen({ navigation }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeletionScheduled, setIsDeletionScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(null);

  // Phone-only accounts do not have a password.
  const isLocalAccount = user?.provider === 'local' || user?.loginProvider === 'local';

  const deletionDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString();
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    if (isLocalAccount && !password.trim()) {
      Alert.alert(t('deleteAccount.error'), t('deleteAccount.passwordRequired'));
      return;
    }

    Alert.alert(
      t('deleteAccount.finalConfirmTitle'),
      t('deleteAccount.finalConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('deleteAccount.deleteButton'),
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await accountAPI.deleteAccount(isLocalAccount ? password : undefined);
              setScheduledDate(deletionDate);
              setIsDeletionScheduled(true);
            } catch (error) {
              const message =
                error?.response?.data?.message ||
                t('errors.somethingWentWrong');
              Alert.alert(t('deleteAccount.error'), message);
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [isLocalAccount, password, deletionDate, t]);

  const handleCancelDeletion = useCallback(async () => {
    setIsLoading(true);
    try {
      await accountAPI.cancelDeletion();
      Alert.alert(t('deleteAccount.cancellationSuccessTitle'), t('deleteAccount.cancellationSuccessMessage'));
      navigation.goBack();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        t('errors.somethingWentWrong');
      Alert.alert(t('deleteAccount.error'), message);
    } finally {
      setIsLoading(false);
    }
  }, [navigation, t]);

  if (isDeletionScheduled) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.scheduledContainer}>
            <View style={styles.scheduledIconCircle}>
              <Ionicons name="time-outline" size={48} color={colors.warning} />
            </View>
            <Text style={styles.scheduledTitle}>{t('deleteAccount.scheduledTitle')}</Text>
            <Text style={styles.scheduledSubtitle}>
              {t('deleteAccount.scheduledMessage', { date: scheduledDate })}
            </Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                <Text style={styles.infoText}>{t('deleteAccount.gracePeriodInfo')}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.cancelDeletionButton}
              onPress={handleCancelDeletion}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={t('deleteAccount.cancelDeletion')}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.cancelDeletionButtonText}>{t('deleteAccount.cancelDeletion')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={logout}
              accessibilityRole="button"
              accessibilityLabel={t('profile.logout')}
            >
              <Text style={styles.logoutButtonText}>{t('profile.logout')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Warning Header */}
        <View style={styles.warningHeader}>
          <View style={styles.warningIconCircle}>
            <Ionicons name="warning" size={40} color={colors.destructive} />
          </View>
          <Text style={styles.warningTitle}>{t('deleteAccount.title')}</Text>
          <Text style={styles.warningSubtitle}>{t('deleteAccount.subtitle')}</Text>
        </View>

        {/* What happens section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('deleteAccount.whatHappensTitle')}</Text>
          <View style={styles.card}>
            {[
              { icon: 'close-circle-outline', text: t('deleteAccount.consequence1') },
              { icon: 'shield-checkmark-outline', text: t('deleteAccount.consequence2') },
              { icon: 'time-outline', text: t('deleteAccount.consequence3', { days: 30 }) },
              { icon: 'card-outline', text: t('deleteAccount.consequence4') },
            ].map((item, index, arr) => (
              <View
                key={index}
                style={[
                  styles.consequenceRow,
                  index < arr.length - 1 && styles.consequenceRowBorder,
                ]}
              >
                <Ionicons name={item.icon} size={22} color={colors.destructive} style={styles.consequenceIcon} />
                <Text style={styles.consequenceText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Grace period notice */}
        <View style={styles.gracePeriodCard}>
          <Ionicons name="information-circle" size={20} color={colors.primary} />
          <Text style={styles.gracePeriodText}>
            {t('deleteAccount.gracePeriodNotice', { date: deletionDate })}
          </Text>
        </View>

        {/* Password confirmation for local accounts */}
        {isLocalAccount && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('deleteAccount.confirmPasswordTitle')}</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoComplete="password"
                accessibilityLabel={t('auth.password')}
              />
            </View>
          </View>
        )}

        {/* Delete button */}
        <TouchableOpacity
          style={[
            styles.deleteButton,
            (isLocalAccount && !password.trim()) && styles.deleteButtonDisabled,
          ]}
          onPress={handleDeleteAccount}
          disabled={isLoading || (isLocalAccount && !password.trim())}
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount.deleteButton')}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color={colors.background} style={styles.deleteButtonIcon} />
              <Text style={styles.deleteButtonText}>{t('deleteAccount.deleteButton')}</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Keep account button */}
        <TouchableOpacity
          style={styles.keepButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount.keepAccount')}
        >
          <Text style={styles.keepButtonText}>{t('deleteAccount.keepAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.muted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  warningHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  warningIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.destructive + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  warningTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.destructive,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  warningSubtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  consequenceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  consequenceIcon: {
    marginRight: spacing.md,
    marginTop: 1,
  },
  consequenceText: {
    ...typography.body,
    color: colors.foreground,
    flex: 1,
    lineHeight: 22,
  },
  gracePeriodCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary + '10',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  gracePeriodText: {
    ...typography.bodySmall,
    color: colors.foreground,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 20,
  },
  passwordInput: {
    ...typography.body,
    color: colors.foreground,
    padding: spacing.lg,
    minHeight: 52,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonIcon: {
    marginRight: spacing.sm,
  },
  deleteButtonText: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.background,
  },
  keepButton: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  keepButtonText: {
    ...typography.h3,
    color: colors.foreground,
  },
  // Scheduled deletion state
  scheduledContainer: {
    alignItems: 'center',
    paddingTop: spacing['2xl'],
  },
  scheduledIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.warning + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  scheduledTitle: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  scheduledSubtitle: {
    ...typography.body,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.foreground,
    flex: 1,
    marginLeft: spacing.sm,
    lineHeight: 20,
  },
  cancelDeletionButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 52,
    ...shadows.sm,
  },
  cancelDeletionButtonText: {
    ...typography.h3,
    fontWeight: '600',
    color: colors.background,
  },
  logoutButton: {
    width: '100%',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  logoutButtonText: {
    ...typography.h3,
    color: colors.mutedForeground,
  },
});
