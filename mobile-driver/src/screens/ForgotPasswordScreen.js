import React, { useState, useRef, useMemo, useCallback } from 'react';
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
import { colors, shadows, radius, useTypography } from '../theme/colors';

const STEPS = ['phone', 'otp', 'password'];

export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // OTP resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  const startResendCooldown = useCallback((seconds) => {
    setResendCooldown(seconds);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOtp = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !/^\+?[0-9\s\-()]{7,20}$/.test(trimmedPhone)) {
      Alert.alert(t('common.error'), t('forgotPassword.invalidPhone'));
      return;
    }

    setLoading(true);
    try {
      await authAPI.forgotPasswordSendOtp({ phone: trimmedPhone });
      setStep('otp');
      startResendCooldown(60);
    } catch (error) {
      const message = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      await authAPI.forgotPasswordSendOtp({ phone: phone.trim() });
      startResendCooldown(60);
      Alert.alert(t('common.success'), t('forgotPassword.otpResent'));
    } catch (error) {
      const message = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async () => {
    if (!otpCode || otpCode.length < 4) {
      Alert.alert(t('common.error'), t('forgotPassword.invalidOtp'));
      return;
    }

    if (step === 'otp') {
      setStep('password');
      return;
    }

    // Step: password
    const trimmedPassword = newPassword.trim();
    if (trimmedPassword.length < 8) {
      Alert.alert(t('common.error'), t('register.passwordTooShort'));
      return;
    }
    if (!/[a-z]/.test(trimmedPassword) || !/[A-Z]/.test(trimmedPassword) || !/\d/.test(trimmedPassword)) {
      Alert.alert(t('common.error'), t('register.passwordComplexity'));
      return;
    }
    if (trimmedPassword !== confirmPassword.trim()) {
      Alert.alert(t('common.error'), t('register.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await authAPI.forgotPasswordReset({
        phone: phone.trim(),
        code: otpCode.trim(),
        newPassword: trimmedPassword,
      });
      Alert.alert(
        t('common.success'),
        t('forgotPassword.resetSuccess'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      const message = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  const currentStepIndex = STEPS.indexOf(step);

  const renderPhoneStep = () => (
    <>
      <Text style={styles.stepTitle}>{t('forgotPassword.phoneTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('forgotPassword.phoneSubtitle')}</Text>

      <View style={styles.inputContainer}>
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
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleSendOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>{t('forgotPassword.sendCode')}</Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderOtpStep = () => (
    <>
      <Text style={styles.stepTitle}>{t('forgotPassword.otpTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('forgotPassword.otpSubtitle', { phone: phone })}</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="keypad-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={t('forgotPassword.otpPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          value={otpCode}
          onChangeText={setOtpCode}
          keyboardType="number-pad"
          maxLength={6}
          editable={!loading}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyAndReset}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>{t('common.continue')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={handleResendOtp}
        disabled={resendCooldown > 0 || loading}
      >
        <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
          {resendCooldown > 0
            ? t('register.resendIn', { seconds: resendCooldown })
            : t('register.resendCode')}
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderPasswordStep = () => (
    <>
      <Text style={styles.stepTitle}>{t('forgotPassword.newPasswordTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('forgotPassword.newPasswordSubtitle')}</Text>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder={t('forgotPassword.newPassword')}
          placeholderTextColor={colors.mutedForeground}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!loading}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
          <Ionicons
            name={showPassword ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
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
        />
        <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
          <Ionicons
            name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.passwordHint}>{t('register.passwordHint')}</Text>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyAndReset}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.primaryButtonText}>{t('forgotPassword.resetButton')}</Text>
        )}
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 10 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (step === 'phone') {
              navigation.goBack();
            } else if (step === 'otp') {
              setStep('phone');
              setOtpCode('');
            } else {
              setStep('otp');
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                i <= currentStepIndex && styles.stepDotActive,
              ]}
            />
          ))}
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="key-outline" size={40} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('forgotPassword.title')}</Text>
        </View>

        {/* Step content */}
        <View style={styles.form}>
          {step === 'phone' && renderPhoneStep()}
          {step === 'otp' && renderOtpStep()}
          {step === 'password' && renderPasswordStep()}
        </View>

        {/* Back to login */}
        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.loginLinkText}>{t('forgotPassword.backToLogin')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
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
    ...typography.heading,
    fontWeight: '700',
    color: colors.foreground,
  },
  form: {
    flex: 1,
  },
  stepTitle: {
    ...typography.subheading,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  stepSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    marginBottom: 24,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    marginBottom: 16,
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
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 16,
    marginTop: -8,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 56,
    marginTop: 8,
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 16,
    padding: 8,
  },
  resendText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: colors.mutedForeground,
    fontWeight: '400',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: 24,
    padding: 8,
  },
  loginLinkText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});
