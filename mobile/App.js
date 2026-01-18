import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';

import i18n from './src/i18n';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { SocketProvider } from './src/context/SocketContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <I18nextProvider i18n={i18n}>
        <SafeAreaProvider>
          <LanguageProvider>
            <AuthProvider>
              <SocketProvider>
                <StatusBar style="dark" />
                <AppNavigator />
              </SocketProvider>
            </AuthProvider>
          </LanguageProvider>
        </SafeAreaProvider>
      </I18nextProvider>
    </View>
  );
}
