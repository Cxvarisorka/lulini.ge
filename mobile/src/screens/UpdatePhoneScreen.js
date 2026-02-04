import React, { useState, useRef, useEffect } from 'react';
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

import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { colors, radius, shadows } from '../theme/colors';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

const STEPS = {
  PHONE_INPUT: 'phone_input',
  OTP_VERIFICATION: 'otp_verification',
};

export default function UpdatePhoneScreen({ navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState(STEPS.PHONE_INPUT);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const inputRefs = useRef([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const validatePhone = (phoneNumber) => {
    const phoneRegex = /^\+?[\d\s()-]{7,20}$/;
    return phoneRegex.test(phoneNumber);
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      Alert.alert(t('errors.error'), t('auth.enterPhone'));
      return;
    }

    if (!validatePhone(phone)) {
      Alert.alert(t('errors.error'), t('auth.invalidPhone'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await authAPI.sendPhoneUpdateOtp(phone);
      if (response.data.success) {
        setStep(STEPS.OTP_VERIFICATION);
        setResendTimer(RESEND_COOLDOWN);
        setOtp(['', '', '', '', '', '']);
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (value, index) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (value && index === OTP_LENGTH - 1) {
      const code = newOtp.join('');
      if (code.length === OTP_LENGTH) {
        handleVerifyOtp(code);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (code = null) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      Alert.alert(t('errors.error'), t('auth.enterFullCode'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await authAPI.verifyPhoneUpdateOtp(phone, otpCode);
      if (response.data.success) {
        // Refresh user data to get updated phone
        await refreshUser();
        Alert.alert(
          t('common.success'),
          t('profile.phoneUpdated'),
          [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
      // Clear OTP on error
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;

    setIsLoading(true);
    try {
      const response = await authAPI.sendPhoneUpdateOtp(phone);
      if (response.data.success) {
        setResendTimer(RESEND_COOLDOWN);
        setOtp(['', '', '', '', '', '']);
        Alert.alert(t('common.success'), t('auth.codeSent'));
      }
    } catch (error) {
      const message = error.response?.data?.message || t('errors.tryAgain');
      Alert.alert(t('errors.error'), message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === STEPS.OTP_VERIFICATION) {
      setStep(STEPS.PHONE_INPUT);
      setOtp(['', '', '', '', '', '']);
    } else {
      navigation.goBack();
    }
  };

  const otpString = otp.join('');

  const renderPhoneInput = () => (
    <>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="call-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('profile.updatePhone')}</Text>
        <Text style={styles.subtitle}>{t('profile.updatePhoneDesc')}</Text>
      </View>

      {user?.phone && (
        <View style={styles.currentPhoneContainer}>
          <Text style={styles.currentPhoneLabel}>{t('profile.currentPhone')}</Text>
          <Text style={styles.currentPhoneValue}>{user.phone}</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>{t('profile.newPhone')}</Text>
        <View style={styles.phoneInputContainer}>
          <Ionicons name="call-outline" size={20} color={colors.mutedForeground} />
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('auth.phonePlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="phone-pad"
            autoFocus
          />
        </View>
        <Text style={styles.inputHint}>{t('auth.phoneHint')}</Text>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, (!phone.trim() || isLoading) && styles.buttonDisabled]}
        onPress={handleSendOtp}
        disabled={!phone.trim() || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.submitButtonText}>{t('auth.sendCode')}</Text>
        )}
      </TouchableOpacity>
    </>
  );

  const renderOtpVerification = () => (
    <>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('auth.verifyPhone')}</Text>
        <Text style={styles.subtitle}>
          {t('auth.otpSentTo')} <Text style={styles.phoneText}>{phone}</Text>
        </Text>
      </View>

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => (inputRefs.current[index] = ref)}
            style={[
              styles.otpInput,
              digit && styles.otpInputFilled,
            ]}
            value={digit}
            onChangeText={(value) => handleOtpChange(value, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            autoFocus={index === 0}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.submitButton,
          (otpString.length !== OTP_LENGTH || isLoading) && styles.buttonDisabled,
        ]}
        onPress={() => handleVerifyOtp()}
        disabled={otpString.length !== OTP_LENGTH || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.submitButtonText}>{t('auth.verify')}</Text>
        )}
      </TouchableOpacity>

      <View style={styles.resendContainer}>
        {resendTimer > 0 ? (
          <Text style={styles.resendTimerText}>
            {t('auth.resendIn', { seconds: resendTimer })}
          </Text>
        ) : (
          <TouchableOpacity onPress={handleResend} disabled={isLoading}>
            <Text style={styles.resendText}>{t('auth.resendCode')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.changeNumberButton}
        onPress={() => setStep(STEPS.PHONE_INPUT)}
      >
        <Text style={styles.changeNumberText}>{t('profile.changeNumber')}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        {step === STEPS.PHONE_INPUT ? renderPhoneInput() : renderOtpVerification()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
  },
  phoneText: {
    fontWeight: '600',
    color: colors.foreground,
  },
  currentPhoneContainer: {
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 24,
  },
  currentPhoneLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  currentPhoneValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  inputHint: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 8,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.foreground,
  },
  otpInputFilled: {
    borderColor: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  resendTimerText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  resendText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  changeNumberButton: {
    alignItems: 'center',
    marginTop: 16,
  },
  changeNumberText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
});
