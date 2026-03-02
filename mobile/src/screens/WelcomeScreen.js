import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { colors, radius, useTypography } from '../theme/colors';

const CANCELLED_ERRORS = {
  google: 'Google login was cancelled',
  apple: 'Apple login was cancelled',
};

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

    if (!result.success && result.error !== CANCELLED_ERRORS.google) {
      Alert.alert(t('errors.error'), result.error);
    }
  };

  const handleAppleLogin = async () => {
    setIsAppleLoading(true);
    const result = await loginWithApple();
    setIsAppleLoading(false);

    if (!result.success && result.error !== CANCELLED_ERRORS.apple) {
      Alert.alert(t('errors.error'), result.error);
    }
  };

  const handleEmailLogin = () => {
    navigation.navigate('Login');
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
          <Image
            source={require('../../assets/logo/png_files_app 512 × 512-26.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
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

          {/* Email Sign-In */}
          <TouchableOpacity
            style={[styles.phoneButton, isLoading && styles.buttonDisabled]}
            onPress={handleEmailLogin}
            disabled={isLoading}
          >
            <Ionicons name="mail-outline" size={22} color={colors.primaryForeground} />
            <Text style={styles.phoneButtonText}>{t('auth.continueWithEmail')}</Text>
          </TouchableOpacity>

          {/* Phone Sign-In */}
          <TouchableOpacity
            style={[styles.secondaryButton, isLoading && styles.buttonDisabled]}
            onPress={handlePhoneLogin}
            disabled={isLoading}
          >
            <Ionicons name="call-outline" size={22} color={colors.foreground} />
            <Text style={styles.secondaryButtonText}>{t('auth.continueWithPhone')}</Text>
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
    paddingBottom: 48,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: -8,
  },
  logoImage: {
    width: 400,
    height: 190,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    ...typography.h1,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 6,
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
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    ...typography.h2,
    color: colors.foreground,
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
