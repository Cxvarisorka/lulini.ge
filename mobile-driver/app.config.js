export default {
  expo: {
    name: 'Lulini Driver',
    slug: 'lulini-driver',
    version: '1.0.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    owner: "cxvari",
    // newArchEnabled requires development build, disable for Expo Go
    // newArchEnabled: true,
    scheme: 'lulini-driver',
    splash: {
      image: './assets/png_files_core 1024 × 1024 .png',
      resizeMode: 'contain',
      backgroundColor: '#000000'
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/87195f65-8a3e-4340-8844-5a2d547a66e2',
      fallbackToCacheTimeout: 0,
      enabled: true,
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.lulini.driver',
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'Lulini Driver needs your location to show your position on the map and match you with nearby ride requests.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Lulini Driver needs your location in the background to accept ride requests and navigate to passengers.',
        NSLocationAlwaysUsageDescription: 'Lulini Driver needs your location in the background to accept ride requests and navigate to passengers.',
        UIBackgroundModes: ['location', 'fetch'],
        ITSAppUsesNonExemptEncryption: false
      },
      // Only configure Google Maps SDK on iOS if a valid API key is provided.
      // An empty key causes the Google Maps iOS SDK to crash during
      // [GMSServices provideAPIKey:] in AppDelegate.
      ...(process.env.GOOGLE_MAPS_API_KEY ? {
        config: {
          googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        }
      } : {})
    },
    android: {
      versionCode: 3,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000'
      },
      edgeToEdgeEnabled: true,
      package: 'com.lulini.driver',
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || ""
        }
      },
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'POST_NOTIFICATIONS'
      ],
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      'expo-secure-store',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Lulini Driver needs your location to show your position on the map and match you with nearby ride requests.',
          locationAlwaysPermission: 'Lulini Driver needs your location in the background to accept ride requests and navigate to passengers.',
          locationWhenInUsePermission: 'Lulini Driver needs your location to show your position on the map and match you with nearby ride requests.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true
        }
      ],
      [
        'expo-notifications',
        {
          color: '#171717'
        }
      ],
      '@react-native-community/datetimepicker',
      ['@sentry/react-native/expo', {
        organization: 'cryptalyst',
        project: 'mobile-driver',
      }],
    ],
    extra: {
      eas: {
        projectId: '87195f65-8a3e-4340-8844-5a2d547a66e2'
      }
    }
  }
};
