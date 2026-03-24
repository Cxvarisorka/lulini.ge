# Background Location Tracking in Ride-Hailing Apps

## Complete Technical Analysis & Production Fix Plan

> This document covers the full lifecycle of location tracking from ride start to ride end,
> focusing on reliable real-time trip tracking on Android and iOS under all conditions:
> foreground, background, app minimized, screen locked, and under OS battery/network restrictions.

---

## Table of Contents

1. [Platform Behavior](#1-platform-behavior)
2. [Ride-Start Architecture](#2-ride-start-architecture)
3. [Common Problems](#3-common-problems)
4. [Best Fixes](#4-best-fixes)
5. [Implementation Guidance](#5-implementation-guidance)
6. [Security and Compliance](#6-security-and-compliance)
7. [Architecture Audit & Corrections](#7-architecture-audit--corrections)
8. [Edge-Case Fixes](#8-edge-case-fixes)
9. [Final Deliverables](#9-final-deliverables)
10. [Exact Changes To Make Right Now](#10-exact-changes-to-make-right-now)

---

## 1. Platform Behavior

### 1.1 Android Location Lifecycle

#### Foreground (app visible)

- Unrestricted GPS access via `FusedLocationProviderClient`
- Updates at any interval you request (1-5s typical)
- No special permissions beyond `ACCESS_FINE_LOCATION`
- Battery impact is moderate — GPS radio stays active

#### Background (app not visible, process alive)

- Starting Android 8 (API 26): background location updates throttled to ~4 per hour unless you use a **Foreground Service**
- Android 10 (API 29)+: requires `ACCESS_BACKGROUND_LOCATION` permission (separate runtime prompt)
- Android 12 (API 31)+: foreground service must declare `foregroundServiceType="location"` in manifest
- Without a foreground service, `requestLocationUpdates` silently degrades — you get batched, infrequent updates

#### Foreground Service (the critical piece)

- A service that shows a persistent notification ("Trip in progress...")
- Keeps the process at elevated priority — OS will not kill it under normal memory pressure
- GPS updates continue at requested interval even when app is backgrounded or screen is locked
- This is the **only reliable way** to do continuous background tracking on Android
- Must be started within 5 seconds of user action (Android 12+) — you **cannot** start a foreground service from the background unless triggered by an exact alarm, a high-priority FCM, or direct user interaction

#### Terminated/Killed

- If the OS or user force-kills the app, the foreground service dies too
- `START_STICKY` does NOT reliably restart foreground services on OEM-skinned Android — the OS restarts the service but without the location permission context, so it crashes or gets no updates
- WorkManager can schedule periodic work (~15min minimum) but not continuous GPS
- OEM kill behavior (Xiaomi, Samsung, Huawei, Oppo, OnePlus) is the #1 cause of ride tracking failure on Android

#### OEM-Specific Battery Killers

| OEM | Mechanism | Impact |
|-----|-----------|--------|
| Xiaomi/MIUI | AutoStart restriction, battery saver kills foreground services | Service killed within minutes |
| Samsung | Sleeping apps, adaptive battery | Service killed after ~5-15 min |
| Huawei/EMUI | App launch restrictions, power-intensive prompt | Service killed aggressively |
| OnePlus/OxygenOS | Battery optimization, deep optimization | Similar to Samsung |
| Oppo/ColorOS | Auto-optimize, smart power saver | Among the most aggressive |

### 1.2 iOS Location Lifecycle

#### Foreground

- Full GPS access via `CLLocationManager`
- `kCLLocationAccuracyBest` gives ~5m accuracy, updates every 1-3s
- Battery impact managed by the system but generally unrestricted

#### Background with `location` background mode

- App continues receiving GPS updates when backgrounded — **if configured correctly**
- Requires `UIBackgroundModes: location` in Info.plist
- Requires `allowsBackgroundLocationUpdates = true` on the location manager
- Requires "Always" or "When In Use" authorization
- iOS shows a blue status bar / blue pill indicator ("App is using your location")
- Updates continue reliably — iOS does NOT kill apps that are actively using background location mode

#### iOS 13+ "When In Use" background behavior

"When In Use" permission allows background location if:

1. Updates started while app was in foreground
2. `allowsBackgroundLocationUpdates = true`
3. `showsBackgroundLocationIndicator = true` (blue bar)
4. The app doesn't get suspended for other reasons

**Important caveat:** iOS 15+ can still suspend "When In Use" apps under memory pressure. "Always" is safer for ride-hailing. For ride tracking that starts in the foreground, "When In Use" works in most conditions, but "Always" with significant location change monitoring provides crash recovery.

#### Suspended/Terminated

- If iOS suspends the app (memory pressure, user swipe-kill), `startMonitoringSignificantLocationChanges` can relaunch the app — but only for ~10s of execution time, with ~500m accuracy
- For ride tracking, this is too coarse. The goal is to **never let the app suspend** during an active ride
- `beginBackgroundTaskWithExpirationHandler` gives ~30s of execution after backgrounding — not enough for a ride
- The `location` background mode is what prevents suspension, not background tasks

#### Key difference from Android

iOS does not require a visible notification for background location — the blue indicator is automatic. There is no "foreground service" concept; the background mode capability is the equivalent.

### 1.3 Tracking Method Comparison

| Method | Accuracy | Frequency | Background | Survives Kill | Battery | Use For |
|--------|----------|-----------|------------|---------------|---------|---------|
| Continuous GPS | 5-10m | 1-5s | With service/mode | No | High | Active ride tracking |
| Significant Location | ~500m | ~5min | Yes | Yes (iOS) | Very low | Crash recovery only |
| Geofencing | 100-200m | On enter/exit | Yes | Yes | Low | Not for ride tracking |
| Activity Detection | N/A | Varies | Yes | No | Low | Supplement, not primary |
| Foreground Service (Android) | N/A | N/A | Yes | No | Minimal overhead | Required for background GPS |

---

## 2. Ride-Start Architecture

### 2.1 Ride Start Flow

```
Driver taps "Start Ride"
       |
       |--- [1] Persist ride state to MMKV (BEFORE anything else)
       |         { rideId, status: 'starting', startedAt, serverConfirmed: false }
       |
       |--- [2] Start location tracking immediately (optimistic)
       |         Android: foreground service starts FIRST, then network calls
       |         iOS: background location mode activated
       |         Both: distanceInterval=5m (throttle in software)
       |
       |--- [3] Confirm with server (with retry + idempotency key)
       |         POST /rides/:id/start { idempotencyKey }
       |         On success: update MMKV status to 'active'
       |         On 409: already started (idempotent, treat as success)
       |         On failure: schedule retry, keep tracking
       |
       |--- [4] Connect socket for ride-specific channel
       |         Join room ride:{rideId}
       |         Emit ride:location events
       |
       |--- [5] Initialize location buffer on disk
       |         MMKV key: buffer:{rideId}
       |
       |--- [6] Start heartbeat (30s keepalive when stationary)
       |
       |--- [7] Passenger app notified via socket
                Starts listening for driver:location events
                Fallback: poll GET /rides/:id/location every 10s
```

### 2.2 Why Optimistic Tracking Matters

The previous architecture assumed a clean sequence: driver taps -> server confirms -> app starts tracking. This is wrong for production.

**Race condition:** Driver taps "Start Ride." Server receives request, marks ride as IN_PROGRESS, emits socket event to passenger. Response to driver is lost (network blip). Driver app doesn't start tracking. Passenger sees "Ride started" but gets no location updates.

**Fix:** Start tracking optimistically BEFORE server confirmation. The worst case is a few seconds of tracking that gets discarded if the server rejects the start. The alternative (waiting for confirmation) risks the entire ride going untracked.

### 2.3 Driver App — Tracking Producer

```javascript
async function onRideStartTap(rideId) {
  // STEP 1: Persist ride state FIRST (survives crash/kill)
  const rideState = {
    rideId,
    status: 'starting',
    startedAt: Date.now(),
    serverConfirmed: false,
  };
  persistRideState(rideState);

  // STEP 2: Start tracking (Android foreground service starts here)
  await startLocationTracking(rideId);

  // STEP 3: Confirm with server (idempotent, retried)
  let confirmed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api.post(`/rides/${rideId}/start`, {
        idempotencyKey: `start-${rideId}-${rideState.startedAt}`,
      });
      confirmed = true;
      break;
    } catch (e) {
      if (e.response?.status === 409) {
        confirmed = true; // Already started — idempotent
        break;
      }
      await delay(1000 * (attempt + 1));
    }
  }

  if (confirmed) {
    persistRideState({ ...rideState, status: 'active', serverConfirmed: true });
  } else {
    // Server unreachable — keep tracking, retry in background
    scheduleRetryRideStart(rideId, rideState.startedAt);
  }
}
```

### 2.4 Passenger App — Tracking Consumer

The passenger does NOT need background location tracking of the driver. It only needs:

- Socket listener for `driver:location` events (foreground)
- When app is backgrounded: push notifications for major events (driver arriving, ride complete)
- When app returns to foreground: fetch latest driver position via REST API
- The passenger's own location is needed only at pickup (already obtained)

### 2.5 Real-Time Update Flow

```
Driver GPS tick
    |
    |-- Filter: LocationThrottle (moved > 10m AND time > 3s?)
    |    |-- No -> skip (save battery)
    |    |-- Yes:
    |
    |-- Append to MMKV disk buffer
    |
    |-- Socket connected?
    |    |-- Yes -> socket.volatile.emit('ride:location', data)
    |    |-- No -> stays in buffer only
    |
    |-- Every 30s (or on reconnect): flush buffer via REST
         POST /rides/:rideId/locations/batch (chunked, 50 points max)
```

---

## 3. Common Problems

### 3.1 Location Updates Stop

| Cause | Platform | Details |
|-------|----------|---------|
| No foreground service | Android | Updates throttled to ~4/hour after 1 minute in background |
| OEM battery killer | Android | Xiaomi/Samsung/Huawei kill foreground services despite notification |
| `pausesLocationUpdatesAutomatically = true` | iOS | iOS pauses updates if it thinks the device is stationary (DEFAULT IS TRUE) |
| Missing `UIBackgroundModes: location` | iOS | App gets suspended normally after ~30s |
| `allowsBackgroundLocationUpdates = false` | iOS | Updates stop when app backgrounds |
| User revokes permission | Both | Silent failure — no crash, just no updates |
| Android 12+ background start restriction | Android | Cannot start foreground service from background — must be from user action |
| expo-location uses WorkManager without foreground service config | Android | Updates subject to Doze mode batching |
| TaskManager task defined inside component (not module scope) | Both | Task not registered when OS relaunches app after kill |

### 3.2 Updates Become Inaccurate or Delayed

| Cause | Details |
|-------|---------|
| GPS cold start | First fix after lock screen can take 10-30s; use `lastKnownLocation` as interim |
| Network-only location | If `Accuracy.Balanced` or lower is used, you get cell tower triangulation (100-2000m) |
| Indoor/tunnel/urban canyon | GPS accuracy degrades to 20-50m; heading becomes unreliable |
| Batched delivery | Android may batch updates when in Doze mode |
| iOS distanceFilter only | iOS CLLocationManager does not support time-based intervals — at highway speeds, updates fire too frequently |
| iOS deferred updates | If you use `allowDeferredLocationUpdates`, updates arrive in batches |

### 3.3 Socket/Network Problems

| Problem | Cause | Impact |
|---------|-------|--------|
| Socket disconnect on background | OS may close TCP connections after backgrounding | No real-time updates to passenger |
| Socket disconnect on network switch | WiFi <-> cellular transition drops connection | 5-30s gap in updates |
| Default Socket.IO reconnect too slow | Default backoff goes up to 30s between attempts | Unacceptable for ride tracking |
| Server-side timeout | If client doesn't ping within timeout, server drops socket | Must re-authenticate and rejoin rooms |
| No room rejoin after reconnect | Socket reconnects but doesn't rejoin ride room | Updates sent but never reach passenger |
| Auth token expires during ride | Long rides + background = expired JWT | Socket and REST calls fail silently |

### 3.4 Permission Issues

**Android:**

- `ACCESS_FINE_LOCATION`: required for GPS (not just network)
- `ACCESS_BACKGROUND_LOCATION`: required on Android 10+ — **separate permission dialog** (cannot be requested at same time as foreground)
- `FOREGROUND_SERVICE_LOCATION`: required on Android 14+ (auto-granted if declared in manifest)
- User can downgrade from "Allow all the time" to "Only while using" at any time
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` restricted by Play Store — must qualify as navigation app

**iOS:**

- `NSLocationWhenInUseUsageDescription`: minimum for ride tracking (sufficient if started in foreground)
- `NSLocationAlwaysAndWhenInUseUsageDescription`: needed for significant change recovery after app kill
- iOS 13+: always shows "When In Use" first; "Always" granted later via provisional dialog
- iOS 17+: shows map preview of collected data points to users — increases revocation rates
- User can change to "Ask Next Time" or "Never" at any time, silently

### 3.5 App State Transition Bugs

```
Common bug: Location listener registered in React component
  -> Component unmounts on navigation -> listener removed -> no updates
Fix: RideTrackingService singleton outside React tree

Common bug: Socket reconnect re-emits stale location
  -> Passenger sees driver "jump" to old position
Fix: Always include timestamp; client rejects older-than-current updates

Common bug: App wakes from background, reads stale state
  -> Ride shows as "not started" because state wasn't persisted
Fix: Persist ride state to MMKV (synchronous), read on app foreground

Common bug: In-memory state lost after OS kills app
  -> Background task fires but has no ride ID, socket, or buffer reference
Fix: Disk-first state machine — background task reads everything from MMKV
```

---

## 4. Best Fixes

### 4.1 Android — Making It Bulletproof

#### A. Foreground Service (non-negotiable)

```xml
<!-- Permissions in AndroidManifest.xml (via Expo config plugin) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<service
    android:name=".LocationTrackingService"
    android:foregroundServiceType="location"
    android:exported="false" />
```

#### B. Expo Location Plugin Configuration

```javascript
// app.config.js
plugins: [
  [
    'expo-location',
    {
      locationAlwaysAndWhenInUsePermission:
        'Background location access ensures uninterrupted trip tracking even when the app is minimized.',
      locationWhenInUsePermission:
        'Your location is needed to navigate to the passenger and track the ride route in real time.',
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true, // CRITICAL: creates real foreground service
    },
  ],
],
```

Without `isAndroidForegroundServiceEnabled: true`, `startLocationUpdatesAsync` uses WorkManager which is subject to Doze mode batching.

#### C. OEM Battery Killer Mitigation

```javascript
async function promptBatteryOptimization() {
  const brand = DeviceInfo.getBrand().toLowerCase();

  // Request standard Android battery optimization exemption
  if (Platform.OS === 'android') {
    const isIgnoring = await checkBatteryOptimization();
    if (!isIgnoring) {
      await requestIgnoreBatteryOptimization();
    }
  }

  // OEM-specific deep links
  const oemIntents = {
    xiaomi: {
      package: 'com.miui.securitycenter',
      action: 'miui.intent.action.OP_AUTO_START',
      label: 'AutoStart',
    },
    samsung: {
      package: 'com.samsung.android.lool',
      action: 'com.samsung.android.sm.ACTION_BATTERY_OPTIMIZATION',
      label: 'Battery Optimization',
    },
    huawei: {
      package: 'com.huawei.systemmanager',
      action: 'huawei.intent.action.HSM_PROTECTED_APPS',
      label: 'Protected Apps',
    },
    oppo: {
      package: 'com.coloros.safecenter',
      label: 'Battery Optimization',
    },
    oneplus: {
      package: 'com.oneplus.security',
      label: 'Battery Optimization',
    },
  };

  const oemConfig = oemIntents[brand];
  if (oemConfig) {
    const hasPrompted = await storage.getBoolean(`oem_prompted_${brand}`);
    if (!hasPrompted) {
      showOEMBatteryDialog(brand, oemConfig);
      storage.set(`oem_prompted_${brand}`, true);
    }
  }
}
```

**Important:** Add OEM package names in `<queries>` block for Android 11+ package visibility:

```javascript
// plugins/withBatteryOptimization.js (Expo config plugin)
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withBatteryOptimization(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest.queries) manifest.queries = [{}];
    manifest.queries[0].package = manifest.queries[0].package || [];

    const oemPackages = [
      'com.miui.securitycenter',
      'com.samsung.android.lool',
      'com.huawei.systemmanager',
      'com.coloros.safecenter',
      'com.oneplus.security',
    ];

    oemPackages.forEach((pkg) => {
      manifest.queries[0].package.push({ $: { 'android:name': pkg } });
    });

    return config;
  });
};
```

#### D. FCM Watchdog Wake Handler

```javascript
// Must be at top level — survives app kill on Android
import messaging from '@react-native-firebase/messaging';

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  if (remoteMessage.data?.type === 'wake_tracking') {
    const rideState = readRideStateFromDisk();
    if (rideState?.status === 'active') {
      const isTracking = await Location.hasStartedLocationUpdatesAsync(RIDE_TRACKING_TASK)
        .catch(() => false);

      if (!isTracking) {
        await Location.startLocationUpdatesAsync(RIDE_TRACKING_TASK, {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          foregroundService: {
            notificationTitle: 'Trip in progress',
            notificationBody: 'Navigating to destination',
          },
          pausesLocationUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          activityType: Location.ActivityType.AutomotiveNavigation,
        });
      }
    }
  }
});
```

### 4.2 iOS — Making It Bulletproof

#### A. Correct CLLocationManager Configuration

| Property | Value | Why |
|----------|-------|-----|
| `desiredAccuracy` | `kCLLocationAccuracyBest` | GPS, not network — during active ride |
| `distanceFilter` | `5` (meters) | Low value — software throttle handles the rest |
| `activityType` | `.automotiveNavigation` | Tells iOS this is driving — optimizes GPS power |
| `pausesLocationUpdatesAutomatically` | `false` | **CRITICAL** — default is `true`, which pauses at red lights |
| `allowsBackgroundLocationUpdates` | `true` | **CRITICAL** — without this, updates stop on background |
| `showsBackgroundLocationIndicator` | `true` | Shows blue pill — required for transparency |

#### B. Why `pausesLocationUpdatesAutomatically = false` Matters

When `true` (the default), iOS uses heuristics to decide if the user has "stopped moving" and pauses updates. In traffic, at red lights, or during slow city driving, iOS may decide the driver is stationary and pause. This causes **30-120s gaps** in location data. Always set to `false` for active ride tracking.

#### C. Significant Location Change as Crash Recovery

```javascript
// Register as safety net on ride start
// If iOS kills the app, this relaunches it (~500m accuracy, ~5min intervals)
// Not good enough for ride tracking, but allows:
//   1. Detect that a ride is active (read from MMKV)
//   2. Restart accurate tracking
//   3. Notify server about the gap
async function registerSignificantChangeMonitoring() {
  if (Platform.OS === 'ios') {
    await Location.startLocationUpdatesAsync('SIGNIFICANT_CHANGE_RECOVERY', {
      accuracy: Location.Accuracy.Low,
      distanceInterval: 100,
      showsBackgroundLocationIndicator: true,
      pausesLocationUpdatesAutomatically: false,
    });
  }
}
```

#### D. iOS Info.plist Configuration

```javascript
// app.config.js
ios: {
  infoPlist: {
    UIBackgroundModes: ['location', 'fetch', 'remote-notification'],
    NSLocationWhenInUseUsageDescription:
      'Your location is needed to navigate to the passenger and track the ride route in real time.',
    NSLocationAlwaysAndWhenInUseUsageDescription:
      'Background location access ensures uninterrupted trip tracking even when the app is minimized.',
    BGTaskSchedulerPermittedIdentifiers: ['RIDE_LOCATION_TRACKING'],
  },
},
```

#### E. Do NOT Use Audio Session Hack

Apple specifically flags silent audio playback as abuse. Do not play silent audio to keep the app alive. This **will** get your app rejected. Proper background location mode configuration is sufficient.

### 4.3 Recommended Architecture: Location Pipeline

```
+----------------------------------------------------------------+
|                     DRIVER APP ARCHITECTURE                     |
|                                                                 |
|  +----------------------------------------------------------+  |
|  |                   App.js (top level)                       |  |
|  |  * TaskManager.defineTask(RIDE_TRACKING_TASK)             |  |
|  |  * recoverActiveRide() on mount                           |  |
|  |  * AppState listener                                      |  |
|  |  * FCM background message handler                         |  |
|  +----------------------------------------------------------+  |
|                              |                                  |
|  +---------------------------v------------------------------+   |
|  |            RideTrackingService (singleton)                |   |
|  |                                                           |   |
|  |  Owns:                                                    |   |
|  |  * RideSocketManager (socket lifecycle)                   |   |
|  |  * LocationThrottle (time + distance filtering)           |   |
|  |  * LocationHeartbeat (30s keepalive)                      |   |
|  |  * Location subscription (foreground)                     |   |
|  |  * Ride state machine                                     |   |
|  |  * Permission monitor                                     |   |
|  |                                                           |   |
|  |  Does NOT own:                                            |   |
|  |  * React state (components subscribe via hook)            |   |
|  |  * Background task (owned by TaskManager)                 |   |
|  +----------+------------+---------------+-------------------+   |
|             |            |               |                       |
|  +----------v--+  +------v------+  +-----v------------------+   |
|  |   MMKV      |  |  Socket.IO  |  | REST API (fallback)    |   |
|  | (disk state) |  |  (live)     |  | * Chunked batch upload |   |
|  |              |  |             |  | * Token refresh        |   |
|  | * ride:      |  | * volatile  |  | * Idempotent endpoints |   |
|  |   active     |  |   emit for  |  +------------------------+   |
|  | * buffer:*   |  |   location  |                               |
|  | * ride:      |  | * ack for   |                               |
|  |   config     |  |   ride evts |                               |
|  +--------------+  +-------------+                               |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |              TaskManager Background Task                    |  |
|  |  * Reads ride state from MMKV (no in-memory deps)          |  |
|  |  * Appends to disk buffer                                   |  |
|  |  * Sends via fetch() (no socket dependency)                 |  |
|  |  * Runs even after app kill (Android foreground service)    |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
                              |
                              | WebSocket + REST
                              v
+------------------------------------------------------------------+
|                          SERVER                                    |
|                                                                    |
|  +--------------+  +--------------+  +--------------------------+  |
|  | Ride Start   |  | Location     |  | Watchdog (30s timer)     |  |
|  | (idempotent) |  | Ingestion    |  |                          |  |
|  |              |  |              |  | * Speed-aware thresholds  |  |
|  | * Validates  |  | * Dedup by   |  | * Silent push (tier 1)   |  |
|  |   state      |  |   timestamp  |  | * Visible push (tier 2)  |  |
|  | * Idempotency|  | * Batch +    |  | * Passenger notify       |  |
|  |   key check  |  |   single     |  |   (tier 3)               |  |
|  | * Socket     |  | * Broadcast  |  |                          |  |
|  |   broadcast  |  |   to         |  | Reconciliation:          |  |
|  |              |  |   passenger  |  | * Detect route gaps      |  |
|  +--------------+  |   room       |  | * Request buffer flush   |  |
|                    +--------------+  +--------------------------+  |
|                                                                    |
|  +--------------+  +--------------+                                |
|  | Redis        |  | MongoDB      |                                |
|  | * Latest pos |  | * Ride doc   |                                |
|  | * Idempotency|  | * Route      |                                |
|  |   keys       |  |   points     |                                |
|  | * Socket     |  |              |                                |
|  |   rooms      |  |              |                                |
|  +--------------+  +--------------+                                |
+--------------------------------------------------------------------+
```

### 4.4 Ride State Machine

```
       +---------+    startRide()     +----------+
       |  IDLE   | -----------------> | STARTING |
       +---------+                    +----+-----+
            ^                              |
            |                    server confirms
            |                              |
            |                         +----v-----+
            |                         |  ACTIVE  | <---- app restart
            |                         +----+-----+       recovery
            |                              |
            |                     endRide() / cancel
            |                              |
            |                         +----v-----+
            |                         |  ENDING  |
            |                         +----+-----+
            |                              |
            |                    buffer flushed,
            |                    service stopped
            |                              |
            +------------------------------+

State persisted to MMKV at every transition.
Background task reads state to decide whether to process locations.
App start reads state to decide whether to recover.
```

### 4.5 Offline/Retry Strategy

#### Location Buffer with Smart Thinning

```javascript
class LocationBuffer {
  constructor(rideId) {
    this.rideId = rideId;
    this.key = `buffer:${rideId}`;
    this.maxSize = 2000; // ~100 minutes at 3s intervals
  }

  append(points) {
    const buffer = this.read();
    buffer.push(...points);

    if (buffer.length > this.maxSize) {
      const thinned = this.thinBuffer(buffer, this.maxSize);
      this.write(thinned);
    } else {
      this.write(buffer);
    }
  }

  // Smart thinning: keep ends, thin middle by distance
  thinBuffer(buffer, maxSize) {
    const keepEnds = Math.floor(maxSize * 0.1);
    const head = buffer.slice(0, keepEnds);
    const tail = buffer.slice(-keepEnds);
    const middle = buffer.slice(keepEnds, -keepEnds);

    // Keep points with significant movement (>25m) or time gap (>30s)
    const kept = [middle[0]];
    for (let i = 1; i < middle.length; i++) {
      const prev = kept[kept.length - 1];
      const curr = middle[i];
      const dist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      const timeDiff = curr.ts - prev.ts;

      if (dist > 25 || timeDiff > 30000) {
        kept.push(curr);
      }
    }

    // If still too large, uniformly sample middle
    let middleResult = kept;
    if (head.length + kept.length + tail.length > maxSize) {
      const available = maxSize - head.length - tail.length;
      const step = Math.ceil(kept.length / available);
      middleResult = kept.filter((_, i) => i % step === 0);
    }

    return [...head, ...middleResult, ...tail];
  }

  read() {
    const raw = rideStorage.getString(this.key);
    return raw ? JSON.parse(raw) : [];
  }

  write(buffer) {
    rideStorage.set(this.key, JSON.stringify(buffer));
  }

  clearSent(count) {
    const buffer = this.read();
    this.write(buffer.slice(count));
  }
}
```

**Why NOT use `shift()` to drop oldest:** Dropping the oldest entries destroys route integrity — you lose the start of a connectivity gap, making route reconstruction impossible. Smart thinning preserves the shape of the route.

#### Chunked Batch Upload

```javascript
async function flushLocationBuffer(rideId) {
  const buffer = new LocationBuffer(rideId);
  const points = buffer.read();
  if (points.length === 0) return;

  const CHUNK_SIZE = 50;
  let sentCount = 0;

  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);

    try {
      await api.post(`/rides/${rideId}/locations/batch`, {
        points: chunk,
        chunkIndex: Math.floor(i / CHUNK_SIZE),
        totalPoints: points.length,
        isLast: i + CHUNK_SIZE >= points.length,
      });
      sentCount += chunk.length;
    } catch (e) {
      break; // Stop on first failure, remaining chunks stay in buffer
    }
  }

  if (sentCount > 0) {
    buffer.clearSent(sentCount);
  }
}
```

**Why chunking matters:** For a 30-minute connectivity gap at 3s intervals, that's 600 points. Sending all at once can timeout, hit request body size limits, or cause server memory spikes.

### 4.6 Battery Optimization

| Strategy | Impact | When to Use |
|----------|--------|-------------|
| Software throttle (10m + 3s) | Skips redundant updates | Always during ride |
| Low OS distanceFilter (5m) + software throttle | Platform-independent behavior | Always |
| Heartbeat instead of GPS when stationary | Saves GPS radio power at red lights | Automatic |
| Switch to Balanced accuracy after ride ends | Significant savings | Post-ride only |
| Stop tracking entirely when no active ride | Maximum savings | Between rides |
| Log every 5th update (not every update) | Reduces I/O overhead | Normal operation |

**Expected battery impact during active ride:** 3-5% per hour with GPS on, socket connected, screen off. This is acceptable for a ride that typically lasts 15-60 minutes.

---

## 5. Implementation Guidance

### 5.1 Recommended Update Intervals

| Phase | Accuracy | Distance Filter (OS) | Software Throttle | Rationale |
|-------|----------|---------------------|-------------------|-----------|
| Waiting for ride | Balanced | 50m | 30s | Just need approximate position |
| En route to pickup | High | 5m | 10m + 5s | Passenger watching approach |
| Active ride | High | 5m | 10m + 3s | Need accurate route + ETA |
| Ride complete | Off | — | — | Stop tracking immediately |

**iOS note:** `timeInterval` in expo-location maps to nothing on iOS. `CLLocationManager` does not support time-based intervals. Only `distanceFilter` works on iOS. The software `LocationThrottle` class is mandatory for consistent cross-platform behavior.

### 5.2 Software Throttle (Cross-Platform)

```javascript
class LocationThrottle {
  constructor({ minTimeMs = 3000, minDistanceM = 10 }) {
    this.minTimeMs = minTimeMs;
    this.minDistanceM = minDistanceM;
    this.lastSent = null;
    this.lastSentTime = 0;
  }

  shouldSend(location) {
    const now = Date.now();

    // Always send first update
    if (!this.lastSent) {
      this.accept(location, now);
      return true;
    }

    // Time gate: reject if too soon
    if (now - this.lastSentTime < this.minTimeMs) {
      return false;
    }

    // Distance gate: reject if too close
    const dist = haversineDistance(
      this.lastSent.lat, this.lastSent.lng,
      location.lat, location.lng
    );
    if (dist < this.minDistanceM) {
      return false;
    }

    this.accept(location, now);
    return true;
  }

  // Force send (ride start, ride end, significant heading change)
  forceSend(location) {
    this.accept(location, Date.now());
    return true;
  }

  accept(location, now) {
    this.lastSent = location;
    this.lastSentTime = now;
  }
}
```

### 5.3 Detecting Active Ride State on App Start

```javascript
async function recoverActiveRide() {
  const rideState = readRideStateFromDisk();
  if (!rideState || rideState.status === 'completed') return null;

  // 1. Check permissions first
  const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    storage.set('ride:permissionLost', 'true');
    await flushLocationBuffer(rideState.rideId).catch(() => {});
    return { ...rideState, trackingDegraded: true, reason: 'permission_lost' };
  }

  // 2. Check if background tracking is still running
  const isTracking = await Location.hasStartedLocationUpdatesAsync(RIDE_TRACKING_TASK)
    .catch(() => false);

  // 3. Validate with server (non-blocking, 5s timeout)
  let serverStatus = null;
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);
    const response = await api.get(`/rides/${rideState.rideId}`, {
      signal: controller.signal,
    });
    serverStatus = response.data.status;
  } catch (e) {
    serverStatus = null; // Network unavailable — assume ride still active
  }

  // 4. Handle based on server response
  if (serverStatus === 'completed' || serverStatus === 'cancelled') {
    storage.delete('ride:active');
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(RIDE_TRACKING_TASK);
    }
    await flushLocationBuffer(rideState.rideId).catch(() => {});
    return null;
  }

  // 5. Ride still active — restart tracking if not already running
  if (!isTracking) {
    const service = RideTrackingService.getInstance();
    const config = storage.getString('ride:config');
    if (config) {
      const { serverUrl, authToken } = JSON.parse(config);
      await service.startRide(rideState.rideId, serverUrl, authToken);
    }
  }

  // 6. Flush buffered locations from before the kill
  await flushLocationBuffer(rideState.rideId).catch(() => {});

  return rideState;
}
```

### 5.4 Syncing Missed Locations

```javascript
// On socket reconnect or network restore:
async function syncMissedLocations(rideId) {
  const buffer = new LocationBuffer(rideId);
  const points = buffer.read();
  if (points.length === 0) return;

  // Chunked upload — don't send all at once
  await flushLocationBuffer(rideId);
}
```

**Server-side deduplication:**

```javascript
async function receiveLocationBatch(req, res) {
  const { rideId } = req.params;
  const { points } = req.body;

  // Deduplicate by timestamp (1s tolerance)
  const existing = await RideLocation.find({
    rideId,
    ts: { $gte: points[0].ts - 1000, $lte: points[points.length - 1].ts + 1000 },
  }).select('ts').lean();

  const existingTs = new Set(existing.map((e) => Math.floor(e.ts / 1000)));
  const newPoints = points.filter((p) => !existingTs.has(Math.floor(p.ts / 1000)));

  if (newPoints.length > 0) {
    await RideLocation.insertMany(
      newPoints.map((p) => ({ ...p, rideId })),
      { ordered: false }
    );
  }

  res.json({ received: points.length, inserted: newPoints.length });
}
```

### 5.5 Logging/Debug Strategy

```javascript
// Log every 5th update in normal operation, every update when debugging
function logLocationEvent(type, data, forceLog = false) {
  const counter = (logLocationEvent._counter || 0) + 1;
  logLocationEvent._counter = counter;

  if (!forceLog && type === 'gps_update' && counter % 5 !== 0) return;

  const entry = {
    type,           // 'gps_update', 'socket_send', 'buffer_flush', etc.
    ts: Date.now(),
    appState: AppState.currentState,
    ...data,
  };

  // Append to rotating log (last 500 entries)
  appendToLog(entry);
}
```

**What to log:**

- Every 5th GPS update (lat, lng, accuracy, timestamp)
- Every update sent to server (socket or REST)
- Every socket connect/disconnect event
- Every app state change (foreground/background/inactive)
- Every permission change
- Foreground service start/stop
- Buffer flush attempts (success/failure, count)
- Battery level every 5 minutes
- All errors (force-logged regardless of counter)

---

## 6. Security and Compliance

### 6.1 Required Permissions

#### Android

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

#### iOS

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to navigate to the passenger and track the ride route.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Background location access ensures uninterrupted trip tracking even when the app is minimized.</string>
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
    <string>fetch</string>
    <string>remote-notification</string>
</array>
```

### 6.2 Store Policy Risks

#### Google Play

- Background location requires a **separate declaration form** in Play Console
- You must explain why "When In Use" is not sufficient
- Ride-hailing / trip tracking is an **approved use case** — state this explicitly
- Play may require a privacy policy link and a video demo showing the use case
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` requires the app to qualify as a specific category (navigation apps qualify)
- If rejected: emphasize that tracking only occurs during an active ride, not 24/7

#### Apple App Store

- Background location triggers **manual review**
- The blue indicator (pill) must be visible — do not try to hide it
- Explain in App Review notes: "Background location is used only during active ride for real-time trip tracking. Tracking stops immediately when ride ends."
- `NSLocationAlwaysAndWhenInUseUsageDescription` string must clearly explain why
- Prefer "When In Use" if sufficient — less review friction
- iOS 17+ shows collected data points to users — be transparent

#### Both stores

- **Never** track location when there is no active ride
- Stop tracking the instant a ride ends
- Provide clear UI showing that tracking is active
- Include a way for users to see what location data you collect (GDPR/privacy)

---

## 7. Architecture Audit & Corrections

### 7.1 Section-by-Section Audit

#### Platform Behavior — Corrections

| What was stated | Correction |
|----------------|------------|
| "Must start foreground service within 10 seconds" | On Android 12+, you cannot start a foreground service from the background at all unless triggered by exact alarm, high-priority FCM, or user interaction. The 10s window is for Android 8-11 |
| "Audio session trick as last resort" | This WILL get your app rejected by Apple. Remove entirely |
| "`START_STICKY` as potential restart mechanism" | Does NOT reliably restart foreground services on OEM-skinned Android |
| "When In Use is sufficient for iOS" | Partially true — iOS 15+ can still suspend under memory pressure. "Always" is safer |

#### Ride-Start Architecture — Corrections

| What was stated | Correction |
|----------------|------------|
| "Start foreground service as step in ride start flow" | Foreground service must start FIRST (within 5s of user action), then do network calls. If network calls happen first, the 5s window can be missed |
| "Socket as primary transport on ride start" | Socket may not be connected when ride is accepted from background. First update must go via REST |
| No race condition handling | Added idempotent ride start with optimistic tracking |
| No handling of driver app crash between tap and tracking | Added MMKV persistence before tracking starts |

#### expo-location Specifics — Missing

| Issue | Detail |
|-------|--------|
| WorkManager vs foreground service | Without `isAndroidForegroundServiceEnabled: true` in plugin config, uses WorkManager subject to Doze |
| `timeInterval` does nothing on iOS | Must use software throttle for time-based filtering on iOS |
| Task registration timing | Must be at module scope — NOT inside components or lazy modules |
| In-memory state loss after kill | Background task fires without ride ID, socket, or buffer. Must read all from MMKV |
| Double task registration | Re-registering same task name may cause gap in tracking |

### 7.2 Core Architecture Fixes

#### Fix 1: TaskManager Task at Module Scope

```javascript
// FILE: App.js or index.js — MUST be top-level, not lazy-loaded
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

const RIDE_TRACKING_TASK = 'RIDE_LOCATION_TRACKING';

// MUST be at module scope, outside any component or function
TaskManager.defineTask(RIDE_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    logError('LocationTask', error);
    return;
  }

  if (!data?.locations?.length) return;

  // Read ride state from MMKV (NOT from React state/context)
  const rideState = readRideStateFromDisk();
  if (!rideState || rideState.status !== 'active') {
    // No active ride — stop tracking to save battery
    await Location.stopLocationUpdatesAsync(RIDE_TRACKING_TASK);
    return;
  }

  // Process locations
  const points = data.locations.map((loc) => ({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    heading: loc.coords.heading,
    speed: loc.coords.speed,
    accuracy: loc.coords.accuracy,
    ts: loc.timestamp,
    rideId: rideState.rideId,
  }));

  // Persist to disk buffer
  const buffer = new LocationBuffer(rideState.rideId);
  buffer.append(points);

  // Try to send via REST (socket may not be available in background)
  await trySendLocations(rideState.rideId, points);
});
```

#### Fix 2: Disk-First State Machine

```javascript
// rideStorage.js — all ride state lives on disk
import { MMKV } from 'react-native-mmkv';

export const rideStorage = new MMKV({ id: 'ride-tracking' });

export function readRideStateFromDisk() {
  const raw = rideStorage.getString('ride:active');
  return raw ? JSON.parse(raw) : null;
}

export function persistRideState(state) {
  rideStorage.set('ride:active', JSON.stringify(state));
}

// Auth config stored separately for background task access
export function persistRideConfig(serverUrl, authToken) {
  rideStorage.set(
    'ride:config',
    JSON.stringify({ serverUrl, authToken })
  );
}

export function readRideConfig() {
  const raw = rideStorage.getString('ride:config');
  return raw ? JSON.parse(raw) : null;
}

// Background-safe send function (no socket dependency)
export async function trySendLocations(rideId, points) {
  const config = readRideConfig();
  if (!config) return;

  const { serverUrl, authToken } = config;

  try {
    await fetch(`${serverUrl}/rides/${rideId}/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ points }),
    });
  } catch (e) {
    // Network unavailable — points are already in the buffer
  }
}
```

#### Fix 3: RideTrackingService Singleton

```javascript
// RideTrackingService.js — singleton, NOT a React component
class RideTrackingService {
  static instance = null;

  static getInstance() {
    if (!this.instance) {
      this.instance = new RideTrackingService();
    }
    return this.instance;
  }

  constructor() {
    this.socketManager = null;
    this.locationThrottle = null;
    this.heartbeat = null;
    this.isTracking = false;
    this.rideId = null;
    this.listeners = new Set(); // React components subscribe here
    this.foregroundSub = null;
  }

  async startRide(rideId, serverUrl, authToken) {
    this.rideId = rideId;
    this.isTracking = true;
    this.locationThrottle = new LocationThrottle({ minTimeMs: 3000, minDistanceM: 10 });

    // Persist config for background task
    persistRideConfig(serverUrl, authToken);
    persistRideState({ rideId, status: 'active', startedAt: Date.now() });

    // Start socket
    this.socketManager = new RideSocketManager(serverUrl, authToken);
    this.socketManager.connectForRide(rideId);

    // Start heartbeat
    this.heartbeat = new LocationHeartbeat((data) => {
      this.socketManager?.sendLocation({ ...data, type: 'heartbeat' });
    });
    this.heartbeat.start();

    // Start background location
    await Location.startLocationUpdatesAsync(RIDE_TRACKING_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5, // Low value — throttle in software
      foregroundService: {
        notificationTitle: 'Trip in progress',
        notificationBody: 'Navigating to destination',
        notificationColor: '#4CAF50',
      },
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesLocationUpdatesAutomatically: false,
    });

    // Start foreground subscription (higher frequency when app is visible)
    this.foregroundSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        timeInterval: 2000,
      },
      (location) => this.onLocationUpdate(location)
    );

    // Register significant change monitoring (iOS crash recovery)
    if (Platform.OS === 'ios') {
      await registerSignificantChangeMonitoring();
    }
  }

  onLocationUpdate(location) {
    const point = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
      accuracy: location.coords.accuracy,
      ts: location.timestamp,
    };

    // Update heartbeat with latest position
    this.heartbeat?.updateLocation(point);

    // Notify all subscribed React components (for UI updates)
    this.listeners.forEach((cb) => cb(point));

    // Throttle before sending to server
    if (this.locationThrottle.shouldSend(point)) {
      this.socketManager?.sendLocation(point);
      const buffer = new LocationBuffer(this.rideId);
      buffer.append([point]);
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async endRide() {
    this.isTracking = false;

    // Stop heartbeat
    this.heartbeat?.stop();
    this.heartbeat = null;

    // Stop foreground location
    if (this.foregroundSub) {
      this.foregroundSub.remove();
      this.foregroundSub = null;
    }

    // Stop background location
    const isTracking = await Location.hasStartedLocationUpdatesAsync(RIDE_TRACKING_TASK)
      .catch(() => false);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(RIDE_TRACKING_TASK);
    }

    // Stop significant change monitoring (iOS)
    if (Platform.OS === 'ios') {
      const isSigTracking = await Location.hasStartedLocationUpdatesAsync(
        'SIGNIFICANT_CHANGE_RECOVERY'
      ).catch(() => false);
      if (isSigTracking) {
        await Location.stopLocationUpdatesAsync('SIGNIFICANT_CHANGE_RECOVERY');
      }
    }

    // Flush remaining buffer
    if (this.rideId) {
      await flushLocationBuffer(this.rideId);
    }

    // Disconnect socket
    this.socketManager?.disconnectForRideEnd();
    this.socketManager = null;

    // Clean up persisted state
    rideStorage.delete('ride:active');
    rideStorage.delete('ride:config');

    this.rideId = null;
    this.locationThrottle = null;
    this.listeners.clear();
  }
}

// React hook for components
function useRideLocation() {
  const [location, setLocation] = useState(null);

  useEffect(() => {
    const service = RideTrackingService.getInstance();
    const unsub = service.subscribe(setLocation);
    return unsub;
  }, []);

  return location;
}
```

#### Fix 4: RideSocketManager

```javascript
class RideSocketManager {
  constructor(serverUrl, authToken) {
    this.serverUrl = serverUrl;
    this.authToken = authToken;
    this.socket = null;
    this.rideId = null;
  }

  connectForRide(rideId) {
    this.rideId = rideId;

    if (this.socket?.connected) {
      this.joinRideRoom(rideId);
      return;
    }

    this.socket = io(this.serverUrl, {
      auth: { token: this.authToken },
      transports: ['websocket'], // Skip polling — faster connect
      reconnection: true,
      reconnectionAttempts: Infinity, // Never stop during active ride
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000, // Max 5s between attempts (aggressive)
      timeout: 10000,
      forceNew: true,
    });

    this.socket.on('connect', () => {
      this.joinRideRoom(rideId);
    });

    this.socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        // Server intentionally disconnected — reconnect manually
        setTimeout(() => this.socket.connect(), 1000);
      }
    });

    this.socket.on('connect_error', (err) => {
      if (err.message?.includes('401') || err.message?.includes('unauthorized')) {
        this.refreshAuthAndReconnect();
      }
    });
  }

  joinRideRoom(rideId) {
    this.socket.emit('ride:join', { rideId }, (ack) => {
      if (!ack?.ok) {
        setTimeout(() => this.joinRideRoom(rideId), 2000);
      }
    });
  }

  sendLocation(locationData) {
    if (!this.rideId) return;
    const payload = { ...locationData, rideId: this.rideId };

    if (this.socket?.connected) {
      this.socket.volatile.emit('ride:location', payload);
      // volatile = drop if can't send immediately (location data is perishable)
    }
    // If not connected, LocationBuffer handles persistence
  }

  disconnectForRideEnd() {
    if (this.socket) {
      this.socket.emit('ride:complete', { rideId: this.rideId });
      setTimeout(() => {
        this.socket.disconnect();
        this.socket = null;
      }, 2000);
    }
    this.rideId = null;
  }

  async refreshAuthAndReconnect() {
    try {
      const newToken = await api.refreshToken();
      this.authToken = newToken;
      persistRideConfig(this.serverUrl, newToken);
      this.socket.auth = { token: newToken };
      this.socket.connect();
    } catch (e) {
      setTimeout(() => this.refreshAuthAndReconnect(), 5000);
    }
  }
}
```

#### Fix 5: LocationHeartbeat

```javascript
class LocationHeartbeat {
  constructor(sendFn) {
    this.sendFn = sendFn;
    this.lastLocation = null;
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => {
      if (this.lastLocation) {
        this.sendFn({
          ...this.lastLocation,
          type: 'heartbeat',
          ts: Date.now(),
        });
      }
    }, 30000); // Every 30 seconds
  }

  updateLocation(loc) {
    this.lastLocation = loc;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
```

#### Fix 6: Permission Monitor

```javascript
function usePermissionMonitor(isRideActive) {
  const lastPermissionRef = useRef(null);

  useEffect(() => {
    if (!isRideActive) return;

    const checkPermission = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();

      if (lastPermissionRef.current && status !== lastPermissionRef.current) {
        if (status !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'Trip tracking requires location access. Without it, the passenger cannot see your position.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'End Trip', style: 'destructive', onPress: () => handleEmergencyRideEnd() },
            ],
            { cancelable: false }
          );

          // Notify server
          socket.emit('ride:tracking_permission_lost', { rideId });
        }
      }

      lastPermissionRef.current = status;
    };

    checkPermission();
    const interval = setInterval(checkPermission, 10000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPermission();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isRideActive]);
}
```

#### Fix 7: Server-Side Watchdog (Context-Aware)

```javascript
async function watchdogCheck() {
  const activeRides = await Ride.find({ status: 'in_progress' });

  for (const ride of activeRides) {
    const lastUpdate = await redis.get(`ride:${ride._id}:lastLocation`);
    if (!lastUpdate) continue;

    const parsed = JSON.parse(lastUpdate);
    const silentSeconds = (Date.now() - parsed.ts) / 1000;
    const lastSpeed = parsed.speed || 0; // m/s

    // Speed-aware thresholds
    // Moving (>2 m/s = ~7 km/h): alert after 60s
    // Stationary: alert after 180s (driver at red light, parked)
    const softThreshold = lastSpeed > 2 ? 60 : 180;
    const hardThreshold = softThreshold * 2;

    if (silentSeconds > hardThreshold) {
      // Tier 2: Visible push notification to driver
      await sendVisiblePush(ride.driverId, {
        title: 'Trip tracking paused',
        body: 'Tap to resume your active trip',
        data: { type: 'resume_tracking', rideId: ride._id.toString() },
      });

      // Tier 3: Notify passenger
      io.to(`user:${ride.passengerId}`).emit('ride:tracking_degraded', {
        rideId: ride._id,
        lastKnownLocation: parsed,
        message: 'Driver location temporarily unavailable',
      });
    } else if (silentSeconds > softThreshold) {
      // Tier 1: Silent push to wake app
      await sendSilentPush(ride.driverId, {
        data: { type: 'wake_tracking', rideId: ride._id.toString() },
      });
    }
  }
}

// Run every 30 seconds
setInterval(watchdogCheck, 30000);
```

#### Fix 8: Server-Side Idempotent Ride Start

```javascript
async function startRide(req, res) {
  const { rideId } = req.params;
  const { idempotencyKey } = req.body;

  // Check idempotency
  const existing = await redis.get(`idempotency:${idempotencyKey}`);
  if (existing) {
    return res.status(409).json({ message: 'Already started', ride: JSON.parse(existing) });
  }

  const ride = await Ride.findById(rideId);
  if (ride.status === 'in_progress') {
    return res.status(409).json({ message: 'Already in progress' });
  }
  if (ride.status !== 'accepted') {
    return res.status(400).json({ message: 'Ride not in accepted state' });
  }

  ride.status = 'in_progress';
  ride.startedAt = new Date();
  await ride.save();

  // Cache idempotency key for 5 minutes
  await redis.setex(`idempotency:${idempotencyKey}`, 300, JSON.stringify(ride));

  // Notify passenger
  io.to(`user:${ride.passengerId}`).emit('ride:started', { rideId });

  return res.json(ride);
}
```

---

## 8. Edge-Case Fixes

### 8.1 Android OEM Kills App/Service

**Detection:** Background TaskManager task stops receiving callbacks. Server watchdog detects gap.

**Recovery chain:**

1. Server watchdog sends silent FCM push (high priority) after 60-90s
2. FCM push wakes app process (even if killed)
3. App startup runs `recoverActiveRide()`
4. Active ride detected -> tracking restarts
5. Buffer from before kill is flushed

**If silent push fails** (user disabled notifications):

6. Server sends visible push after 120-180s
7. Driver taps notification -> app opens -> recovery runs

**If driver never reopens app:**

8. After 5 minutes, server notifies passenger: "Driver tracking unavailable"
9. Passenger can contact driver via in-app call
10. Server marks ride as `tracking_lost` for operations review

### 8.2 User Swipes App Away

**Android:** Swiping away from recents does NOT kill the foreground service on stock Android. It DOES kill it on Xiaomi, Huawei, and some Samsung devices. Same recovery as 8.1.

**iOS:** Swiping away terminates the app and stops all location updates. Significant location change monitoring (if registered) can relaunch the app with ~500m accuracy, which triggers `recoverActiveRide()` to restart accurate tracking.

**User education:** Show a brief tooltip on first ride: "For reliable trip tracking, avoid swiping this app away during a ride."

### 8.3 App Process Restarts During Active Ride

Handled by `recoverActiveRide()` running in App.js on every app start:

```javascript
function App() {
  useEffect(() => {
    recoverActiveRide().then((rideState) => {
      if (rideState) {
        if (rideState.trackingDegraded) {
          navigation.navigate('PermissionRecovery', { rideState });
        } else {
          navigation.navigate('ActiveRide', { rideId: rideState.rideId });
        }
      }
    });
  }, []);
  // ...
}
```

### 8.4 Internet Disconnects for Several Minutes

Location tracking continues (GPS-based, not internet-dependent). The buffer grows on disk. When connectivity returns:

1. Socket reconnects automatically (max 5s backoff)
2. Socket reconnect triggers room rejoin
3. Buffer flush sends missed points in chunks of 50
4. Server deduplicates by timestamp

### 8.5 Socket Reconnects with Stale Data

**Problem:** First `driver:location` event after reconnect might contain cached pre-disconnect position. Passenger sees driver "teleport."

**Fix — Timestamp + teleport validation on passenger client:**

```javascript
function useDriverLocation(rideId) {
  const [driverLocation, setDriverLocation] = useState(null);
  const lastTimestampRef = useRef(0);

  useEffect(() => {
    const handler = (data) => {
      // Reject stale updates
      if (data.ts <= lastTimestampRef.current) return;

      // Reject unreasonable jumps (> 200km/h equivalent)
      if (driverLocation) {
        const dist = haversineDistance(
          driverLocation.lat, driverLocation.lng, data.lat, data.lng
        );
        const timeDiff = (data.ts - lastTimestampRef.current) / 1000;
        const speedKmh = (dist / timeDiff) * 3.6;

        if (speedKmh > 200 && timeDiff < 60) {
          data._snapped = true; // Snap marker, don't animate
        }
      }

      lastTimestampRef.current = data.ts;
      setDriverLocation(data);
    };

    socket.on('driver:location', handler);
    return () => socket.off('driver:location', handler);
  }, [rideId]);

  return driverLocation;
}
```

### 8.6 User Changes Permission Mid-Ride

Handled by `usePermissionMonitor` hook (see Fix 6 above). Checks every 10 seconds and on AppState change. Shows alert with options to open settings or end trip. Notifies server that tracking is degraded.

### 8.7 GPS Becomes Inaccurate

```javascript
function processLocationQuality(location) {
  const accuracy = location.coords.accuracy;

  if (accuracy < 20) {
    return { ...location, qualityTier: 'good' };
  }

  if (accuracy < 100) {
    return { ...location, qualityTier: 'degraded' };
  }

  // > 100m — likely cell tower, not GPS
  // Record for route reconstruction but don't update visible marker
  return { ...location, qualityTier: 'poor', displayInhibit: true };
}
```

Passenger app handles quality tiers:

```javascript
if (!locationUpdate.displayInhibit) {
  animateMarkerTo(locationUpdate);
} else {
  setGpsQuality('poor'); // Show "GPS signal weak" indicator
}
```

### 8.8 Driver Stops at Red Light and Tracking "Pauses"

This is NOT a bug. With `distanceFilter: 5-10m`, no updates are generated when stationary. The `LocationHeartbeat` (30s keepalive) ensures:

- Server watchdog doesn't false-alarm
- Passenger sees "Driver is stopped" instead of thinking tracking is broken

Server differentiates heartbeat from movement:

```javascript
if (locationData.type === 'heartbeat') {
  await redis.setex(`ride:${rideId}:lastHeartbeat`, 300, JSON.stringify(locationData));
  // Don't insert into route points
} else {
  await redis.setex(`ride:${rideId}:lastLocation`, 300, JSON.stringify(locationData));
  await insertRoutePoint(rideId, locationData);
}
```

### 8.9 Battery Saver Mode Turns On

```javascript
function useBatteryMonitor(isRideActive) {
  useEffect(() => {
    if (!isRideActive) return;

    const checkBattery = async () => {
      const level = await DeviceInfo.getBatteryLevel();
      const powerState = await DeviceInfo.getPowerState();

      if (powerState.lowPowerMode || level < 0.15) {
        showBatteryWarning(
          'Low battery may affect trip tracking. Please charge your phone.'
        );

        api.post(`/rides/${rideId}/events`, {
          type: 'low_battery',
          level,
          lowPowerMode: powerState.lowPowerMode,
        });
      }
    };

    const interval = setInterval(checkBattery, 60000);
    checkBattery();
    return () => clearInterval(interval);
  }, [isRideActive]);
}
```

**Important:** Do NOT degrade accuracy when battery is low. For ride-hailing, accurate tracking is more important than battery savings during the ride.

### 8.10 App Navigates Between Screens and Listeners Get Lost

Solved by `RideTrackingService` singleton architecture. The service lives outside the React component tree. Screen navigation does not affect it. Components subscribe via `useRideLocation()` hook.

```javascript
// RideTrackingContext.js — wraps entire navigation tree
const RideTrackingContext = createContext(null);

export function RideTrackingProvider({ children }) {
  const serviceRef = useRef(RideTrackingService.getInstance());

  return (
    <RideTrackingContext.Provider value={serviceRef.current}>
      {children}
    </RideTrackingContext.Provider>
  );
}

// In App.js
export default function App() {
  return (
    <RideTrackingProvider>
      <NavigationContainer>
        {/* All screens can safely subscribe */}
      </NavigationContainer>
    </RideTrackingProvider>
  );
}
```

---

## 9. Final Deliverables

### 9.1 Problem -> Fix Table

| # | Problem | Severity | Fix | Platform |
|---|---------|----------|-----|----------|
| 1 | expo-location WorkManager batching | Critical | Use `isAndroidForegroundServiceEnabled: true` in plugin config | Android |
| 2 | TaskManager task not registered on app restart | Critical | Define task at module scope in App.js/index.js | Both |
| 3 | Race condition on ride start | Critical | Optimistic tracking + idempotent server endpoint | Both |
| 4 | In-memory state lost after app kill | Critical | MMKV disk-first state machine | Both |
| 5 | Socket not ride-lifecycle-aware | High | RideSocketManager with aggressive reconnect (max 5s) | Both |
| 6 | Watchdog false positives at red lights | High | Speed-aware thresholds + heartbeat mechanism | Server |
| 7 | Buffer drops oldest points | Medium | Smart thinning (keep ends, thin middle by distance) | Both |
| 8 | Batch sync can timeout | High | Chunked upload (50 points per request) | Both |
| 9 | No time throttle on iOS | High | Software `LocationThrottle` layer | iOS |
| 10 | Permission downgrade silent failure | High | Periodic permission check + alert + server notify | Both |
| 11 | React component unmount kills listeners | Critical | `RideTrackingService` singleton outside React tree | Both |
| 12 | iOS pauses updates (default config) | Critical | `pausesLocationUpdatesAutomatically = false` | iOS |
| 13 | Incomplete app restart recovery | High | Comprehensive `recoverActiveRide()` with all checks | Both |
| 14 | OEM kills foreground service | Critical | Battery whitelist + FCM watchdog push + user education | Android |
| 15 | Stale data after socket reconnect | Medium | Timestamp validation + teleport detection | Both |
| 16 | GPS accuracy degradation | Medium | Quality tiers + `displayInhibit` flag | Both |
| 17 | No heartbeat when stationary | Medium | 30s heartbeat keepalive | Both |
| 18 | Battery saver degrades tracking | Medium | Monitor + warn driver, don't degrade accuracy | Android |
| 19 | `distanceFilter` only on iOS (no time control) | Medium | Low OS filter + software throttle | iOS |
| 20 | Auth token expires during long ride | Medium | Auto-refresh on 401 + persist new token to MMKV | Both |

### 9.2 Android Fix Checklist

- [ ] `expo-location` plugin: `isAndroidForegroundServiceEnabled: true`, `isAndroidBackgroundLocationEnabled: true`
- [ ] Foreground service notification channel created with appropriate importance
- [ ] `foregroundServiceType="location"` in service declaration (handled by expo-location plugin)
- [ ] Permissions: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`
- [ ] Background location permission requested separately from foreground (two-step flow)
- [ ] OEM battery optimization detection: check manufacturer, prompt whitelist
- [ ] OEM package names in `<queries>` block (Android 11+ package visibility)
- [ ] Battery optimization exemption via `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
- [ ] FCM high-priority silent push handler at top level for watchdog wake
- [ ] TaskManager task defined at module scope (top of App.js)
- [ ] MMKV storage for ride state (not AsyncStorage)
- [ ] App startup recovery (`recoverActiveRide()`) runs before navigation
- [ ] Foreground service starts BEFORE any network calls on ride start
- [ ] Play Store background location declaration form filled

### 9.3 iOS Fix Checklist

- [ ] `UIBackgroundModes: ['location', 'fetch', 'remote-notification']` in Info.plist
- [ ] `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` with clear strings
- [ ] `pausesLocationUpdatesAutomatically = false` — verified in code
- [ ] `allowsBackgroundLocationUpdates = true` — set on ride start
- [ ] `showsBackgroundLocationIndicator = true` — blue pill visible
- [ ] `activityType = AutomotiveNavigation`
- [ ] Significant location change monitoring as crash recovery fallback
- [ ] No silent audio session hack anywhere in codebase
- [ ] Software time throttle (`LocationThrottle`) applied on top of `distanceFilter`
- [ ] App Review notes explain background location is ride-only
- [ ] MMKV storage for ride state
- [ ] App startup recovery runs before navigation

### 9.4 React Native / Expo Fix Checklist

- [ ] `TaskManager.defineTask` at module scope in entry file
- [ ] `RideTrackingService` singleton owns socket, throttle, heartbeat, and ride state
- [ ] React components subscribe via hook, not own listeners
- [ ] No ride-critical state in React state/context — all on disk (MMKV)
- [ ] `ride:config` (serverUrl, authToken) persisted to MMKV for background task
- [ ] Background task uses `fetch()` directly, not socket
- [ ] Foreground subscription (`watchPositionAsync`) for high-frequency UI updates
- [ ] Background task (`startLocationUpdatesAsync`) for reliable tracking
- [ ] `LocationThrottle` applied before sending (both paths)
- [ ] `LocationHeartbeat` sends keepalive every 30s when stationary
- [ ] Permission monitor runs during active ride (10s interval + AppState listener)
- [ ] Battery monitor warns driver, does NOT degrade accuracy
- [ ] `recoverActiveRide()` in App.js useEffect
- [ ] `react-native-mmkv` installed (requires dev client)
- [ ] No AsyncStorage for hot-path operations

### 9.5 Backend Fix Checklist

- [ ] Ride start endpoint is idempotent (idempotency key in Redis, 5min TTL)
- [ ] Location ingestion deduplicates by timestamp (1s tolerance)
- [ ] Batch endpoint accepts chunks (50 points max per request)
- [ ] Batch endpoint returns `{ received, inserted }`
- [ ] Watchdog runs every 30s for all active rides
- [ ] Watchdog uses speed-aware thresholds (60s moving, 180s stationary)
- [ ] Watchdog tier 1: silent FCM push
- [ ] Watchdog tier 2: visible push notification
- [ ] Watchdog tier 3: notify passenger of degraded tracking
- [ ] Heartbeat events reset watchdog but don't create route points
- [ ] Location events include quality tier
- [ ] Server handles `ride:tracking_permission_lost` event
- [ ] Redis stores latest driver position (for REST polling fallback)
- [ ] Socket reconnect handler re-joins driver to ride room
- [ ] Ride room cleanup on ride end

### 9.6 Best Production Approach Summary

The #1 mistake in naive implementations is treating location tracking as a single-layer problem. It's a **three-layer system:**

**Layer 1 — OS Layer (Getting GPS updates reliably)**

- Android: foreground service that OEMs can't easily kill
- iOS: background location mode with `pausesLocationUpdatesAutomatically = false`
- Both: correct permissions, requested at the right time

**Layer 2 — App Layer (Processing updates reliably)**

- Singleton service outside the React tree
- Disk-first state (MMKV, never in-memory-only)
- Software throttle for platform-independent filtering
- Background task at module scope that operates without React context
- Heartbeat when stationary

**Layer 3 — Network Layer (Delivering updates reliably)**

- Socket for real-time + REST for persistence
- Local buffer that survives app kills
- Chunked batch uploads on reconnect
- Server-side deduplication
- Watchdog with context-aware thresholds
- FCM push recovery when tracking fails

**The non-negotiable rule:** Tracking must never die silently. The server watchdog + local persistence + push notification recovery loop is what separates a reliable ride tracker from one that "works in testing but fails in production."

---

## 10. Exact Changes To Make Right Now

In priority order for the Lulini driver app:

### Priority 1 — Foundation (must do before anything else)

1. **Install `react-native-mmkv`** and create `mobile-driver/src/services/rideStorage.js` with synchronous ride state read/write. Replace any AsyncStorage usage for ride-critical data.

2. **Move `TaskManager.defineTask` to the top of App.js** (or index.js). Verify it is NOT inside a component, useEffect, or lazy import. The task callback must read ride state from MMKV, not from closures or React state.

3. **Create `mobile-driver/src/services/RideTrackingService.js`** as a singleton class that owns the location subscription, socket manager, location throttle, and heartbeat. React components subscribe via hook.

### Priority 2 — Reliable Tracking

4. **Fix `startLocationUpdatesAsync` call** to include:
   - `foregroundService` config with notification (Android)
   - `pausesLocationUpdatesAutomatically: false` (iOS)
   - `showsBackgroundLocationIndicator: true` (iOS)
   - `activityType: ActivityType.AutomotiveNavigation` (iOS)
   - `distanceInterval: 5` (low, throttle in software)

5. **Implement `LocationThrottle` class** with combined time (3s) + distance (10m) filtering. Apply in both foreground and background code paths.

6. **Implement `LocationHeartbeat`** — 30s keepalive when stationary to prevent watchdog false positives.

### Priority 3 — Resilience

7. **Implement `recoverActiveRide()`** in App.js — runs on every app start, checks MMKV for active ride, validates with server, restarts tracking if needed.

8. **Implement `LocationBuffer`** with smart thinning and chunked REST flush. Buffer lives in MMKV. Background task appends to buffer. Flush on reconnect, periodically, and on ride end.

9. **Implement `RideSocketManager`** with ride-aware lifecycle — aggressive reconnect (max 5s backoff), room rejoin on connect, auth token refresh on 401.

10. **Add idempotent ride start** — optimistic tracking start, server retry with idempotency key, handle all race conditions.

### Priority 4 — Edge Cases

11. **Add FCM background message handler** for watchdog wake — restart tracking from push notification when OEM kills the app.

12. **Add permission monitor** — check every 10s during active ride + on AppState change, alert driver and notify server if permission lost.

13. **Add OEM battery optimization prompt** — detect Xiaomi/Samsung/Huawei/Oppo, show one-time prompt to whitelist, deep-link to manufacturer settings.

14. **Add server-side watchdog** with speed-aware thresholds and three-tier alerting.

### Priority 5 — Polish

15. **Add GPS quality tiers** — classify updates by accuracy, inhibit display of poor-quality updates on passenger map.

16. **Add battery monitor** — warn driver at <15%, don't degrade tracking accuracy.

17. **Add structured logging** — log every 5th GPS update, all state transitions, all errors. Upload on ride end.

18. **Prepare store submission materials** — Play Store background location form, App Review notes for iOS, privacy policy update.

---

*Document generated for the Lulini ride-hailing platform. All architecture recommendations are specific to the React Native (Expo) + Express + Socket.IO stack used in this project.*
