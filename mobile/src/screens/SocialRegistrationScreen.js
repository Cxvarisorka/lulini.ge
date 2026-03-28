import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { radius, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function SocialRegistrationScreen() {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { updateProfile, user } = useAuth();

  const validateForm = () => {
    return firstName.trim().length >= 2 && lastName.trim().length >= 2;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert(t('errors.error'), t('auth.nameRequired'));
      return;
    }

    setIsLoading(true);
    const result = await updateProfile(firstName.trim(), lastName.trim());
    setIsLoading(false);

    if (!result.success) {
      Alert.alert(t('errors.error'), result.error || t('auth.registrationFailed'));
    }
    // On success, AppNavigator will handle navigation automatically
  };

  // Show which provider they signed in with
  const providerLabel = user?.email
    ? user.email
    : t('auth.socialAccount');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="person-add-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('auth.completeProfile')}</Text>
          <Text style={styles.subtitle}>{t('auth.completeProfileDescription')}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.firstName')} *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.firstNamePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoFocus
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.lastName')} *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.lastNamePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {providerLabel && (
            <View style={styles.providerInfo}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.providerInfoText}>{providerLabel}</Text>
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!validateForm() || isLoading) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!validateForm() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.termsText}>
            {t('auth.termsAgreement')}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (typography, colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.h3,
    fontWeight: '400',
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    ...typography.h2,
    color: colors.foreground,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerInfoText: {
    ...typography.bodyMedium,
    color: colors.foreground,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.primaryForeground,
    ...typography.h2,
  },
  termsText: {
    marginTop: 16,
    ...typography.caption,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
