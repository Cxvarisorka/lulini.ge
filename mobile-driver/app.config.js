export default {
  expo: {
    name: 'GoTours Driver',
    slug: 'gotours-driver',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    // newArchEnabled requires development build, disable for Expo Go
    // newArchEnabled: true,
    scheme: 'gotours-driver',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#171717'
    },
    updates: {
      fallbackToCacheTimeout: 0,
      enabled: false
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gotours.driver',
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'GoTours Driver needs your location to show your position on the map and match you with nearby ride requests.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'GoTours Driver needs your location in the background to accept ride requests and navigate to passengers.',
        NSLocationAlwaysUsageDescription: 'GoTours Driver needs your location in the background to accept ride requests and navigate to passengers.',
        UIBackgroundModes: ['location'],
        ITSAppUsesNonExemptEncryption: false
      },
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#171717'
      },
      edgeToEdgeEnabled: true,
      package: 'com.gotours.driver',
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'POST_NOTIFICATIONS'
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''
        }
      }
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      'expo-secure-store',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'GoTours Driver needs your location to show your position on the map and match you with nearby ride requests.',
          locationAlwaysPermission: 'GoTours Driver needs your location in the background to accept ride requests and navigate to passengers.',
          locationWhenInUsePermission: 'GoTours Driver needs your location to show your position on the map and match you with nearby ride requests.',
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true
        }
      ],
      [
        'expo-notifications',
        {
          color: '#171717'
        }
      ]
    ],
    extra: {
      eas: {
        projectId: 'd95167ad-aa6e-4509-9721-4eb2cc99c70c'
      }
    }
  }
};
