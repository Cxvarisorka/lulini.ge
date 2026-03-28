import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

/**
 * RegisterScreen
 *
 * Two-step form:
 *   Step 1 — Account credentials (email + password)
 *   Step 2 — Personal details (first name, last name, phone)
 *
 * On success, logs the user in via AuthContext.login and the navigator
 * sends them to the Onboarding flow automatically (handled in AppNavigator).
 */
export default function RegisterScreen({ navigation }) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  // Step 1 fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 2 fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // ─── Validation helpers ────────────────────────────────────────────────────

  const validateStep1 = () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert(t('common.error'), t('register.emailRequired'));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert(t('common.error'), t('register.invalidEmail'));
      return false;
    }
    if (!password) {
      Alert.alert(t('common.error'), t('register.passwordRequired'));
      return false;
    }
    if (password.length < 8) {
      Alert.alert(t('common.error'), t('register.passwordTooShort'));
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('common.error'), t('register.passwordMismatch'));
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!firstName.trim()) {
      Alert.alert(t('common.error'), t('register.firstNameRequired'));
      return false;
    }
    if (!lastName.trim()) {
      Alert.alert(t('common.error'), t('register.lastNameRequired'));
      return false;
    }
    if (!phone.trim()) {
      Alert.alert(t('common.error'), t('register.phoneRequired'));
      return false;
    }
    // Loose phone validation — E.164-ish
    if (!/^\+?[0-9\s\-()]{7,15}$/.test(phone.trim())) {
      Alert.alert(t('common.error'), t('register.phoneInvalid'));
      return false;
    }
    return true;
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleNextStep = () => {
    if (!validateStep1()) return;
    setStep(2);
  };

  const handleRegister = async () => {
    if (!validateStep2()) return;

    setLoading(true);
    try {
      // Create account (starts as regular user, becomes driver after onboarding + approval)
      const registerResponse = await authAPI.register({
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });

      if (!registerResponse.data?.success) {
        Alert.alert(
          t('common.error'),
          registerResponse.data?.message || t('errors.somethingWentWrong')
        );
        return;
      }

      // Auto-login after registration
      const loginResult = await login(email.trim().toLowerCase(), password);
      if (!loginResult.success) {
        // Registration succeeded but auto-login failed — send to login screen
        Alert.alert(
          t('register.successTitle'),
          t('register.successLoginManually')
        );
        navigation.replace('Login');
        return;
      }
      // Navigator will re-render and route to Onboarding automatically (AppNavigator logic)
    } catch (error) {
      const serverMessage = error.response?.data?.message;
      if (serverMessage?.toLowerCase().includes('already')) {
        Alert.alert(t('common.error'), t('register.emailAlreadyExists'));
      } else {
        Alert.alert(t('common.error'), serverMessage || t('errors.somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (step === 2 ? setStep(1) : navigation.goBack())}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={48} color={colors.primary} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('register.title')}
          </Text>
          <Text style={styles.subtitle}>{t('register.subtitle')}</Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepIndicator} accessibilityLabel={t('register.stepOf', { step, total: 2 })}>
          {[1, 2].map((s) => (
            <View
              key={s}
              style={[styles.stepDot, s === step && styles.stepDotActive, s < step && styles.stepDotDone]}
            />
          ))}
        </View>

        {step === 1 ? (
          // ── Step 1: Credentials ──
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>{t('register.accountDetails')}</Text>

            {/* Email */}
            <View style={styles.inputContainer} accessible accessibilityLabel={t('auth.email')}>
              <Ionicons name="mail-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.email')}
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel={t('auth.email')}
              />
            </View>

            {/* Password */}
            <View style={styles.inputContainer} accessible accessibilityLabel={t('auth.password')}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder={t('auth.password')}
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
                accessibilityLabel={t('auth.password')}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                accessibilityLabel={showPassword ? t('register.hidePassword') : t('register.showPassword')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            {/* Confirm password */}
            <View style={styles.inputContainer} accessible accessibilityLabel={t('register.confirmPassword')}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder={t('register.confirmPassword')}
                placeholderTextColor={colors.mutedForeground}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!loading}
                accessibilityLabel={t('register.confirmPassword')}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
                accessibilityLabel={showConfirmPassword ? t('register.hidePassword') : t('register.showPassword')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.passwordHint}>{t('register.passwordHint')}</Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleNextStep}
              accessibilityLabel={t('common.continue')}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>{t('common.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        ) : (
          // ── Step 2: Personal details ──
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>{t('register.personalDetails')}</Text>

            {/* First name */}
            <View style={styles.inputContainer} accessible accessibilityLabel={t('register.firstName')}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('register.firstName')}
                placeholderTextColor={colors.mutedForeground}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="given-name"
                editable={!loading}
                accessibilityLabel={t('register.firstName')}
              />
            </View>

            {/* Last name */}
            <View style={styles.inputContainer} accessible accessibilityLabel={t('register.lastName')}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('register.lastName')}
                placeholderTextColor={colors.mutedForeground}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="family-name"
                editable={!loading}
                accessibilityLabel={t('register.lastName')}
              />
            </View>

            {/* Phone */}
            <View style={styles.inputContainer} accessible accessibilityLabel={t('profile.phone')}>
              <Ionicons name="call-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('register.phonePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!loading}
                accessibilityLabel={t('profile.phone')}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              accessibilityLabel={t('register.createAccount')}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{t('register.createAccount')}</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Login link */}
        <View style={styles.loginRow}>
          <Text style={styles.loginText}>{t('register.alreadyHaveAccount')}</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            accessibilityLabel={t('auth.login')}
            accessibilityRole="link"
          >
            <Text style={styles.loginLink}>{t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...shadows.md,
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  stepDotDone: {
    backgroundColor: colors.success,
  },
  form: {
    gap: 0,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.mutedForeground,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    marginBottom: 14,
    paddingHorizontal: 16,
    height: 56,
    ...shadows.sm,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.foreground,
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  passwordHint: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
    marginBottom: 20,
    marginTop: -6,
    paddingHorizontal: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 56,
    marginTop: 8,
    gap: 8,
    ...shadows.md,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    gap: 4,
  },
  loginText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  loginLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});
