import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { I18nextProvider } from 'react-i18next';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';


// Initialize Sentry — wrapped in try-catch because the native module may not
// be linked yet (stale prebuild, Expo Go, or first build after adding Sentry).
try {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
    enabled: !__DEV__ && !!process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0,
  });
} catch (e) {
  console.warn('[Sentry] Init failed (native module not available):', e.message);
}

// Ride events already handled by socket listeners in TaxiScreen (Alert.alert).
// Suppress SERVER push notifications for these to avoid duplicate alerts.
const PUSH_SUPPRESSED_TYPES = new Set([
  'ride_accepted',
  'ride_arrived',
  'ride_started',
  'ride_completed',
  'ride_cancelled',
  'ride_expired',
  'waiting_timeout',
  'waiting_timeout_passenger',
]);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    if (!data?._local && PUSH_SUPPRESSED_TYPES.has(data?.type)) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

import i18n from './src/i18n';
import { initRideNotificationChannel } from './src/services/rideNotification';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { NetworkProvider } from './src/context/NetworkContext';
import { SocketProvider } from './src/context/SocketContext';
import { ThemeProvider } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import ConnectionStatusBar from './src/components/ConnectionStatusBar';

// Create Android notification channel for ride status (must run before scheduling)
initRideNotificationChannel();

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        if (__DEV__) return;
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            i18n.t('update.title'),
            i18n.t('update.message'),
            [
              { text: i18n.t('update.later'), style: 'cancel' },
              { text: i18n.t('update.restart'), onPress: () => Updates.reloadAsync() },
            ]
          );
        }
      } catch (e) {
        console.log('Update check failed:', e);
      }
    }
    checkForUpdates();
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <I18nextProvider i18n={i18n}>
          <SafeAreaProvider>
            <ThemeProvider>
            <LanguageProvider>
              <AuthProvider>
                <NetworkProvider>
                <SocketProvider>

                  <ConnectionStatusBar />
                  <StatusBar style="dark" />
                  <AppNavigator />
                </SocketProvider>
                </NetworkProvider>
              </AuthProvider>
            </LanguageProvider>
          </ThemeProvider>
          </SafeAreaProvider>
        </I18nextProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default App;
