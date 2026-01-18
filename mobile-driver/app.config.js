export default {
  expo: {
    name: 'GoTours Driver',
    slug: 'gotours-driver',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#171717'
    },
    updates: {
      fallbackToCacheTimeout: 0
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.gotours.driver',
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'GoTours Driver needs your location to show your position on the map and match you with nearby ride requests.'
      },
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#171717'
      },
      package: 'com.gotours.driver',
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'POST_NOTIFICATIONS'
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      }
    },
    plugins: [
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'GoTours Driver needs your location to show your position on the map and match you with nearby ride requests.'
        }
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#171717'
        }
      ]
    ],
    extra: {
      eas: {
        projectId: 'your-project-id-here'
      }
    }
  }
};
