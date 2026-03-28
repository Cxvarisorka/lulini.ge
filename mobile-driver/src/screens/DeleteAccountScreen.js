import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { accountAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, shadows, radius, spacing, useTypography } from '../theme/colors';

export default function DeleteAccountScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);
  const { logout } = useAuth();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const consequences = [
    t('deleteAccount.consequence1'),
    t('deleteAccount.consequence2'),
    t('deleteAccount.consequence3'),
  ];

  const handleDelete = () => {
    if (!password.trim()) {
      Alert.alert(t('common.error'), t('deleteAccount.confirmDesc'));
      return;
    }

    Alert.alert(
      t('deleteAccount.confirmTitle'),
      t('deleteAccount.warningDesc'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('deleteAccount.deleteButton'),
          style: 'destructive',
          onPress: performDelete,
        },
      ]
    );
  };

  const performDelete = async () => {
    setLoading(true);
    try {
      await accountAPI.deleteAccount(password.trim());
      Alert.alert(
        t('deleteAccount.successTitle'),
        t('deleteAccount.successDesc'),
        [{ text: t('common.ok'), onPress: logout }]
      );
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        Alert.alert(t('deleteAccount.errorTitle'), t('deleteAccount.wrongPassword'));
      } else {
        Alert.alert(t('deleteAccount.errorTitle'), t('errors.somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('deleteAccount.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Warning Banner */}
        <View
          style={styles.warningBanner}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={t('deleteAccount.warning') + '. ' + t('deleteAccount.warningDesc')}
        >
          <Ionicons name="warning" size={28} color={colors.destructive} />
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>{t('deleteAccount.warning')}</Text>
            <Text style={styles.warningDesc}>{t('deleteAccount.warningDesc')}</Text>
          </View>
        </View>

        {/* Consequences */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('deleteAccount.consequences')}</Text>
          {consequences.map((item, i) => (
            <View key={i} style={styles.consequenceRow}>
              <Ionicons name="close-circle" size={18} color={colors.destructive} style={styles.consequenceIcon} />
              <Text style={styles.consequenceText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* Password Confirmation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('deleteAccount.confirmTitle')}</Text>
          <Text style={styles.cardSubtitle}>{t('deleteAccount.confirmDesc')}</Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>{t('deleteAccount.passwordLabel')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder={t('deleteAccount.passwordPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                accessibilityLabel={t('deleteAccount.accessPasswordField')}
                accessibilityHint={t('deleteAccount.confirmDesc')}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={[styles.deleteButton, loading && styles.deleteButtonDisabled]}
          onPress={handleDelete}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount.accessDeleteButton')}
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.destructiveForeground} />
          ) : (
            <>
              <Ionicons name="trash" size={20} color={colors.destructiveForeground} />
              <Text style={styles.deleteButtonText}>{t('deleteAccount.deleteButton')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount.cancelButton')}
        >
          <Text style={styles.cancelButtonText}>{t('deleteAccount.cancelButton')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h2,
    color: colors.foreground,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: spacing.md,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.destructive,
    marginBottom: spacing.xs,
  },
  warningDesc: {
    ...typography.bodySmall,
    color: '#7f1d1d',
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  consequenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  consequenceIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  consequenceText: {
    ...typography.bodySmall,
    color: colors.foreground,
    flex: 1,
    lineHeight: 20,
  },
  inputWrapper: {
    marginTop: spacing.xs,
  },
  inputLabel: {
    ...typography.label,
    color: colors.foreground,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.destructiveForeground,
  },
  cancelButton: {
    alignItems: 'center',
    padding: spacing.md,
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.mutedForeground,
  },
});
