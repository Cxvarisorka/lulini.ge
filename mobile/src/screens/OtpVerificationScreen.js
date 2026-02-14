import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
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
import { colors, radius, useTypography } from '../theme/colors';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function OtpVerificationScreen({ navigation, route }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { phone, isRegistered } = route.params;
  const [otpValue, setOtpValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
  const inputRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const { verifyPhoneOtp, sendPhoneOtp } = useAuth();

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Auto-focus the hidden input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleOtpChange = (text) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtpValue(cleaned);

    // Auto-submit when complete
    if (cleaned.length === OTP_LENGTH) {
      handleVerify(cleaned);
    }
  };

  const handleVerify = async (code = null) => {
    const otpCode = code || otpValue;
    if (otpCode.length !== OTP_LENGTH) {
      Alert.alert(t('errors.error'), t('auth.enterFullCode'));
      return;
    }

    // Prevent double submission (SMS autofill can trigger multiple times)
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setIsLoading(true);
    const result = await verifyPhoneOtp(phone, otpCode);
    setIsLoading(false);
    isSubmittingRef.current = false;

    if (result.success) {
      if (result.requiresRegistration) {
        navigation.replace('PhoneRegistration', { phone });
      }
    } else {
      Alert.alert(t('errors.error'), result.error);
      setOtpValue('');
      inputRef.current?.focus();
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;

    setIsLoading(true);
    const result = await sendPhoneOtp(phone);
    setIsLoading(false);

    if (result.success) {
      setResendTimer(RESEND_COOLDOWN);
      setOtpValue('');
      Alert.alert(t('common.success'), t('auth.codeSent'));
    } else {
      Alert.alert(t('errors.error'), result.error);
    }
  };

  const digits = otpValue.split('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('auth.verifyPhone')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.otpSentTo')} <Text style={styles.phoneText}>{phone}</Text>
          </Text>
          {!isRegistered && (
            <Text style={styles.newUserHint}>{t('auth.newUserHint')}</Text>
          )}
        </View>

        {/* Hidden input that captures all typing + SMS autofill */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={otpValue}
          onChangeText={handleOtpChange}
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          caretHidden
        />

        {/* Visual OTP boxes - tap to focus hidden input */}
        <Pressable style={styles.otpContainer} onPress={() => inputRef.current?.focus()}>
          {Array.from({ length: OTP_LENGTH }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.otpBox,
                digits[index] && styles.otpBoxFilled,
                index === digits.length && styles.otpBoxActive,
              ]}
            >
              <Text style={styles.otpDigit}>
                {digits[index] || ''}
              </Text>
            </View>
          ))}
        </Pressable>

        <TouchableOpacity
          style={[
            styles.verifyButton,
            (otpValue.length !== OTP_LENGTH || isLoading) && styles.buttonDisabled,
          ]}
          onPress={() => handleVerify()}
          disabled={otpValue.length !== OTP_LENGTH || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.verifyButtonText}>{t('auth.verify')}</Text>
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
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
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
  phoneText: {
    fontWeight: '600',
    color: colors.foreground,
  },
  newUserHint: {
    ...typography.bodySmall,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  otpBoxActive: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  otpDigit: {
    fontSize: Math.round(typography.display.fontSize * 1.1),
    fontWeight: '700',
    color: colors.foreground,
  },
  verifyButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: colors.primaryForeground,
    ...typography.button,
    fontWeight: '600',
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  resendTimerText: {
    ...typography.body,
    color: colors.mutedForeground,
  },
  resendText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});
