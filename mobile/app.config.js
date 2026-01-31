export default {
  expo: {
    name: "GoTours",
    slug: "gotours-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    // newArchEnabled requires development build, disable for Expo Go
    // newArchEnabled: true,
    scheme: "gotours",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#171717"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.gotours.mobile",
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: "We need your location to show your position on the map and find nearby drivers.",
        NSLocationAlwaysUsageDescription: "We need your location to provide ride services.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "We need your location to provide ride services and find nearby drivers.",
        UIBackgroundModes: ["location"],
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#171717"
      },
      edgeToEdgeEnabled: true,
      package: "com.gotours.mobile",
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
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-secure-store",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow GoTours to use your location to find nearby drivers and show your position on the map."
        }
      ],
      "expo-web-browser",
      // Google Sign-In requires development build, comment out for Expo Go
      // "@react-native-google-signin/google-signin",
      [
        "expo-notifications",
        {
          color: "#171717"
        }
      ]
    ],
    extra: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
      EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "",
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "",
      eas: {
        projectId: "295eb794-8d13-4244-918e-1425298d8eb1"
      }
    }
  }
};
