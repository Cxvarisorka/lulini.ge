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
import { colors, radius } from '../theme/colors';

export default function WelcomeScreen({ navigation }) {
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
          <Text style={styles.brandName}>GoTours Georgia</Text>
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

          {/* Email Sign-In */}
          <TouchableOpacity
            style={styles.emailLinkContainer}
            onPress={() => navigation.navigate('Login')}
            disabled={isLoading}
          >
            <Ionicons name="mail-outline" size={18} color={colors.primary} />
            <Text style={styles.emailLinkText}>{t('auth.continueWithEmail')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.termsText}>
          {t('auth.termsAgreement')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
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
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
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
    marginHorizontal: 16,
    color: colors.mutedForeground,
    fontSize: 14,
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
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  emailLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  emailLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  termsText: {
    marginTop: 24,
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
  },
});
