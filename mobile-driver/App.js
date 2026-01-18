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
    // Request notification permissions on app load
    const requestPermissions = async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permissions not granted');
      }
    };

    requestPermissions();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <SafeAreaProvider>
          <LanguageProvider>
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
          </LanguageProvider>
        </SafeAreaProvider>
      </I18nextProvider>
    </View>
  );
}
