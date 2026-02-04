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

import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme/colors';

export default function PhoneAuthScreen({ navigation }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { sendPhoneOtp } = useAuth();

  const formatPhoneNumber = (text) => {
    // Remove non-digit characters except +
    let cleaned = text.replace(/[^\d+]/g, '');

    // Ensure + is only at the beginning
    if (cleaned.includes('+') && !cleaned.startsWith('+')) {
      cleaned = cleaned.replace(/\+/g, '');
    }

    return cleaned;
  };

  const handlePhoneChange = (text) => {
    setPhone(formatPhoneNumber(text));
  };

  const validatePhone = () => {
    // Basic phone validation - at least 7 digits
    const digitsOnly = phone.replace(/\D/g, '');
    return digitsOnly.length >= 7;
  };

  const handleSendOtp = async () => {
    if (!validatePhone()) {
      Alert.alert(t('errors.error'), t('auth.invalidPhone'));
      return;
    }

    setIsLoading(true);
    const result = await sendPhoneOtp(phone);
    setIsLoading(false);

    if (result.success) {
      navigation.navigate('OtpVerification', { phone });
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
        contentContainerStyle={styles.scrollContent}
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
              <Ionicons name="call-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.phonePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                autoFocus
                maxLength={20}
              />
            </View>
            <Text style={styles.hint}>{t('auth.phoneHint')}</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
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
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 18,
    color: colors.foreground,
    letterSpacing: 1,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.mutedForeground,
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
    fontSize: 16,
    fontWeight: '600',
  },
});
