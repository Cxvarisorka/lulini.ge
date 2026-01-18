export default {
  expo: {
    name: "GoTours",
    slug: "gotours-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
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
        "ACCESS_FINE_LOCATION"
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
      "@react-native-google-signin/google-signin"
    ],
    extra: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
      eas: {
        projectId: "295eb794-8d13-4244-918e-1425298d8eb1"
      }
    }
  }
};
