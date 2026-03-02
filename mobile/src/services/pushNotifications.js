import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from './api';

/**
 * Register for push notifications and send token to server
 * @param {string} language - Current app language code
 */
export async function registerForPushNotifications(language = 'ka') {
    try {
        // Check permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.log('[Push] Permission not granted');
            return null;
        }

        // Get Expo push token
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
            console.warn('[Push] No EAS projectId found in app.config.js');
            return null;
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const pushToken = tokenData.data;

        // Check if token changed
        const storedToken = await SecureStore.getItemAsync('pushToken');
        if (storedToken === pushToken) {
            // Token hasn't changed, but still update language preference
            try {
                await api.post('/notifications/register-token', {
                    token: pushToken, platform: Platform.OS, language, app: 'passenger',
                });
            } catch (err) {
                console.warn('[Push] Failed to update language:', err.message);
            }
            return pushToken;
        }

        // Send token to server
        await api.post('/notifications/register-token', {
            token: pushToken, platform: Platform.OS, language, app: 'passenger',
        });
        await SecureStore.setItemAsync('pushToken', pushToken);
        console.log('[Push] Token registered:', pushToken.substring(0, 30) + '...');

        return pushToken;
    } catch (err) {
        console.error('[Push] Registration failed:', err.message);
        return null;
    }
}

/**
 * Unregister push token from server (call on logout)
 */
export async function unregisterPushToken() {
    try {
        const pushToken = await SecureStore.getItemAsync('pushToken');
        if (!pushToken) return;

        await api.post('/notifications/unregister-token', { token: pushToken });

        await SecureStore.deleteItemAsync('pushToken');
        console.log('[Push] Token unregistered');
    } catch (err) {
        console.warn('[Push] Unregister failed:', err.message);
        // Still clear local token even if server call fails
        await SecureStore.deleteItemAsync('pushToken');
    }
}
