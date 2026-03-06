import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

// Google OAuth Client IDs — reads from app.config.js extra, falls back to hardcoded
export const GOOGLE_CONFIG = {
  webClientId: extra.googleWebClientId || '229607828944-u9pk7hqsho0236k3hngm8j6fo0dc0vra.apps.googleusercontent.com',
  androidClientId: extra.googleAndroidClientId || '229607828944-as716s2ha0cog1k4d4usf2bt4f6jschc.apps.googleusercontent.com',
  iosClientId: extra.googleIosClientId || '229607828944-biutjdh6vvmt2c4inkp353isunso9mpr.apps.googleusercontent.com',
};
