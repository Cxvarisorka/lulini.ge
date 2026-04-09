/**
 * Sound effects utility for driver app.
 * Uses short notification beep via expo-av.
 * Reads the user's sound preference from AsyncStorage before playing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = '@app_settings';

let Audio = null;
try {
  const av = require('expo-av');
  Audio = av.Audio;
} catch (_) {
  // expo-av not installed — all sound functions will be silent no-ops
}

let _soundEnabled = true;
let _settingsLoaded = false;

async function isSoundEnabled() {
  if (!_settingsLoaded) {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _soundEnabled = parsed.soundEffects !== false;
      }
      _settingsLoaded = true;
    } catch (_) {}
  }
  return _soundEnabled;
}

export function invalidateSoundCache() {
  _settingsLoaded = false;
}

let _activeSound = null;
const MAX_DURATION_MS = 3000;

async function playNotificationBeep() {
  if (!Audio) return;
  const enabled = await isSoundEnabled();
  if (!enabled) return;

  try {
    if (_activeSound) {
      try {
        const status = await _activeSound.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) await _activeSound.stopAsync();
          await _activeSound.unloadAsync();
        }
      } catch (_) {}
      _activeSound = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: 'data:audio/wav;base64,UklGRl4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToAAAAA/38AAP9/AAD/fwAA/38AAP9/AAD/fwAA/38AAP9/AAD/fwAA/38AAP9/AAD/fwAA/38AAP9/AAD/fwAA' },
      { shouldPlay: true, volume: 0.5 }
    );
    _activeSound = sound;

    const cleanup = async () => {
      try {
        if (_activeSound === sound) {
          await sound.unloadAsync();
          _activeSound = null;
        }
      } catch (_) {}
    };

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) cleanup();
    });
    setTimeout(cleanup, MAX_DURATION_MS);
  } catch (err) {
    if (__DEV__) console.warn('[sounds] Failed to play beep:', err.message);
  }
}

export async function stopAllSounds() {
  if (!Audio) return;
  if (_activeSound) {
    try {
      const status = await _activeSound.getStatusAsync();
      if (status.isLoaded) {
        if (status.isPlaying) await _activeSound.stopAsync();
        await _activeSound.unloadAsync();
      }
    } catch (_) {}
    _activeSound = null;
  }
}

export const rideRequest = () => playNotificationBeep();
export const messageSent = () => playNotificationBeep();
export const messageReceived = () => playNotificationBeep();
