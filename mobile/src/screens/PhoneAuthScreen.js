import React, { useState, useEffect, useRef } from 'react';
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
import { colors, radius, useTypography } from '../theme/colors';
import { COUNTRY_CODE } from '../config/phone.config';

export default function PhoneAuthScreen({ navigation }) {
  const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [localPhone, setLocalPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [phoneError, setPhoneError] = useState('');
  const cooldownRef = useRef(null);
  const { sendPhoneOtp } = useAuth();

  // Countdown timer for OTP cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(cooldownRef.current);
  }, [cooldown > 0]);

  const handlePhoneChange = (text) => {
    // Only allow digits, max 9 for Georgian numbers
    const cleaned = text.replace(/\D/g, '');
    setLocalPhone(cleaned.slice(0, 9));
    if (phoneError) setPhoneError('');
  };

  const getFullPhone = () => `${COUNTRY_CODE}${localPhone}`;

  const validatePhone = () => {
    return localPhone.length === 9;
  };

  const handleSendOtp = async () => {
    if (!validatePhone()) {
      setPhoneError(t('auth.invalidPhone'));
      return;
    }

    const fullPhone = getFullPhone();
    setIsLoading(true);
    const result = await sendPhoneOtp(fullPhone);
    setIsLoading(false);

    if (result.success) {
      setCooldown(60);
      navigation.navigate('OtpVerification', { phone: fullPhone, isRegistered: result.isRegistered });
    } else {
      Alert.alert(t('errors.error'), result.error);
    }
  };

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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="call-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('auth.enterPhone')}</Text>
          <Text style={styles.subtitle}>{t('auth.phoneDescription')}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.phoneNumber')}</Text>
            <View style={[styles.inputWrapper, phoneError ? styles.inputWrapperError : null]}>
              <View style={styles.countryCode}>
                <Text style={styles.countryFlag}>🇬🇪</Text>
                <Text style={styles.countryCodeText}>{COUNTRY_CODE}</Text>
              </View>
              <View style={styles.divider} />
              <TextInput
                style={styles.input}
                placeholder="5XX XXX XXX"
                placeholderTextColor={colors.mutedForeground}
                value={localPhone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                autoFocus
                maxLength={9}
              />
            </View>
            {phoneError ? (
              <Text style={styles.errorText}>{phoneError}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.button, (!validatePhone() || isLoading || cooldown > 0) && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={!validatePhone() || isLoading || cooldown > 0}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : cooldown > 0 ? (
              <Text style={styles.buttonText}>{t('auth.resendIn', { seconds: cooldown })}</Text>
            ) : (
              <Text style={styles.buttonText}>{t('auth.sendCode')}</Text>
            )}
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
    paddingBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    ...typography.body,
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
  inputWrapperError: {
    borderColor: colors.destructive,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCodeText: {
    ...typography.h2,
    color: colors.foreground,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    ...typography.h1,
    color: colors.foreground,
    letterSpacing: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.destructive,
    marginTop: 6,
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
    ...typography.button,
    fontWeight: '600',
  },
});
