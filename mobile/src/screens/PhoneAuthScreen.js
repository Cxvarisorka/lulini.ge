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
import { colors, radius, useTypography } from '../theme/colors';
import { COUNTRY_CODE } from '../config/phone.config';

export default function PhoneAuthScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [localPhone, setLocalPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { sendPhoneOtp } = useAuth();

  const handlePhoneChange = (text) => {
    // Only allow digits, max 9 for Georgian numbers
    const cleaned = text.replace(/\D/g, '');
    setLocalPhone(cleaned.slice(0, 9));
  };

  const getFullPhone = () => `${COUNTRY_CODE}${localPhone}`;

  const validatePhone = () => {
    return localPhone.length === 9;
  };

  const handleSendOtp = async () => {
    if (!validatePhone()) {
      Alert.alert(t('errors.error'), t('auth.invalidPhone'));
      return;
    }

    const fullPhone = getFullPhone();
    setIsLoading(true);
    const result = await sendPhoneOtp(fullPhone);
    setIsLoading(false);

    if (result.success) {
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
        >
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
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
            <View style={styles.inputWrapper}>
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
          </View>

          <TouchableOpacity
            style={[styles.button, (!validatePhone() || isLoading) && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={!validatePhone() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
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
