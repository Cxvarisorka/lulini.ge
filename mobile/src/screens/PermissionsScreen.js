import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme/colors';

export default function PermissionsScreen({ navigation }) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [locationGranted, setLocationGranted] = useState(null);
  const [notificationsGranted, setNotificationsGranted] = useState(null);
  const { completeOnboarding, user } = useAuth();

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
      return status === 'granted';
    } catch (error) {
      console.log('Location permission error:', error);
      setLocationGranted(false);
      return false;
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsGranted(status === 'granted');
      return status === 'granted';
    } catch (error) {
      console.log('Notification permission error:', error);
      setNotificationsGranted(false);
      return false;
    }
  };

  const handleRequestAll = async () => {
    setIsLoading(true);
    await requestLocationPermission();
    await requestNotificationPermission();
    setIsLoading(false);
  };

  const handleContinue = async () => {
    setIsLoading(true);
    await completeOnboarding();
    setIsLoading(false);
    // Navigation will be handled by AppNavigator
  };

  const getPermissionIcon = (granted) => {
    if (granted === null) return 'ellipse-outline';
    return granted ? 'checkmark-circle' : 'close-circle';
  };

  const getPermissionIconColor = (granted) => {
    if (granted === null) return colors.mutedForeground;
    return granted ? colors.primary : colors.destructive;
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="settings-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>
            {t('permissions.welcome', { name: user?.fullName || user?.firstName || '' })}
          </Text>
          <Text style={styles.subtitle}>{t('permissions.subtitle')}</Text>
        </View>

        <View style={styles.permissionsContainer}>
          {/* Location Permission */}
          <View style={styles.permissionCard}>
            <View style={styles.permissionIconContainer}>
              <Ionicons name="location-outline" size={28} color={colors.primary} />
            </View>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionTitle}>{t('permissions.location')}</Text>
              <Text style={styles.permissionDescription}>
                {t('permissions.locationDesc')}
              </Text>
            </View>
            <Ionicons
              name={getPermissionIcon(locationGranted)}
              size={24}
              color={getPermissionIconColor(locationGranted)}
            />
          </View>

          {/* Notifications Permission */}
          <View style={styles.permissionCard}>
            <View style={styles.permissionIconContainer}>
              <Ionicons name="notifications-outline" size={28} color={colors.primary} />
            </View>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionTitle}>{t('permissions.notifications')}</Text>
              <Text style={styles.permissionDescription}>
                {t('permissions.notificationsDesc')}
              </Text>
            </View>
            <Ionicons
              name={getPermissionIcon(notificationsGranted)}
              size={24}
              color={getPermissionIconColor(notificationsGranted)}
            />
          </View>
        </View>

        <View style={styles.buttonsContainer}>
          {locationGranted === null && notificationsGranted === null ? (
            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleRequestAll}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryForeground} />
                  <Text style={styles.primaryButtonText}>{t('permissions.allowAll')}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryButtonText}>{t('permissions.continue')}</Text>
              )}
            </TouchableOpacity>
          )}

          {locationGranted === null && notificationsGranted === null && (
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleContinue}
              disabled={isLoading}
            >
              <Text style={styles.skipButtonText}>{t('permissions.skip')}</Text>
            </TouchableOpacity>
          )}
        </View>
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
  permissionsContainer: {
    gap: 16,
    marginBottom: 40,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permissionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  permissionContent: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 13,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  buttonsContainer: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    padding: 12,
  },
  skipButtonText: {
    color: colors.mutedForeground,
    fontSize: 14,
    fontWeight: '500',
  },
});
