/**
 * App Store review prompt utility.
 * Prompts users after their 3rd completed ride, at most once every 90 days.
 *
 * NOTE: expo-store-review is NOT in package.json. maybePromptReview() is a
 * safe no-op until it is installed. To enable review prompts, run:
 *   npx expo install expo-store-review
 * No code changes are required after installation — the dynamic require()
 * below will pick it up automatically.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const COMPLETED_RIDES_KEY = '@review_completed_rides';
const LAST_PROMPTED_KEY = '@review_last_prompted';
const PROMPT_THRESHOLD = 3;
const PROMPT_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

let StoreReview = null;
try {
  StoreReview = require('expo-store-review');
} catch (_) {
  // expo-store-review not installed — this will be a no-op
}

/**
 * Call this after every completed ride.
 * Increments the counter and prompts if conditions are met.
 */
export async function maybePromptReview() {
  if (!StoreReview) return;

  try {
    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    // Read current count and last prompted timestamp
    const [countRaw, lastRaw] = await Promise.all([
      AsyncStorage.getItem(COMPLETED_RIDES_KEY),
      AsyncStorage.getItem(LAST_PROMPTED_KEY),
    ]);

    const count = countRaw ? parseInt(countRaw, 10) : 0;
    const lastPrompted = lastRaw ? parseInt(lastRaw, 10) : 0;

    const newCount = count + 1;
    await AsyncStorage.setItem(COMPLETED_RIDES_KEY, String(newCount));

    // Only prompt at threshold multiples (3rd, 6th, 9th… ride) and respect cooldown
    if (newCount < PROMPT_THRESHOLD) return;
    if (newCount % PROMPT_THRESHOLD !== 0) return;

    const now = Date.now();
    if (now - lastPrompted < PROMPT_COOLDOWN_MS) return;

    // Conditions met — request review
    await StoreReview.requestReview();
    await AsyncStorage.setItem(LAST_PROMPTED_KEY, String(now));
  } catch (err) {
    if (__DEV__) console.warn('[reviewPrompt] Error:', err.message);
  }
}
