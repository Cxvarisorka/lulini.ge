# Mobile-Driver App - Production Audit Report

**Date:** 2026-03-04
**Auditor:** Senior Mobile Architect Review
**Scope:** All screens, components, services, context providers, and configuration

---

## Overall App Health: 6.2 / 10

The app has a solid foundation with good patterns (image-based markers, background location batching, socket reconnection). However, multiple critical issues around state management, memory leaks, and missing error handling would cause real problems for drivers using it daily.

---

## Category Scores

| Category | Score | Summary |
|----------|-------|---------|
| **Performance** | 6/10 | Good marker optimization, but context re-render storms, unmemoized computations, and cache leaks |
| **UX** | 5/10 | Core flows work, but missing feedback, no offline indicators, alert fatigue, no undo |
| **UI** | 6/10 | Clean design, but hardcoded colors/sizes bypass theme system, typography inconsistency |
| **Architecture / Code Quality** | 7/10 | Well-structured contexts and services, but dual state sources, stale closures, and tight coupling |

---

## CRITICAL Issues (Fix Immediately)

### C1. SocketContext `driver:rejoin` Uses Undefined Variable
**File:** `src/context/SocketContext.js` ~line 119
**Problem:** The effect references `socketInstance` which doesn't exist in scope. Should be `socketRef.current`.
**Impact:** Driver rejoin silently fails — server doesn't know the driver is online after going online. Rides won't be dispatched.
**Fix:** Replace `socketInstance.emit('driver:rejoin')` with `socketRef.current.emit('driver:rejoin')`.

### C2. Socket Auth Callback Falls Back to Stale Token
**File:** `src/context/SocketContext.js` ~line 174-179
**Problem:** `auth: async (cb) => { const freshToken = await SecureStore.getItemAsync('token'); cb({ token: freshToken || token }); }` — if SecureStore returns null, it uses the closure's stale `token`.
**Impact:** Reconnection with expired tokens; persistent auth failures; driver appears offline.
**Fix:** Reject connection if fresh token is null. Don't fall back to closure variable.

### C3. API Interceptor Silently Swallows Token Errors
**File:** `src/services/api.js` ~lines 24-26
**Problem:** Request interceptor catch block swallows errors and sends requests without auth headers.
**Impact:** Unauthenticated requests reach the server; security vulnerability; silent failures.
**Fix:** Reject the request promise if token retrieval fails.

### C4. LocationContext Permission Lock Can Deadlock on iOS
**File:** `src/context/LocationContext.js` ~line 130
**Problem:** Boolean ref lock with async operations. Two simultaneous calls can both see `false` before either sets `true`.
**Impact:** Overlapping permission dialogs on iOS can crash the app.
**Fix:** Use a Promise-based lock or a queued mutex pattern.

### C5. SocketContext Value Object Causes Re-render Storms
**File:** `src/context/SocketContext.js` ~line 393-401
**Problem:** `useMemo` includes stable callbacks (`emitEvent`, `clearRideRequest` with `[]` deps) in its dependency array, but the real issue is that `fetchPendingRides` and `setDriverOnlineStatus` recreate frequently, forcing all consumers to re-render.
**Impact:** Every component using `useSocket()` re-renders on every context change — ConnectionStatusBar, DriverProvider, all screens.
**Fix:** Stabilize all callbacks with proper `useCallback` + refs. Remove unnecessary deps from `useMemo`.

### C6. Background Location Retry Timer Can Duplicate
**File:** `src/services/backgroundLocation.js` ~line 263-270
**Problem:** `startBackgroundLocationUpdates` creates a `setInterval` but only checks `if (!retryFlushTimer)`. If called again after `stopBackgroundLocationUpdates` clears the timer, a new one is created — but if stop isn't called, old timer persists.
**Impact:** Multiple simultaneous intervals draining battery and sending duplicate batches.
**Fix:** Always `clearInterval(retryFlushTimer)` before creating new one.

---

## HIGH Priority Issues

### H1. DriverContext Dual State Source (Ref + useState)
**File:** `src/context/DriverContext.js` ~lines 40-45
**Problem:** `ridesCache` ref and `cachedRides` state track the same data. Updates to ref don't trigger re-renders; updates to state don't sync to ref.
**Impact:** UI shows stale ride data intermittently.
**Fix:** Use a single source of truth — either ref-based with forced updates, or state-based exclusively.

### H2. Socket Event Listeners Re-registered on Every Context Change
**File:** `src/context/DriverContext.js` ~line 124-185
**Problem:** `useEffect` depends on `[socket, invalidateCache, invalidateEarningsCache]`. When any of these change, all listeners are removed and re-added.
**Impact:** Socket events can be lost during listener re-registration window. Memory spikes.
**Fix:** Use refs for callbacks; keep socket listener registration stable.

### H3. NavigationScreen Inline Computations on Every Render
**File:** `src/screens/NavigationScreen.js` ~lines 199-217
**Problem:** `distanceToNextStep`, `remainingDistance`, `remainingDuration` computed inline with IIFE and `slice().reduce()` on every render.
**Impact:** Lag during navigation, especially on older devices. GPS updates at 1Hz = computation every second.
**Fix:** Wrap in `useMemo` with proper dependencies.

### H4. RidesScreen Filter Logic Not Memoized
**File:** `src/screens/RidesScreen.js` ~lines 209-264
**Problem:** `applyAdvancedFilters` runs on every render. Creates new Date objects for every ride on every filter change.
**Impact:** FlatList with hundreds of rides causes visible lag when scrolling.
**Fix:** Wrap in `useMemo` with `[rides, filters]` dependencies.

### H5. Cache Memory Leaks (No TTL Cleanup)
**Files:** `src/services/googleMaps.js`, `src/services/directions.js`
**Problem:** Caches evict by size only. Expired entries (past TTL) remain in memory until size limit triggers eviction.
**Impact:** Memory growth over long driving sessions. No periodic garbage collection.
**Fix:** Add periodic cleanup (e.g., every 5 minutes, sweep expired entries).

### H6. HomeScreen No Debounce on Online/Offline Toggle
**File:** `src/screens/HomeScreen.js`
**Problem:** No debounce or loading lock on the online/offline toggle button.
**Impact:** Rapid clicks cause race conditions — multiple API calls fire, status flickers.
**Fix:** Add loading state + disable button during API call.

### H7. LocationContext Cleanup Incomplete on Logout
**File:** `src/context/LocationContext.js` ~line 468-476
**Problem:** `cleanupForLogout` resets some refs but not `locationSubscription`, `isShowingAlert`, `activeRideRef`, `permissionLockRef`.
**Impact:** Next login may have stale watcher subscriptions or permanently locked permission dialog.
**Fix:** Reset all refs in cleanup.

---

## MEDIUM Priority Issues

### M1. No Offline Status Indicator for Driver
**Problem:** ConnectionStatusBar shows socket status but not network connectivity. Location batches queue silently.
**Impact:** Driver doesn't know their location isn't reaching the server.
**Fix:** Add network status to ConnectionStatusBar; show queued batch count.

### M2. Hardcoded Colors Bypass Theme System
**Files:** HomeScreen (inline status colors), RideDetailScreen (`#FFA500`), RidesScreen (`#f97316`), ConnectionStatusBar (`#dc2626`, `#16a34a`), ErrorBoundary (`#7c3aed`)
**Impact:** Design changes require hunting through all files.
**Fix:** Use `colors.*` from theme consistently.

### M3. Typography System Not Used in All Components
**Files:** ConnectionStatusBar (`fontSize: 13`), ErrorBoundary (`fontSize: 22`), multiple screens with hardcoded sizes
**Impact:** Georgian text sized incorrectly; inconsistent with 2025 typography best practices.
**Fix:** Use `useTypography()` hook everywhere.

### M4. Push Token Registration Not Validated
**File:** `src/services/pushNotifications.js` ~lines 46-50
**Problem:** Server response not checked before storing token locally.
**Impact:** App thinks notifications work but they don't.
**Fix:** Validate `response.data.success` before calling `SecureStore.setItemAsync`.

### M5. Notification Permission Not Re-Requested After Denial
**File:** `App.js` ~line 62-87
**Problem:** `notifPermRequested` ref prevents re-requesting after denial.
**Impact:** User who denied on first launch can never enable notifications without reinstalling.
**Fix:** Re-check on app foreground; show in-app prompt linking to Settings.

### M6. Ride Request Modal Not Synced with Socket State
**File:** `src/screens/HomeScreen.js` ~line 42
**Problem:** `showRideRequest` is local state. If socket emits `ride:cancelled` while modal is visible, local state may not clear.
**Impact:** Driver sees cancelled ride in modal; accepting fails.
**Fix:** Drive modal visibility from socket context `newRideRequest` state.

### M7. RideDetailScreen Waiting Time Can Show Negative
**File:** `src/screens/RideDetailScreen.js` ~line 136
**Problem:** `timeLeftMs` check `if (timeLeftMs <= 0)` fires after render, so negative values flash briefly.
**Impact:** Timer shows "-0:01" before switching to paid waiting.
**Fix:** Clamp to `Math.max(0, timeLeftMs)` in the render.

### M8. No Confirmation Before Logout
**File:** `src/screens/SettingsScreen.js`
**Impact:** Accidental taps log driver out during active shift.
**Fix:** Add confirmation dialog.

### M9. EarningsScreen Currency Hardcoded as `$`
**File:** `src/screens/EarningsScreen.js`
**Impact:** Wrong currency for Georgian market (should be ₾ GEL).
**Fix:** Use locale-aware currency formatting.

### M10. Retry Queue Not Cleared on All Logout Paths
**File:** `src/services/backgroundLocation.js`
**Problem:** `clearRetryQueue()` not guaranteed on all logout flows.
**Impact:** Next driver login may send previous driver's location data.
**Fix:** Always clear queue in AuthContext logout.

---

## LOW Priority Issues

### L1. Static Arrays Recreated on Every Render
**Files:** HomeScreen (`quickStats`), ProfileScreen (`quickStats`, `menuItems`), SettingsScreen (`sections`), EarningsScreen (`stats`)
**Fix:** Move outside component or wrap in `useMemo`.

### L2. FlatList `renderItem` Not Memoized in RidesScreen
**Fix:** Wrap `renderRideItem` in `useCallback`.

### L3. SplashScreen Fixed 2.5s Duration
**Problem:** Doesn't wait for actual app initialization.
**Fix:** Tie to provider ready state.

### L4. Version Number Hardcoded in SettingsScreen
**Problem:** Shows '1.0.0' regardless of actual version.
**Fix:** Read from `Constants.expoConfig.version`.

### L5. Missing Accessibility
**Problem:** No text alternatives for icon buttons, no minimum tap target verification (44x44), color-only status indicators.
**Fix:** Add `accessibilityLabel`, `accessibilityRole`, ensure touch targets.

### L6. NavigationScreen No Haptic Feedback on Step Advance
**Fix:** Add `Haptics.impactAsync()` when navigation step changes.

### L7. Unimplemented Menu Items (Help Center, Terms, Privacy)
**File:** `src/screens/SettingsScreen.js`
**Fix:** Either implement or show "Coming soon" toast.

### L8. Dead Code Cleanup
- Deleted `useRouteRecalculation.js` — verify no imports remain
- `MapViewWrapper` unused `provider` prop
- `PolylineWrapper` unused `id` prop

### L9. Duplicate Cache Logic in Directions Service
**File:** `src/services/directions.js`
**Problem:** `getDirections` and `getDirectionsOSRM` have ~80% duplicate cache logic.
**Fix:** Extract shared cache wrapper.

### L10. Background Location Accuracy Threshold Too Strict
**File:** `src/services/backgroundLocation.js` line 44
**Problem:** Rejects locations with accuracy > 100m. Urban canyon effect can cause 50-100m error legitimately.
**Fix:** Increase to 150m or use accuracy as weight factor.

---

## Priority Implementation Order

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1: Critical Fixes** | C1-C6 | 1-2 days | Prevents crashes, auth failures, battery drain |
| **Phase 2: State Management** | H1, H2, H5, H7 | 2-3 days | Eliminates stale data, memory leaks, re-render storms |
| **Phase 3: UX Hardening** | H3, H4, H6, M1, M4-M8 | 3-4 days | Smooth navigation, proper feedback, offline awareness |
| **Phase 4: Design Consistency** | M2, M3, M9, L5 | 1-2 days | Theme compliance, accessibility, correct currency |
| **Phase 5: Polish** | L1-L10 | 2-3 days | Performance micro-optimizations, dead code cleanup |

---

## Best Practices for Mobile Driver Apps

1. **Offline-first architecture**: Queue all mutations (status changes, ride actions) with retry. Show queue depth to driver.
2. **Battery awareness**: Reduce GPS frequency when stationary. Use significant-change monitoring when idle.
3. **Navigation reliability**: Always show ETA updates. Vibrate/sound on turn instructions. Allow manual route override.
4. **Session resilience**: Persist active ride state to storage. On app restart, restore mid-ride state automatically.
5. **Error transparency**: Show toast for every failed action with retry option. Never fail silently.
6. **Map performance**: Pre-decode polylines. Memoize marker images. Use `tracksViewChanges={false}` (already done).
7. **Connection management**: Show clear connected/disconnected/reconnecting states. Auto-reconnect with exponential backoff.
8. **Shift management**: Track total online time, breaks, earnings in real-time. Show daily summary.

---

*This audit reflects the codebase as of 2026-03-04. Issues ranked by real-world impact on drivers using the app in production conditions.*
