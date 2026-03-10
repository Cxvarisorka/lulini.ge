import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '../i18n';

const NOTIFICATION_ID = 'ride-status';
const CHANNEL_ID = 'ride-status';

/**
 * Create the Android notification channel for ride status updates.
 * Call once at app startup (from App.js).
 */
export async function initRideNotificationChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t('rideNotification.channelName', { defaultValue: 'Ride Status' }),
      description: i18n.t('rideNotification.channelDescription', { defaultValue: 'Real-time updates about your current ride' }),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
      sound: null,
      showBadge: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

/**
 * Calculate a text-based progress indicator from ride status and ETA.
 */
function buildProgressText(status, eta) {
  const steps = { accepted: 1, driver_arrived: 2, in_progress: 3 };
  const step = steps[status] || 0;
  const filled = '\u2501'.repeat(step * 3);
  const empty = '\u2500'.repeat((3 - step) * 3);
  return `${filled}${empty}`;
}

/**
 * Build notification content for a given ride status.
 */
function buildNotificationContent(status, driverInfo, eta) {
  const t = i18n.t.bind(i18n);
  const { driverName, vehicleMakeModel, vehicleColor, licensePlate } = driverInfo;

  const vehicleDesc = [vehicleColor, vehicleMakeModel].filter(Boolean).join(' ');
  const vehicleLine = vehicleDesc + (licensePlate ? `  ·  ${licensePlate}` : '');
  const progress = buildProgressText(status, eta);

  switch (status) {
    case 'accepted': {
      const title = eta != null
        ? t('rideNotification.etaMinutes', { minutes: eta })
        : t('rideNotification.driverOnTheWay', { driverName });
      const subtitle = t('rideNotification.driverOnTheWay', { driverName });
      return { title, subtitle, body: `${vehicleLine}\n${progress}` };
    }
    case 'driver_arrived':
      return {
        title: t('rideNotification.driverArrived'),
        subtitle: driverName,
        body: `${vehicleLine}\n${t('rideNotification.waitingAtPickup')}\n${progress}`,
      };
    case 'in_progress': {
      const title = eta != null
        ? t('rideNotification.etaDropoff', { minutes: eta })
        : t('rideNotification.ridingNow');
      return {
        title,
        subtitle: t('rideNotification.rideInProgress'),
        body: `${vehicleLine}\n${progress}`,
      };
    }
    default:
      return { title: '', subtitle: '', body: '' };
  }
}

/**
 * Show the ride notification with sound (status transitions only).
 * Call on genuine status changes: accepted, driver_arrived, in_progress.
 */
export async function showRideNotification(status, driverInfo, eta) {
  const { title, subtitle, body } = buildNotificationContent(status, driverInfo, eta);
  if (!title) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title,
        subtitle: Platform.OS === 'ios' ? subtitle : undefined,
        body,
        data: { _local: true, type: 'ride_status' },
        sound: true,
        sticky: Platform.OS === 'android',
        ...(Platform.OS === 'android' && {
          channelId: CHANNEL_ID,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
      },
      trigger: null,
    });
  } catch (error) {
    if (__DEV__) console.warn('[RideNotification] Failed to show:', error.message);
  }
}

/**
 * Silently update the ride notification (no sound/vibration).
 * Call on ETA changes, countdown ticks, and reconciliation.
 */
export async function updateRideNotification(status, driverInfo, eta) {
  const { title, subtitle, body } = buildNotificationContent(status, driverInfo, eta);
  if (!title) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title,
        subtitle: Platform.OS === 'ios' ? subtitle : undefined,
        body,
        data: { _local: true, type: 'ride_status' },
        sound: false,
        sticky: Platform.OS === 'android',
        ...(Platform.OS === 'android' && {
          channelId: CHANNEL_ID,
          priority: Notifications.AndroidNotificationPriority.LOW,
        }),
      },
      trigger: null,
    });
  } catch (error) {
    if (__DEV__) console.warn('[RideNotification] Failed to update:', error.message);
  }
}

/**
 * Dismiss the ride notification.
 * Call on ride completion, cancellation, or state reset.
 */
export async function dismissRideNotification() {
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch (error) {
    if (__DEV__) console.warn('[RideNotification] Failed to dismiss:', error.message);
  }
}
