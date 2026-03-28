import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

// Google OAuth Client IDs — reads from app.config.js extra, falls back to hardcoded
export const GOOGLE_CONFIG = {
  webClientId: extra.googleWebClientId || '934652446673-bodjrr6a3r97s2c5v3s2j6u71insktlc.apps.googleusercontent.com',
  androidClientId: extra.googleAndroidClientId || '934652446673-lov7gkpfuecpaepb522b9vdhsr0n98h3.apps.googleusercontent.com',
  iosClientId: extra.googleIosClientId || '934652446673-p500a1tesq5tjdas6ja1dv4ckd61gitq.apps.googleusercontent.com',
};
