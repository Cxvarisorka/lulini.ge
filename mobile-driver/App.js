import React, { useState, useEffect } from 'react';
import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import * as Notifications from 'expo-notifications';
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

// Register background location task (must happen at module load, outside React tree)
import './src/services/backgroundLocation';

import i18n from './src/i18n';
import { AuthProvider } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { LocationProvider } from './src/context/LocationContext';
import { DriverProvider } from './src/context/DriverContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { MapProvider } from './src/context/MapContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import ConnectionStatusBar from './src/components/ConnectionStatusBar';

// Ignore certain warnings
LogBox.ignoreLogs(['Animated: `useNativeDriver`']);

// Ride events are handled by socket listeners (Alert + local notifications).
// Suppress SERVER push notifications for these types to avoid duplicates.
// Local notifications (from SocketContext) are tagged with _local: true and pass through.
const PUSH_SUPPRESSED_TYPES = new Set([
  'ride_request',
  'ride_cancelled_driver',
  'ride_completed_driver',
  'waiting_timeout',
]);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const isLocal = data?._local === true;
    if (!isLocal && PUSH_SUPPRESSED_TYPES.has(data?.type)) {
      return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch (error) {
        console.warn('[App] Notification permission request failed:', error.message);
      }
    };

    requestPermissions();
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <I18nextProvider i18n={i18n}>
          <SafeAreaProvider>
            <LanguageProvider>
              <MapProvider>
              <AuthProvider>
                <LocationProvider>
                  <SocketProvider>
                    <DriverProvider>
                      <ConnectionStatusBar />
                      <StatusBar style="dark" />
                      <AppNavigator />
                    </DriverProvider>
                  </SocketProvider>
                </LocationProvider>
              </AuthProvider>
              </MapProvider>
            </LanguageProvider>
          </SafeAreaProvider>
        </I18nextProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
