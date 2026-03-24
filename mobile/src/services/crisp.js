// Safe wrapper for Crisp Chat SDK.
// Crisp requires native modules and won't work in Expo Go.
// All calls are no-ops when the native module is unavailable.

let CrispChat = null;
let isAvailable = false;

try {
  const sdk = require('react-native-crisp-chat-sdk');
  CrispChat = sdk.default;
  isAvailable = true;

  // Configure once on import
  sdk.configure('452c4830-69b7-4085-b0f4-45f84b7eafca');
} catch (_) {
  if (__DEV__) console.warn('[Crisp] Native module not available (Expo Go?)');
}

export const crispAvailable = isAvailable;

export function showCrisp() {
  if (!isAvailable) return;
  try {
    require('react-native-crisp-chat-sdk').show();
  } catch (_) {}
}

export function setUserInfo({ id, name, email, phone }) {
  if (!isAvailable) return;
  try {
    const sdk = require('react-native-crisp-chat-sdk');
    if (id) sdk.setTokenId(id);
    if (name) sdk.setUserNickname(name);
    if (email) sdk.setUserEmail(email);
    if (phone) sdk.setUserPhone(phone);
  } catch (_) {}
}

export function resetCrispSession() {
  if (!isAvailable) return;
  try {
    require('react-native-crisp-chat-sdk').resetSession();
  } catch (_) {}
}

export { CrispChat };
