import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { colors, radius, useTypography } from '../theme/colors';

export default function WelcomeScreen({ navigation }) {
const typography = useTypography();
  const styles = React.useMemo(() => createStyles(typography), [typography]);
    const { t } = useTranslation();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const { loginWithGoogle, loginWithApple, googleAuthReady } = useAuth();

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    const result = await loginWithGoogle();
    setIsGoogleLoading(false);

    if (!result.success && result.error !== 'Google login was cancelled') {
      Alert.alert(t('errors.error'), result.error);
    }
  };

  const handleAppleLogin = async () => {
    setIsAppleLoading(true);
    const result = await loginWithApple();
    setIsAppleLoading(false);

    if (!result.success && result.error !== 'Apple login was cancelled') {
      Alert.alert(t('errors.error'), result.error);
    }
  };

  const handlePhoneLogin = () => {
    navigation.navigate('PhoneAuth');
  };

  const isLoading = isGoogleLoading || isAppleLoading;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo / Brand */}
        <View style={styles.brandContainer}>
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={48} color={colors.primary} />
          </View>
          <Text style={styles.brandName}>Lulini</Text>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.welcome')}</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
        </View>

        <View style={styles.buttonsContainer}>
          {/* Google Sign-In */}
          <TouchableOpacity
            style={[styles.socialButton, isLoading && styles.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={isLoading || !googleAuthReady}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                <Ionicons name="logo-google" size={22} color="#DB4437" />
                <Text style={styles.socialButtonText}>{t('auth.continueWithGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple Sign-In (iOS only) */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton, isLoading && styles.buttonDisabled]}
              onPress={handleAppleLogin}
              disabled={isLoading}
            >
              {isAppleLoading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={22} color={colors.background} />
                  <Text style={[styles.socialButtonText, styles.appleButtonText]}>
                    {t('auth.continueWithApple')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>{t('auth.or')}</Text>
            <View style={styles.divider} />
          </View>

          {/* Phone Sign-In */}
          <TouchableOpacity
            style={[styles.phoneButton, isLoading && styles.buttonDisabled]}
            onPress={handlePhoneLogin}
            disabled={isLoading}
          >
            <Ionicons name="call-outline" size={22} color={colors.primaryForeground} />
            <Text style={styles.phoneButtonText}>{t('auth.continueWithPhone')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.termsText}>
          {t('auth.termsAgreement')}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (typography) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandName: {
    ...typography.h1,
    fontSize: typography.h1.fontSize * 1.2,
    fontWeight: '700',
    color: colors.foreground,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    ...typography.display,
    fontSize: typography.display.fontSize * 1.4,
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
  buttonsContainer: {
    width: '100%',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  appleButton: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  socialButtonText: {
    ...typography.h2,
    color: colors.foreground,
    marginLeft: 12,
  },
  appleButtonText: {
    color: colors.background,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.body,
    marginHorizontal: 16,
    color: colors.mutedForeground,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 16,
  },
  phoneButtonText: {
    ...typography.h2,
    color: colors.primaryForeground,
    marginLeft: 12,
  },
  termsText: {
    ...typography.caption,
    marginTop: 24,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
});
