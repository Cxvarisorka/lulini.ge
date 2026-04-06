export default {
  expo: {
    name: "Lulini",
    slug: "lulini-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    // Hermes is the optimised JS engine for React Native — faster startup, lower memory
    jsEngine: "hermes",
    // newArchEnabled requires development build, disable for Expo Go
    // newArchEnabled: true,
    scheme: "lulini",
    splash: {
      image: "./assets/png_files_core 1024 × 1024 .png",
      resizeMode: "contain",
      backgroundColor: "#000000"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.lulini.mobile",
      usesAppleSignIn: true,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "We need your location to show your position on the map and find nearby drivers.",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000"
      },
      edgeToEdgeEnabled: true,
      package: "com.lulini.mobile",
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || ""
        }
      },
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "POST_NOTIFICATIONS"
      ]
    },
    updates: {
      url: "https://u.expo.dev/6a0101ac-1b4b-48f4-914b-6e467f03f395"
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      ["react-native-crisp-chat-sdk", {
        websiteId: "452c4830-69b7-4085-b0f4-45f84b7eafca",
      }],
      "expo-font",
      "expo-secure-store",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Allow Lulini to use your location to find nearby drivers and show your position on the map."
        }
      ],
      "expo-web-browser",
      "expo-apple-authentication",
      [
        "expo-notifications",
        {
          color: "#171717"
        }
      ],
      ['@sentry/react-native/expo', {
        organization: 'cryptalyst',
        project: 'mobile-client',
      }],
    ],
    extra: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      eas: {
        projectId: "6a0101ac-1b4b-48f4-914b-6e467f03f395"
      }
    }
  }
};
