import React, { useState, useMemo } from 'react';
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { colors, shadows, radius, useTypography } from '../theme/colors';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const styles = useMemo(() => createStyles(typography), [typography]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert(t('common.error'), 'Please enter email and password');
      return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert(t('common.error'), t('auth.invalidEmail') || 'Invalid email format');
      return;
    }

    setLoading(true);
    try {
      const result = await login(trimmedEmail, trimmedPassword);
      if (!result.success) {
        Alert.alert(
          t('common.error'),
          result.message === 'Not authorized as driver'
            ? t('auth.notAuthorized')
            : t('auth.invalidCredentials')
        );
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Logo/Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={60} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('auth.loginTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Ionicons
              name="mail-outline"
              size={20}
              color={colors.mutedForeground}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={colors.mutedForeground}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder={t('auth.password')}
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeIcon}
            >
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Text style={styles.loginButtonText}>{t('auth.loginButton')}</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Lulini Driver v1.0.0</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...shadows.md,
  },
  title: {
    ...typography.display,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    maxHeight: 300,
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
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    height: 56,
    marginTop: 8,
    ...shadows.md,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    ...typography.button,
    color: colors.primaryForeground,
    marginRight: 8,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  footerText: {
    ...typography.captionSmall,
    color: colors.mutedForeground,
  },
});
