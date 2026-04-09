import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext';
import { colors, useTypography } from '../theme/colors';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import RidesScreen from '../screens/RidesScreen';
import EarningsScreen from '../screens/EarningsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import RideDetailScreen from '../screens/RideDetailScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import MapSelectScreen from '../screens/MapSelectScreen';
import NavigationScreen from '../screens/NavigationScreen';
import ChatScreen from '../screens/ChatScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const typography = useTypography();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Rides') {
            iconName = focused ? 'car' : 'car-outline';
          } else if (route.name === 'Earnings') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: typography.captionSmall.fontSize,
          fontWeight: '500',
        },
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: t('navigation.home') }}
      />
      <Tab.Screen
        name="Rides"
        component={RidesScreen}
        options={{ tabBarLabel: t('navigation.rides') }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{ tabBarLabel: t('navigation.earnings') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: t('navigation.profile') }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Determine which authenticated flow to show.
  // Existing approved drivers (role=driver) go straight to main tabs.
  // Anyone else (role=user) is either still onboarding or waiting for approval,
  // so they stay in the OnboardingScreen which handles both states.
  const needsOnboarding = isAuthenticated && user?.role !== 'driver';

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {!isAuthenticated ? (
          // ── Unauthenticated stack ──
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        ) : needsOnboarding ? (
          // ── Onboarding stack (authenticated but profile not yet set up) ──
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ animation: 'fade' }}
          />
        ) : (
          // ── Main app stack ──
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="RideDetail" component={RideDetailScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
            <Stack.Screen name="MapSelect" component={MapSelectScreen} />
            <Stack.Screen name="Navigation" component={NavigationScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
