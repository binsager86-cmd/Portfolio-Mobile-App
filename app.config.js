const webOutput = process.env.EXPO_WEB_OUTPUT || "static";

module.exports = {
  name: "Portfolio Tracker",
  slug: "portfolio-tracker",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "portfolio-tracker",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.portfoliotracker.app",
  },
  android: {
    package: "com.portfoliotracker.app",
    googleServicesFile: "./google-services.json",
    permissions: [
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
      "POST_NOTIFICATIONS",
      "USE_EXACT_ALARM",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#08070D",
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "pan",
  },
  web: {
    bundler: "metro",
    output: webOutput,
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-web-browser",
    "expo-secure-store",
    "expo-localization",
    "expo-sharing",
    "./plugins/withGoogleSignIn.js",
    "./plugins/withCrashAnalytics.js",
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#8a2be2",
        defaultChannel: "default",
        requestPermissionsAndroid: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    "@sentry/react-native",
    "expo-sqlite",
    "@react-native-community/datetimepicker",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "1e834458-c512-4eef-8b3d-f092ef8c2e60",
    },
    router: {},
  },
  owner: "sagerhalsager",
};
