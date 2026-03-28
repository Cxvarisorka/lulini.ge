/**
 * Haptic feedback utility.
 * Reads the user's haptic preference from AsyncStorage before firing.
 * Gracefully degrades if expo-haptics is not available.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@app_settings';

let Haptics = null;
try {
  // expo-haptics ships with expo but let's guard in case of bare workflow issues
  Haptics = require('expo-haptics');
} catch (_) {
  // Not available — all functions will be no-ops
}

let _hapticsEnabled = true; // optimistic default; updated after first load
let _settingsLoaded = false;

async function isHapticsEnabled() {
  if (!_settingsLoaded) {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _hapticsEnabled = parsed.hapticFeedback !== false;
      }
      _settingsLoaded = true;
    } catch (_) {
      // Fallback: assume enabled
    }
  }
  return _hapticsEnabled;
}

// Allow external code to invalidate the cache when settings change
export function invalidateHapticsCache() {
  _settingsLoaded = false;
}

async function fire(fn) {
  if (!Haptics) return;
  const enabled = await isHapticsEnabled();
  if (!enabled) return;
  try {
    await fn();
  } catch (_) {
    // Silently ignore — some devices don't support certain feedback types
  }
}

export async function lightImpact() {
  await fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export async function mediumImpact() {
  await fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export async function heavyImpact() {
  await fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

export async function selectionFeedback() {
  await fire(() => Haptics.selectionAsync());
}

export async function notificationSuccess() {
  await fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export async function notificationWarning() {
  await fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export async function notificationError() {
  await fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
