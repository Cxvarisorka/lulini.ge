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

export default function PhoneRegistrationScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { phone } = route.params;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { verifyPhoneOtp } = useAuth();

  const validateForm = () => {
    return fullName.trim().length >= 2;
  };

  const validateEmail = (emailValue) => {
    if (!emailValue) return true; // Email is optional
    const emailRegex = /^\S+@\S+\.\S+$/;
    return emailRegex.test(emailValue);
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert(t('errors.error'), t('auth.fullNameRequired'));
      return;
    }

    if (email && !validateEmail(email)) {
      Alert.alert(t('errors.error'), t('auth.invalidEmail'));
      return;
    }

    setIsLoading(true);
    // We need to re-verify with fullName to complete registration
    // The backend will see this is a new user registration now
    const result = await verifyPhoneOtp(phone, null, fullName.trim(), email.trim() || null);
    setIsLoading(false);

    if (!result.success) {
      Alert.alert(t('errors.error'), result.error || t('auth.registrationFailed'));
    }
    // On success, AppNavigator will handle navigation
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
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="person-add-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('auth.completeProfile')}</Text>
          <Text style={styles.subtitle}>{t('auth.completeProfileDescription')}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.fullName')} *</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.fullNamePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                autoFocus
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.emailOptional')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.phoneInfo}>
            <Ionicons name="call-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.phoneInfoText}>{phone}</Text>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          </View>

          <TouchableOpacity
            style={[styles.button, (!validateForm() || isLoading) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!validateForm() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.createAccount')}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.termsText}>
            {t('auth.termsAgreement')}
          </Text>
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
    justifyContent: 'center',
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
    marginBottom: 20,
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
    fontSize: 16,
    color: colors.foreground,
  },
  phoneInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 24,
    gap: 8,
  },
  phoneInfoText: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: '500',
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
  termsText: {
    marginTop: 16,
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
});
