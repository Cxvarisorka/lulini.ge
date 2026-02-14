import React, { useEffect } from 'react';
import { View, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import * as Notifications from 'expo-notifications';

import i18n from './src/i18n';
import { AuthProvider } from './src/context/AuthContext';
import { SocketProvider } from './src/context/SocketContext';
import { LocationProvider } from './src/context/LocationContext';
import { DriverProvider } from './src/context/DriverContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { MapProvider } from './src/context/MapContext';
import AppNavigator from './src/navigation/AppNavigator';

// Ignore certain warnings
LogBox.ignoreLogs(['Animated: `useNativeDriver`']);

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  useEffect(() => {
    // Check and request notification permissions only if not already granted
    const requestPermissions = async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch (error) {
        // Permission request failed silently
      }
    };

    requestPermissions();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <SafeAreaProvider>
          <LanguageProvider>
            <MapProvider>
            <AuthProvider>
              <LocationProvider>
                <SocketProvider>
                  <DriverProvider>
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
    </View>
  );
}
