import React, { useState, useRef } from 'react';
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

import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { radius, useTypography } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

export default function SignupScreen({ navigation }) {
  const typography = useTypography();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(typography, colors), [typography, colors]);
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();

  // Email verification state
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const resendTimerRef = useRef(null);
  const codeInputRef = useRef(null);

  const startResendTimer = () => {
    setResendTimer(60);
    resendTimerRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(resendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendEmailCode = async () => {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert(t('errors.error'), t('auth.invalidEmail'));
      return;
    }

    setEmailVerifyLoading(true);
    try {
      const response = await authAPI.sendEmailVerification(email.trim());
      if (response.data.success) {
        setEmailCodeSent(true);
        setEmailCode('');
        startResendTimer();
        setTimeout(() => codeInputRef.current?.focus(), 300);
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (emailCode.trim().length !== 6) {
      Alert.alert(t('errors.error'), t('profile.enterCode'));
      return;
    }

    setEmailVerifyLoading(true);
    try {
      const response = await authAPI.verifyEmailForRegistration(email.trim(), emailCode.trim());
      if (response.data.success) {
        setEmailVerified(true);
        setEmailCodeSent(false);
        if (resendTimerRef.current) clearInterval(resendTimerRef.current);
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    setEmailVerifyLoading(true);
    try {
      await authAPI.sendEmailVerification(email.trim());
      startResendTimer();
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  // Reset verification when email changes
  const handleEmailChange = (text) => {
    setEmail(text);
    if (emailVerified || emailCodeSent) {
      setEmailVerified(false);
      setEmailCodeSent(false);
      setEmailCode('');
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
      setResendTimer(0);
    }
  };

  const handleSignup = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      Alert.alert(t('errors.error'), t('auth.fillAllFields'));
      return;
    }

    // Email verification is optional - phone verification is sufficient

    if (password !== confirmPassword) {
      Alert.alert(t('errors.error'), t('auth.passwordsNotMatch'));
      return;
    }

    if (password.length < 8) {
      Alert.alert(t('errors.error'), t('auth.passwordTooShort'));
      return;
    }

    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      Alert.alert(t('errors.error'), t('auth.passwordComplexity'));
      return;
    }

    setIsLoading(true);
    const result = await register({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      password,
    });
    setIsLoading(false);

    if (!result.success) {
      Alert.alert(t('auth.registrationFailed'), result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.createAccount')}</Text>
          <Text style={styles.subtitle}>{t('auth.joinUs')}</Text>
        </View>

        <View style={styles.form}>
          {/* Name Row */}
          <View style={styles.nameRow}>
            <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>{t('auth.firstName')}</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.firstNamePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>{t('auth.lastName')}</Text>
              <View style={styles.inputWrapper}>
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
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.email')}</Text>
            <View style={[styles.inputWrapper, emailVerified && styles.inputVerified]}>
              <Ionicons
                name={emailVerified ? 'checkmark-circle' : 'mail-outline'}
                size={20}
                color={emailVerified ? colors.success : colors.mutedForeground}
              />
              <TextInput
                style={styles.input}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!emailVerified}
              />
              {!emailVerified && !emailCodeSent && (
                <TouchableOpacity
                  onPress={handleSendEmailCode}
                  disabled={emailVerifyLoading || !email.trim()}
                  style={styles.verifyInlineButton}
                >
                  {emailVerifyLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.verifyInlineText, !email.trim() && { opacity: 0.4 }]}>
                      {t('profile.verify')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {emailVerified && (
                <TouchableOpacity onPress={() => handleEmailChange(email)}>
                  <Ionicons name="create-outline" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>

            {emailCodeSent && !emailVerified && (
              <View style={styles.codeSection}>
                <Text style={styles.codeSentText}>
                  {t('profile.codeSentTo', { email: email.trim() })}
                </Text>
                <View style={styles.codeRow}>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <Ionicons name="keypad-outline" size={20} color={colors.mutedForeground} />
                    <TextInput
                      ref={codeInputRef}
                      style={[styles.input, styles.codeInputStyle]}
                      placeholder="000000"
                      placeholderTextColor={colors.mutedForeground}
                      value={emailCode}
                      onChangeText={(text) => setEmailCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyEmailCode}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.codeSubmitButton, emailVerifyLoading && { opacity: 0.5 }]}
                    onPress={handleVerifyEmailCode}
                    disabled={emailVerifyLoading}
                  >
                    {emailVerifyLoading ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Ionicons name="checkmark" size={22} color={colors.primaryForeground} />
                    )}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={handleResendCode}
                  disabled={resendTimer > 0 || emailVerifyLoading}
                  style={styles.resendButton}
                >
                  <Text style={[styles.resendText, resendTimer > 0 && { color: colors.mutedForeground }]}>
                    {resendTimer > 0
                      ? t('profile.resendIn', { seconds: resendTimer })
                      : t('profile.resendCode')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.phone')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.password')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.confirmPasswordPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </View>
          </View>

          {/* Terms */}
          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              {t('auth.agreeToTerms')}{' '}
              <Text style={styles.termsLink} onPress={() => Alert.alert(t('auth.termsOfService'))}>{t('auth.termsOfService')}</Text>
              {' '}{t('auth.and')}{' '}
              <Text style={styles.termsLink} onPress={() => Alert.alert(t('auth.privacyPolicy'))}>{t('auth.privacyPolicy')}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.createAccount')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.haveAccount')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>{t('auth.signIn')}</Text>
            </TouchableOpacity>
          </View>
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
    padding: 24,
    paddingTop: 60,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    ...typography.display,
    fontSize: typography.display.fontSize * 1.4,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.h3,
    fontWeight: '400',
    color: colors.mutedForeground,
  },
  form: {
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
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
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputVerified: {
    borderColor: colors.success,
    backgroundColor: `${colors.success}08`,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    ...typography.h2,
    fontWeight: '400',
    color: colors.foreground,
  },
  verifyInlineButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: `${colors.primary}12`,
  },
  verifyInlineText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  codeSection: {
    marginTop: 10,
  },
  codeSentText: {
    ...typography.caption,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeInputStyle: {
    letterSpacing: 6,
    fontSize: 18,
    fontWeight: '600',
  },
  codeSubmitButton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  resendText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '500',
  },
  termsContainer: {
    marginBottom: 20,
  },
  termsText: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
  },
  termsLink: {
    color: colors.primary,
    fontWeight: '500',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    ...typography.h2,
    color: colors.primaryForeground,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  footerText: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  linkText: {
    ...typography.bodyMedium,
    color: colors.primary,
    fontWeight: '600',
  },
});
