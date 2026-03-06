import React, { createContext, useContext, useState, useRef } from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
  Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

// Auth Screens
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import PhoneAuthScreen from '../screens/PhoneAuthScreen';
import OtpVerificationScreen from '../screens/OtpVerificationScreen';
import PhoneRegistrationScreen from '../screens/PhoneRegistrationScreen';
import PermissionsScreen from '../screens/PermissionsScreen';

// Main Screens
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TaxiScreen from '../screens/TaxiScreen';
import TaxiHistoryScreen from '../screens/TaxiHistoryScreen';
import RideDetailScreen from '../screens/RideDetailScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import UpdatePhoneScreen from '../screens/UpdatePhoneScreen';

// Drawer Screens
import SettingsScreen from '../screens/SettingsScreen';
import PaymentSettingsScreen from '../screens/PaymentSettingsScreen';
import SupportScreen from '../screens/SupportScreen';
import SupportHistoryScreen from '../screens/SupportHistoryScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import AboutScreen from '../screens/AboutScreen';
import FAQDetailScreen from '../screens/FAQDetailScreen';

// Drawer Content
import DrawerContent from '../components/DrawerContent';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Custom Drawer Context
const DrawerContext = createContext();

export const useDrawer = () => useContext(DrawerContext);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

// Auth Stack (Welcome/Phone Auth)
function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
      <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
      <Stack.Screen name="PhoneRegistration" component={PhoneRegistrationScreen} />
    </Stack.Navigator>
  );
}

// Main Tab Navigator
function MainTabs() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Calculate proper bottom padding for devices with home indicator/gesture navigation
  const bottomPadding = Math.max(insets.bottom, 10);
  const tabBarHeight = 60 + bottomPadding;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Rides') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTitleStyle: {
          color: colors.foreground,
          fontWeight: '600',
        },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarLabel: t('tabs.home'),
        }}
      />
      <Tab.Screen
        name="Rides"
        component={TaxiHistoryScreen}
        options={{
          headerTitle: t('taxi.rideHistory'),
          tabBarLabel: t('home.myRides'),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerTitle: t('tabs.profile'),
          tabBarLabel: t('tabs.profile'),
        }}
      />
    </Tab.Navigator>
  );
}

// Main Stack with Tabs and Modal Screens
function MainStackNavigator() {
  const { t } = useTranslation();

  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={({ navigation }) => ({
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTitleStyle: {
          color: colors.foreground,
          fontWeight: '600',
        },
        headerBackTitle: '',
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        freezeOnBlur: false,
        animation: 'slide_from_right',
        headerLeft: navigation.canGoBack()
          ? () => (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.headerBackButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                  size={24}
                  color={colors.primary}
                />
              </TouchableOpacity>
            )
          : undefined,
      })}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false, title: '' }}
      />
      <Stack.Screen
        name="Taxi"
        component={TaxiScreen}
        options={{
          headerShown: false,
          title: '',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="TaxiHistory"
        component={TaxiHistoryScreen}
        options={{
          title: t('taxi.rideHistory'),
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="RideDetail"
        component={RideDetailScreen}
        options={{
          title: t('taxi.rideDetails'),
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="LanguageSelect"
        component={LanguageSelectScreen}
        options={{
          title: t('profile.selectLanguage'),
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="UpdatePhone"
        component={UpdatePhoneScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('drawer.appSettings'),
          contentStyle: { backgroundColor: colors.muted },
        }}
      />
      <Stack.Screen
        name="PaymentSettings"
        component={PaymentSettingsScreen}
        options={{
          title: t('drawer.paymentSettings'),
          contentStyle: { backgroundColor: colors.muted },
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{
          title: t('drawer.helpCenter'),
          contentStyle: { backgroundColor: colors.muted },
        }}
      />
      <Stack.Screen
        name="SupportHistory"
        component={SupportHistoryScreen}
        options={{
          title: t('drawer.supportHistory'),
          contentStyle: { backgroundColor: colors.muted },
        }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          title: t('drawer.notifications'),
          contentStyle: { backgroundColor: colors.muted },
        }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: t('drawer.about'),
          contentStyle: { backgroundColor: colors.muted },
        }}
      />
      <Stack.Screen
        name="FAQDetail"
        component={FAQDetailScreen}
        options={{
          title: t('support.faqTitle'),
          contentStyle: { backgroundColor: colors.muted },
        }}
      />
    </Stack.Navigator>
  );
}

// Custom Drawer Component — always mounted, uses pointerEvents to
// let touches pass through when closed. No Modal, no mount/unmount.
// Supports swipe-left-to-close gesture (HIG sidebar pattern).
function CustomDrawerOverlay({ isOpen, onClose, navigation }) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  // Swipe-to-close: detect horizontal swipe left on the drawer
  const drawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipe left (negative dx) when drawer is open
        return isOpenRef.current && gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        const clampedDx = Math.min(0, Math.max(-DRAWER_WIDTH, gestureState.dx));
        slideAnim.setValue(clampedDx);
        fadeAnim.setValue(1 + clampedDx / DRAWER_WIDTH);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -DRAWER_WIDTH * 0.3 || gestureState.vx < -0.5) {
          onClose();
        } else {
          // Snap back open
          Animated.parallel([
            Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  // M9: Stop stale animations in cleanup to prevent visual glitches
  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
    }
    const anim = Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isOpen ? 0 : -DRAWER_WIDTH,
        duration: isOpen ? 250 : 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: isOpen ? 1 : 0,
        duration: isOpen ? 250 : 200,
        useNativeDriver: true,
      }),
    ]);
    anim.start(() => {
      if (!isOpen) {
        setVisible(false);
      }
    });
    return () => anim.stop();
  }, [isOpen]);

  return (
    <View
      style={[
        styles.drawerContainer,
        !visible && styles.drawerContainerHidden,
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[
            styles.drawerOverlay,
            { opacity: fadeAnim },
          ]}
        />
      </TouchableWithoutFeedback>
      <Animated.View
        {...drawerPanResponder.panHandlers}
        style={[
          styles.drawerContent,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <DrawerContent
          navigation={{
            navigate: (screen, params) => {
              onClose();
              if (navigation) navigation.navigate(screen, params);
            },
            closeDrawer: onClose,
          }}
        />
      </Animated.View>
    </View>
  );
}

// Drawer Provider Component
function DrawerProvider({ children, navigation }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  return (
    <DrawerContext.Provider value={{ openDrawer, closeDrawer, isDrawerOpen }}>
      {children}
      <CustomDrawerOverlay
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        navigation={navigation}
      />
    </DrawerContext.Provider>
  );
}

// Loading Screen
function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// Wrapper component that handles navigation ref
function AuthenticatedApp() {
  const navigationRef = useRef(null);
  const [navReady, setNavReady] = useState(false);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => setNavReady(true)}
    >
      <DrawerProvider navigation={navReady ? navigationRef.current : null}>
        <MainStackNavigator />
      </DrawerProvider>
    </NavigationContainer>
  );
}

// Onboarding Stack (Permissions)
function OnboardingStack() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Permissions" component={PermissionsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// Main App Navigator
export default function AppNavigator() {
  const { isAuthenticated, loading, user, isNewUser } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    // Check if user needs to complete onboarding (new user who hasn't completed it yet)
    if (isNewUser || (user && !user.hasCompletedOnboarding)) {
      return <OnboardingStack />;
    }
    return <AuthenticatedApp />;
  }

  return (
    <NavigationContainer>
      <AuthStack />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  drawerContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 999,
    elevation: 999,
  },
  drawerContainerHidden: {
    zIndex: -1,
    elevation: 0,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawerContent: {
    width: DRAWER_WIDTH,
    height: '100%',
    backgroundColor: colors.background,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  headerBackButton: {
    padding: 4,
    marginLeft: Platform.OS === 'ios' ? -4 : 0,
  },
});
