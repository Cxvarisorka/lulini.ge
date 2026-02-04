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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme/colors';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function OtpVerificationScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { phone } = route.params;
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef([]);
  const { verifyPhoneOtp, sendPhoneOtp } = useAuth();

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

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
        handleVerify(code);
      }
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code = null) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      Alert.alert(t('errors.error'), t('auth.enterFullCode'));
      return;
    }

    setIsLoading(true);
    const result = await verifyPhoneOtp(phone, otpCode);
    setIsLoading(false);

    if (result.success) {
      if (result.requiresRegistration) {
        // New user - navigate to registration screen
        navigation.replace('PhoneRegistration', { phone });
      }
      // If not requiresRegistration, user is logged in and navigation will be handled by AppNavigator
    } else {
      Alert.alert(t('errors.error'), result.error);
      // Clear OTP on error
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;

    setIsLoading(true);
    const result = await sendPhoneOtp(phone);
    setIsLoading(false);

    if (result.success) {
      setResendTimer(RESEND_COOLDOWN);
      setOtp(['', '', '', '', '', '']);
      Alert.alert(t('common.success'), t('auth.codeSent'));
    } else {
      Alert.alert(t('errors.error'), result.error);
    }
  };

  const otpString = otp.join('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
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
            styles.verifyButton,
            (otpString.length !== OTP_LENGTH || isLoading) && styles.buttonDisabled,
          ]}
          onPress={() => handleVerify()}
          disabled={otpString.length !== OTP_LENGTH || isLoading}
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
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
    marginBottom: 40,
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
});
