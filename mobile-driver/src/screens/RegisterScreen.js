import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

const CACHE_KEY = 'driver_register_draft';

export default function RegisterScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const { loginWithToken } = useAuth();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  // Step 1 fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Email verification modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const resendTimerRef = useRef(null);
  const codeInputRef = useRef(null);
  const [emailVerified, setEmailVerified] = useState(false);

  // Step 2 fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Phone verification modal — the phone must be verified BEFORE the user row
  // is created so a failed SMS verification doesn't leave an orphan account.
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneVerifyLoading, setPhoneVerifyLoading] = useState(false);
  const [phoneResendTimer, setPhoneResendTimer] = useState(0);
  const phoneResendTimerRef = useRef(null);
  const phoneCodeInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  // ─── Cache: restore on mount ────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY).then(raw => {
      if (raw) {
        try {
          const data = JSON.parse(raw);
          if (data.email) setEmail(data.email);
          if (data.firstName) setFirstName(data.firstName);
          if (data.lastName) setLastName(data.lastName);
          if (data.phone) setPhone(data.phone);
          // Never restore step past 1 or emailVerified — the server-side
          // EmailOTP proof has a 30-min TTL and may have expired.
          // The user must re-verify email when resuming.
        } catch {}
      }
      setCacheLoaded(true);
    });
  }, []);

  // ─── Cache: persist on change ───────────────────────────────────────────
  const saveCache = useCallback(() => {
    const data = { email, firstName, lastName, phone };
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {});
  }, [email, firstName, lastName, phone]);

  useEffect(() => {
    if (cacheLoaded) saveCache();
  }, [cacheLoaded, saveCache]);

  const clearCache = () => AsyncStorage.removeItem(CACHE_KEY).catch(() => {});

  // ─── Timer helper ───────────────────────────────────────────────────────
  const startResendTimer = () => {
    setResendTimer(60);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
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

  useEffect(() => {
    return () => {
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
      if (phoneResendTimerRef.current) clearInterval(phoneResendTimerRef.current);
    };
  }, []);

  const startPhoneResendTimer = () => {
    setPhoneResendTimer(60);
    if (phoneResendTimerRef.current) clearInterval(phoneResendTimerRef.current);
    phoneResendTimerRef.current = setInterval(() => {
      setPhoneResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(phoneResendTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ─── Validation helpers ────────────────────────────────────────────────

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
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      Alert.alert(t('common.error'), t('register.passwordComplexity'));
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
    if (!/^\+?[0-9\s\-()]{7,15}$/.test(phone.trim())) {
      Alert.alert(t('common.error'), t('register.phoneInvalid'));
      return false;
    }
    return true;
  };

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleNextStep = async () => {
    if (!validateStep1()) return;

    // If email already verified, skip to step 2
    if (emailVerified) {
      setStep(2);
      return;
    }

    // Send email verification code and show modal
    setLoading(true);
    try {
      const response = await authAPI.sendEmailVerification(
        email.trim().toLowerCase(),
        i18n.language
      );
      if (response.data.success) {
        setEmailCode('');
        setShowVerifyModal(true);
        startResendTimer();
        setTimeout(() => codeInputRef.current?.focus(), 400);
      }
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

  const handleVerifyEmail = async () => {
    if (emailCode.trim().length !== 6) {
      Alert.alert(t('common.error'), t('register.enterVerificationCode'));
      return;
    }

    setEmailVerifyLoading(true);
    try {
      const response = await authAPI.verifyEmailForRegistration(
        email.trim().toLowerCase(),
        emailCode.trim()
      );
      if (response.data.success) {
        if (resendTimerRef.current) clearInterval(resendTimerRef.current);
        setEmailVerified(true);
        setShowVerifyModal(false);
        setStep(2);
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendTimer > 0) return;
    setEmailVerifyLoading(true);
    try {
      await authAPI.sendEmailVerification(
        email.trim().toLowerCase(),
        i18n.language
      );
      startResendTimer();
    } catch (error) {
      const message = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  const handleCloseVerifyModal = () => {
    setShowVerifyModal(false);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
  };

  // Step 2 submit: send the phone OTP and open the verification modal. The
  // user row is only created AFTER the phone is verified, inside
  // handleVerifyPhoneAndRegister — a failed verification therefore leaves no
  // orphan account in the DB.
  const handleRegister = async () => {
    if (!validateStep2()) return;

    setLoading(true);
    try {
      const response = await authAPI.sendRegistrationPhoneOtp(phone.trim());
      if (response.data.success) {
        setPhoneCode('');
        setShowPhoneVerifyModal(true);
        startPhoneResendTimer();
        setTimeout(() => phoneCodeInputRef.current?.focus(), 400);
      }
    } catch (error) {
      const serverMessage = error.response?.data?.message;
      if (serverMessage?.toLowerCase().includes('another driver')) {
        Alert.alert(t('common.error'), serverMessage);
      } else {
        Alert.alert(t('common.error'), serverMessage || t('errors.somethingWentWrong'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Verify the phone OTP and, on success, atomically create the user.
  const handleVerifyPhoneAndRegister = async () => {
    if (phoneCode.trim().length !== 6) {
      Alert.alert(t('common.error'), t('register.enterVerificationCode'));
      return;
    }

    setPhoneVerifyLoading(true);
    try {
      // Step A: prove phone ownership
      await authAPI.verifyRegistrationPhoneOtp(phone.trim(), phoneCode.trim());

      // Step B: create the user (both email + phone now verified server-side)
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

      if (phoneResendTimerRef.current) clearInterval(phoneResendTimerRef.current);
      setShowPhoneVerifyModal(false);
      clearCache();

      // Auto-login using the token returned by /auth/register
      const { token, data } = registerResponse.data;
      if (token && data?.user) {
        const result = await loginWithToken(token, data.user);
        if (!result.success) {
          navigation.replace('Login');
        }
      } else {
        // Fallback: token missing (shouldn't happen), redirect to login
        navigation.replace('Login');
      }
    } catch (error) {
      const serverMessage = error.response?.data?.message;
      if (serverMessage?.toLowerCase().includes('already')) {
        Alert.alert(t('common.error'), t('register.emailAlreadyExists'));
      } else {
        Alert.alert(t('common.error'), serverMessage || t('errors.somethingWentWrong'));
      }
    } finally {
      setPhoneVerifyLoading(false);
    }
  };

  const handleResendPhoneCode = async () => {
    if (phoneResendTimer > 0) return;
    setPhoneVerifyLoading(true);
    try {
      await authAPI.sendRegistrationPhoneOtp(phone.trim());
      startPhoneResendTimer();
    } catch (error) {
      const message = error.response?.data?.message || t('errors.somethingWentWrong');
      Alert.alert(t('common.error'), message);
    } finally {
      setPhoneVerifyLoading(false);
    }
  };

  const handleClosePhoneVerifyModal = () => {
    setShowPhoneVerifyModal(false);
    if (phoneResendTimerRef.current) clearInterval(phoneResendTimerRef.current);
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    // Reset verification if email changes
    if (emailVerified) {
      setEmailVerified(false);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else {
      navigation.goBack();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────

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
          onPress={handleBack}
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
            <View style={[styles.inputContainer, emailVerified && styles.inputVerified]}>
              <Ionicons
                name={emailVerified ? 'checkmark-circle' : 'mail-outline'}
                size={20}
                color={emailVerified ? colors.success : colors.mutedForeground}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder={t('auth.email')}
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                editable={!loading}
                accessibilityLabel={t('auth.email')}
              />
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
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
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
              onPress={handleNextStep}
              disabled={loading}
              accessibilityLabel={t('common.continue')}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{t('common.continue')}</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          // ── Step 2: Personal details ──
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>{t('register.personalDetails')}</Text>

            {/* First name */}
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('register.firstName')}
                placeholderTextColor={colors.mutedForeground}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="off"
                editable={!loading}
              />
            </View>

            {/* Last name */}
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('register.lastName')}
                placeholderTextColor={colors.mutedForeground}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="off"
                editable={!loading}
              />
            </View>

            {/* Phone */}
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('register.phonePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="off"
                editable={!loading}
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

      {/* ── Email Verification Modal ── */}
      <Modal
        visible={showVerifyModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseVerifyModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleCloseVerifyModal}
          />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
            {/* Handle bar */}
            <View style={styles.modalHandle} />

            {/* Close button */}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={handleCloseVerifyModal}
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Icon + title */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="mail-open-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>{t('register.checkYourEmail')}</Text>
              <Text style={styles.modalSubtitle}>
                {t('register.codeSentTo', { email: email.trim().toLowerCase() })}
              </Text>
            </View>

            {/* Code input */}
            <View style={styles.modalInputContainer}>
              <Ionicons name="keypad-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                ref={codeInputRef}
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                value={emailCode}
                onChangeText={(text) => setEmailCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                editable={!emailVerifyLoading}
                returnKeyType="done"
                onSubmitEditing={handleVerifyEmail}
              />
            </View>

            {/* Verify button */}
            <TouchableOpacity
              style={[styles.primaryButton, emailVerifyLoading && styles.primaryButtonDisabled]}
              onPress={handleVerifyEmail}
              disabled={emailVerifyLoading}
            >
              {emailVerifyLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{t('register.verifyEmail')}</Text>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.primaryForeground} />
                </>
              )}
            </TouchableOpacity>

            {/* Resend */}
            <TouchableOpacity
              onPress={handleResendCode}
              disabled={resendTimer > 0 || emailVerifyLoading}
              style={styles.resendButton}
            >
              <Text style={[styles.resendText, resendTimer > 0 && styles.resendTextDisabled]}>
                {resendTimer > 0
                  ? t('register.resendIn', { seconds: resendTimer })
                  : t('register.resendCode')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Phone Verification Modal ── */}
      <Modal
        visible={showPhoneVerifyModal}
        transparent
        animationType="slide"
        onRequestClose={handleClosePhoneVerifyModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleClosePhoneVerifyModal}
          />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.modalHandle} />

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={handleClosePhoneVerifyModal}
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>

            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="call-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>{t('register.verifyPhoneTitle')}</Text>
              <Text style={styles.modalSubtitle}>
                {t('register.codeSentToPhone', { phone: phone.trim() })}
              </Text>
            </View>

            <View style={styles.modalInputContainer}>
              <Ionicons name="keypad-outline" size={20} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                ref={phoneCodeInputRef}
                style={[styles.input, styles.codeInput]}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                value={phoneCode}
                onChangeText={(text) => setPhoneCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                editable={!phoneVerifyLoading}
                returnKeyType="done"
                onSubmitEditing={handleVerifyPhoneAndRegister}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, phoneVerifyLoading && styles.primaryButtonDisabled]}
              onPress={handleVerifyPhoneAndRegister}
              disabled={phoneVerifyLoading}
            >
              {phoneVerifyLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>{t('register.verifyPhone')}</Text>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.primaryForeground} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResendPhoneCode}
              disabled={phoneResendTimer > 0 || phoneVerifyLoading}
              style={styles.resendButton}
            >
              <Text style={[styles.resendText, phoneResendTimer > 0 && styles.resendTextDisabled]}>
                {phoneResendTimer > 0
                  ? t('register.resendIn', { seconds: phoneResendTimer })
                  : t('register.resendCode')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  inputVerified: {
    borderWidth: 1.5,
    borderColor: colors.success,
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
  codeInput: {
    letterSpacing: 6,
    fontSize: 20,
    fontWeight: '600',
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

  // ── Modal styles ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 1,
    padding: 4,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${colors.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.h2,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: radius.lg,
    marginBottom: 14,
    paddingHorizontal: 16,
    height: 56,
    ...shadows.sm,
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 8,
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
});
