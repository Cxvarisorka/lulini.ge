import React, { createContext, useContext, useState, useRef } from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
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
import PhoneAuthScreen from '../screens/PhoneAuthScreen';
import OtpVerificationScreen from '../screens/OtpVerificationScreen';
import PhoneRegistrationScreen from '../screens/PhoneRegistrationScreen';
import PermissionsScreen from '../screens/PermissionsScreen';

// Main Screens
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TaxiScreen from '../screens/TaxiScreen';
import TaxiHistoryScreen from '../screens/TaxiHistoryScreen';
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
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
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
      screenOptions={{
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
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Taxi"
        component={TaxiScreen}
        options={{
          headerShown: false,
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="TaxiHistory"
        component={TaxiHistoryScreen}
        options={{
          title: t('taxi.rideHistory'),
        }}
      />
      <Stack.Screen
        name="LanguageSelect"
        component={LanguageSelectScreen}
        options={{
          title: t('profile.selectLanguage'),
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="UpdatePhone"
        component={UpdatePhoneScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('drawer.appSettings'),
        }}
      />
      <Stack.Screen
        name="PaymentSettings"
        component={PaymentSettingsScreen}
        options={{
          title: t('drawer.paymentSettings'),
        }}
      />
      <Stack.Screen
        name="Support"
        component={SupportScreen}
        options={{
          title: t('drawer.helpCenter'),
        }}
      />
      <Stack.Screen
        name="SupportHistory"
        component={SupportHistoryScreen}
        options={{
          title: t('drawer.supportHistory'),
        }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          title: t('drawer.notifications'),
        }}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={{
          title: t('drawer.about'),
        }}
      />
      <Stack.Screen
        name="FAQDetail"
        component={FAQDetailScreen}
        options={{
          title: t('support.faqTitle'),
        }}
      />
    </Stack.Navigator>
  );
}

// Custom Drawer Modal Component
function CustomDrawerModal({ isOpen, onClose, navigation }) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setVisible(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setVisible(false);
        }
      });
    }
  }, [isOpen]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.drawerContainer}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              styles.drawerOverlay,
              { opacity: fadeAnim },
            ]}
          />
        </TouchableWithoutFeedback>
        <Animated.View
          style={[
            styles.drawerContent,
            { transform: [{ translateX: slideAnim }] },
          ]}
        >
          <DrawerContent
            navigation={{
              navigate: (screen, params) => {
                onClose();
                navigation.navigate(screen, params);
              },
              closeDrawer: onClose,
            }}
          />
        </Animated.View>
      </View>
    </Modal>
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
      <CustomDrawerModal
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
    flex: 1,
    flexDirection: 'row',
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
});
