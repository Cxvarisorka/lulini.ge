/**
 * Sound effects utility.
 * Reads the user's sound preference from AsyncStorage before playing.
 * Uses expo-av Audio. Gracefully degrades if not available.
 *
 * NOTE: expo-av is NOT in package.json. All exported functions are safe
 * no-ops until it is installed. To enable sounds, run:
 *   npx expo install expo-av
 * No code changes are required after installation — the dynamic require()
 * below will pick it up automatically.
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

// Sound object cache to avoid reloading the same asset
const _soundCache = {};

/**
 * Play a system-style beep using the Audio API's built-in tones.
 * Since we have no bundled .mp3 files, we use expo-av's URL support
 * to play freely available short notification tones.
 *
 * If you add custom audio files to assets/sounds/, replace these URIs
 * with require() paths.
 */
const SOUND_URIS = {
  rideAccepted: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  rideArrived: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
  rideCompleted: 'https://assets.mixkit.co/active_storage/sfx/2871/2871-preview.mp3',
  rideCancelled: 'https://assets.mixkit.co/active_storage/sfx/2872/2872-preview.mp3',
  messageSent: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3',
  messageReceived: 'https://assets.mixkit.co/active_storage/sfx/2355/2355-preview.mp3',
};

async function playSound(key) {
  if (!Audio) return;
  const enabled = await isSoundEnabled();
  if (!enabled) return;

  const uri = SOUND_URIS[key];
  if (!uri) return;

  try {
    // Reuse cached sound object
    if (_soundCache[key]) {
      await _soundCache[key].replayAsync();
      return;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 0.7 }
    );
    _soundCache[key] = sound;

    // Auto-unload after 10s to free memory (not the cache entry)
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        // Keep the object in cache for fast replay; don't unload
      }
    });
  } catch (err) {
    if (__DEV__) console.warn(`[sounds] Failed to play ${key}:`, err.message);
  }
}

/**
 * Preload all sounds for instant playback.
 * Call this once on app start (e.g. in App.js useEffect).
 */
export async function preloadSounds() {
  if (!Audio) return;
  const enabled = await isSoundEnabled();
  if (!enabled) return;

  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: false });
  } catch (_) {}

  // Preload in parallel — failures are silent
  await Promise.allSettled(
    Object.keys(SOUND_URIS).map(async (key) => {
      if (_soundCache[key]) return;
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: SOUND_URIS[key] },
          { shouldPlay: false }
        );
        _soundCache[key] = sound;
      } catch (_) {}
    })
  );
}

export const rideAccepted = () => playSound('rideAccepted');
export const rideArrived = () => playSound('rideArrived');
export const rideCompleted = () => playSound('rideCompleted');
export const rideCancelled = () => playSound('rideCancelled');
export const messageSent = () => playSound('messageSent');
export const messageReceived = () => playSound('messageReceived');
