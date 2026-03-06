# Mobile Rider App - Production Audit Report

**Date:** 2026-03-04
**Auditor:** Senior Mobile Architect Review
**Scope:** All screens, components, services, context providers, and configuration

---

## Overall App Health: 6.0 / 10

The app has a well-structured foundation — smart fallback chains (Nominatim → Google), good socket lifecycle management, offline-aware API interceptors, and image-based map markers. However, critical bugs in auth recovery, a 2200-line god component (TaxiScreen), broken template literals in the fare display, multiple stub features shipped to production, and pervasive theme bypasses would significantly impact riders using the app daily.

---

## Category Scores

| Category | Score | Summary |
|----------|-------|---------|
| **Performance** | 6/10 | Good caching and marker optimization, but TaxiScreen re-render storms, unmemoized computations, and no cache TTL cleanup |
| **UX** | 5/10 | Core booking flow works, but stub features everywhere, silent error swallowing, no offline indicators, broken fare display |
| **UI** | 6/10 | Clean design, but hardcoded colors/sizes bypass theme, typography system unused in key components, no accessibility |
| **Architecture / Code Quality** | 6/10 | Well-structured contexts and services, but 2200-line TaxiScreen, auth recovery deletes token on network errors, dual state patterns |

---

## CRITICAL Issues (Fix Immediately)

### C1. AuthContext Deletes Token on Any `/auth/me` Network Error
**File:** `src/context/AuthContext.js` ~line 84-85
**Problem:** The `checkAuthStatus` catch block runs `await SecureStore.deleteItemAsync('token')` for *any* error — including network timeouts, 500s, and DNS failures. The API interceptor retries 5xx errors, but if all retries fail, the error propagates here and the valid token is deleted.
**Impact:** Any network hiccup during cold start permanently logs the user out. On flaky cellular connections (common for riders in transit), users are forced to re-authenticate frequently.
**Fix:** Only delete the token on 401 responses. Network errors should leave the token intact and show a retry prompt:
```javascript
catch (err) {
  if (err.response?.status === 401) {
    await SecureStore.deleteItemAsync('token');
  }
  // else: keep token, user stays logged in with stale data
}
```

### C2. RideStatusSheet Broken Template Literal — Waiting Fee Shows Raw Text
**File:** `src/components/taxi/RideStatusSheet.js` ~line 241
**Problem:** The JSX renders:
```jsx
{estimatedPrice}{waitingFee > 0 ? ` (+{waitingFee.toFixed(2)} ₾)` : ''} ₾
```
This is a regular string, not a template literal. The `{waitingFee.toFixed(2)}` inside the string is literal text, not an interpolated expression. Should use backticks with `${}`.
**Impact:** When a waiting fee applies, riders see `(+{waitingFee.toFixed(2)} ₾)` as literal text instead of the actual fee amount. Breaks fare transparency.
**Fix:**
```jsx
{estimatedPrice}{waitingFee > 0 ? ` (+${waitingFee.toFixed(2)} ₾)` : ''} ₾
```

### C3. TaxiScreen `progressAnim` Double-Start Race Condition
**File:** `src/screens/TaxiScreen.js` ~lines 465-588, 1130
**Problem:** The mount `useEffect` starts `Animated.timing(progressAnim)` for pending rides (line 588). A separate `useEffect` (line 1130) also starts the same animation when `bookingStep === SEARCHING`. If both fire during restore of a searching ride, the animation is started twice.
**Impact:** Animation conflict causes visual glitches; progress bar may jump or stutter during ride search.
**Fix:** Consolidate animation start into a single effect, or guard with a `progressAnimRunningRef`.

### C4. TaxiScreen `handleRemoveStop` Uses Stale Closure
**File:** `src/screens/TaxiScreen.js` ~line 1699
**Problem:** `handleRemoveStop` calls `fetchDirectionsAndUpdate` via `setTimeout` after `setStops`, but captures `destinationCoords` from the closure. If destination changes between the state update and the timeout, the wrong coordinates are used.
**Impact:** Route recalculation after removing a stop may use wrong destination → incorrect price/duration shown to rider.
**Fix:** Use a ref for `destinationCoords`, or pass it through a callback pattern.

### C5. AnimatedCarMarker iOS Rotation Bug
**File:** `src/components/map/AnimatedCarMarker.js`
**Problem:** On iOS, the `TopDownCar` component receives `rotation` as a prop and applies CSS transform rotation. However, `tracksViewChanges={false}` means the native side won't re-snapshot the marker after the initial render. The car heading will appear frozen on iOS.
**Impact:** Riders tracking their driver see a static car icon that never rotates to show direction of travel on iOS.
**Fix:** On iOS, either use `tracksViewChanges={true}` for this specific marker (with debouncing), or use the native `rotation` prop on `Marker.Animated` instead of CSS transforms.

### C6. Socket Auth Uses Static Token — No Refresh on Reconnect
**File:** `src/context/SocketContext.js` ~line 61
**Problem:** The socket `auth` option is `{ token }` from the initial `SecureStore.getItemAsync` call. Socket.io reuses this for all reconnection attempts. If the token expires mid-session, all reconnections fail silently.
**Impact:** After token refresh (via cookie rotation in response interceptor), the socket still uses the old token. Driver location updates stop reaching the rider; ride status events are lost.
**Fix:** Use a callback-based auth like the driver app does:
```javascript
auth: async (cb) => {
  const freshToken = await SecureStore.getItemAsync('token');
  if (!freshToken) return cb(new Error('No token'));
  cb({ token: freshToken });
}
```

---

## HIGH Priority Issues

### H1. TaxiScreen Is a 2200-Line God Component
**File:** `src/screens/TaxiScreen.js`
**Problem:** Manages location, booking flow, socket events, map state, driver tracking, payment, reviews, cancellation, and directions all in one component with ~30 state variables. `resetBookingState` resets 15+ state variables individually.
**Impact:** Every state change potentially re-renders the entire booking flow. Extremely hard to debug, test, or modify. New developers will struggle to contribute.
**Fix:** Decompose into a `useRideBooking` hook, `useDriverTracking` hook, and separate sub-screens for each booking phase. Consider `useReducer` to batch state updates.

### H2. `handleRideTimeout` Silently Resets Booking
**File:** `src/screens/TaxiScreen.js` ~line 1428
**Problem:** The catch block runs `resetBookingState()` with no user feedback. The rider's entire booking (pickup, destination, stops, vehicle type) is silently erased.
**Impact:** If the timeout API call fails (network issue), the rider loses their booking setup with no explanation and no way to recover.
**Fix:** Show an error toast/alert before resetting. Offer a "Try Again" option that retains the booking state.

### H3. Cache Memory Leak — No TTL Garbage Collection
**File:** `src/services/googleMaps.js`
**Problem:** Both `directionsCache` and `searchCache` evict by size (100 entries) only. Expired entries (past TTL) remain in memory until the size limit triggers eviction. There is no periodic sweep.
**Impact:** During long ride sessions with repeated searches, caches accumulate stale entries consuming memory.
**Fix:** Add a periodic cleanup (e.g., every 5 minutes) that sweeps expired entries from both caches.

### H4. PulsingUserMarker Uses `tracksViewChanges={true}` on iOS
**File:** `src/components/map/PulsingUserMarker.js` ~line 87
**Problem:** On iOS, `tracksViewChanges={true}` is set to enable the pulsing animation. This triggers a bitmap re-render on every animation frame.
**Impact:** Continuous GPU/CPU usage while the map is visible. Battery drain on older iPhones. (MEMORY.md says "no pulsing animation" but code has one on iOS.)
**Fix:** Either remove the pulsing animation on iOS (use static image like Android), or switch to a native animation approach that doesn't require `tracksViewChanges`.

### H5. Multiple Stub Features Shipped as Tappable Buttons
**Files:** SettingsScreen, AboutScreen, SupportScreen, PaymentSettingsScreen, SupportHistoryScreen
**Problem:** At least 12 buttons are tappable but have empty `onPress: () => {}` handlers:
- Settings: Privacy Policy, Terms of Service, Delete Account
- About: Terms, Privacy, Licenses, Rate App
- Support: Live Chat
- Payment: Add Card, Payment History
- SupportHistory: All ticket data is hardcoded mock
**Impact:** Riders tap these buttons expecting functionality. Nothing happens. This erodes trust and feels broken.
**Fix:** Either implement the features, navigate to web views, or disable the buttons with a "Coming Soon" indicator.

### H6. SettingsScreen Toggles Have No Effect
**File:** `src/screens/SettingsScreen.js`
**Problem:** Settings like `showETA`, `showLiveTracking`, `saveRideHistory` are stored in AsyncStorage but never read by any other component. The dark mode toggle persists a boolean but no dark theme exists.
**Impact:** Riders toggle settings expecting behavior changes. Nothing changes. Misleading UI.
**Fix:** Either wire the settings to actual app behavior or remove the non-functional toggles.

### H7. NotificationSettingsScreen Doesn't Manage Actual Notifications
**File:** `src/screens/NotificationSettingsScreen.js`
**Problem:** All toggles are local AsyncStorage booleans. They don't call OS push notification APIs or communicate preferences to the server.
**Impact:** Toggling "Ride Updates" off does nothing to actual push notifications. Riders who disable notifications still receive them.
**Fix:** Wire toggles to actual notification channel management (Android) and server-side preferences.

### H8. No Extra Confirmation Before Cancelling After Driver Arrival
**File:** `src/components/taxi/RideStatusSheet.js`
**Problem:** Cancel button is shown during `driver_arrived` status with no extra confirmation step.
**Impact:** Accidental cancellation after driver has arrived — wastes driver's time, may incur cancellation fees.
**Fix:** Add a confirmation dialog specifically when cancelling after driver arrival, showing potential cancellation fee.

---

## MEDIUM Priority Issues

### M1. Hardcoded Colors Bypass Theme System
**Files:** HomeScreen (`#5b21b6`), RideDetailScreen (`#FFA500`, `#f97316`), TaxiHistoryScreen (`#f97316`, `#FFA500`), ConnectionStatusBar (`#dc2626`, `#16a34a`), ErrorBoundary (`#7c3aed`), SplashScreen (`#000000`), LoginScreen (`#DB4437`), WelcomeScreen (`#DB4437`), all map marker components
**Impact:** Theme changes require hunting through 20+ files. Dark mode implementation becomes extremely difficult.
**Fix:** Use `colors.*` from the theme system consistently. Define semantic color tokens for status indicators, ratings, and brand colors.

### M2. Typography System Not Used in Key Components
**Files:** RouteSummary (all hardcoded sizes), PaymentMethodSelector (`fontSize: 14`), ConnectionStatusBar (`fontSize: 13`), ErrorBoundary (`fontSize: 22`), RideStatusSheet (`fontSize: 36`), multiple screens with `typography.display.fontSize * 1.3` manual scaling
**Impact:** Georgian text is sized incorrectly in these components. Font sizes don't adapt to language.
**Fix:** Use `useTypography()` hook everywhere. Replace manual `fontSize * multiplier` patterns with named typography tokens.

### M3. OtpVerificationScreen Potential Stale State
**File:** `src/screens/OtpVerificationScreen.js` ~line 59, 64
**Problem:** `handleOtpChange` calls `handleVerify(cleaned)` passing the code directly. But `handleVerify()` called from the button (line 174) uses `otpValue` state, which may be stale due to React batching.
**Impact:** Tapping "Verify" button immediately after typing the last digit could send a stale (incomplete) OTP code.
**Fix:** Always use a ref for the current OTP value, or pass it explicitly in all call sites.

### M4. LocationSearchSheet Has Hardcoded "Recent Places"
**File:** `src/components/taxi/LocationSearchSheet.js` ~lines 214-217
**Problem:** "Tsereteli Street, Kutaisi" and "Kutaisi Central Park" are hardcoded constants, not actual user history.
**Impact:** Every rider sees the same fake "recent places" regardless of their actual history. Misleading.
**Fix:** Load recent places from persisted user history or remove the section until real data is available.

### M5. FAQDetailScreen Feedback Opacity Is Inverted
**File:** `src/screens/FAQDetailScreen.js` ~lines 52, 60
**Problem:** When `feedback === 'yes'`, the YES button gets `opacity: 0.5` (dimmed). The selected button should be highlighted, not dimmed.
**Impact:** Confusing visual feedback — the selected option looks disabled.
**Fix:** Invert the opacity logic: selected = `1.0`, unselected = `0.5`.

### M6. DraggableBottomSheet snapPoints Dependency Causes Re-fires
**File:** `src/components/taxi/DraggableBottomSheet.js` ~line 55
**Problem:** `useEffect` depends on `[snapPoints]` which is an array prop — it's a new reference on every parent render, causing the effect to fire every render.
**Impact:** Snap animation recalculates unnecessarily on every TaxiScreen state change.
**Fix:** Serialize `snapPoints` for comparison (e.g., `JSON.stringify(snapPoints)`) or use a ref.

### M7. SupportScreen `Linking.openURL` Not Wrapped in Try-Catch
**File:** `src/screens/SupportScreen.js` ~lines 56, 70
**Problem:** `Linking.openURL` calls can throw if the URL scheme is unsupported.
**Impact:** App crash on devices without email client or phone dialer configured.
**Fix:** Wrap in try-catch with a user-friendly fallback message.

### M8. PermissionsScreen Race on `completeOnboarding`
**File:** `src/screens/PermissionsScreen.js` ~line 49
**Problem:** `completeOnboarding` is missing from the `useEffect` dependency array. Also, if `completeOnboarding` triggers navigation before the `finally` block runs, `setCheckingPermissions(false)` fires on an unmounted component.
**Impact:** React warning; potential infinite loading spinner if `completeOnboarding` is slow.
**Fix:** Add to dependency array; guard setState with mounted check.

### M9. Currency Hardcoded as `₾` Inline
**Files:** TaxiHistoryScreen, RideStatusSheet, RideDetailScreen
**Problem:** Currency symbol `₾` is hardcoded inline rather than using locale-aware formatting.
**Impact:** If the app expands beyond Georgia, currency display is wrong everywhere.
**Fix:** Use a locale-aware currency formatter or a shared constant.

### M10. Two Separate AppState Listeners in TaxiScreen
**File:** `src/screens/TaxiScreen.js` ~lines 274, 332
**Problem:** Two independent `AppState.addEventListener` effects that could be consolidated.
**Impact:** Unnecessary listener registrations; harder to reason about app state transitions.
**Fix:** Merge into a single `AppState` listener effect.

### M11. No Network/Offline Status Indicator for Rider
**Problem:** ConnectionStatusBar shows socket status but not network connectivity. No indication when API requests are failing.
**Impact:** Rider doesn't know why the app isn't responding during network issues.
**Fix:** Show network status in ConnectionStatusBar. Show queued/pending request indicator.

### M12. PhoneAuthScreen Hardcoded Georgian Phone Format
**File:** `src/screens/PhoneAuthScreen.js` ~line 116
**Problem:** Placeholder `"5XX XXX XXX"` is Georgian-specific and not internationalized.
**Impact:** Non-Georgian users see a confusing phone format.
**Fix:** Use i18n for the placeholder text.

---

## LOW Priority Issues

### L1. Static Arrays Recreated on Every Render
**Files:** HomeScreen (`quickActions`, `services`), SettingsScreen (`settingsSections`), DrawerContent (`menuSections`), TaxiHistoryScreen (filter helpers)
**Fix:** Wrap in `useMemo` with `[t]` dependency.

### L2. Multiple Components Missing `React.memo`
**Files:** RouteSummary, PaymentMethodSelector, VehicleTypeSelector, RideStatusSheet
**Fix:** Wrap in `React.memo` with appropriate comparators.

### L3. SplashScreen Fixed 2.5s Duration
**Problem:** Doesn't wait for actual app initialization (auth check, etc.).
**Fix:** Tie splash dismissal to provider ready state.

### L4. FlatList `renderItem` Not Memoized
**Files:** TaxiHistoryScreen, LanguageSelectScreen, SupportHistoryScreen
**Fix:** Wrap render functions in `useCallback`.

### L5. Missing Accessibility Throughout
**Problem:** No `accessibilityLabel`, `accessibilityRole`, or `accessibilityHint` on any interactive element. No minimum 44x44 tap target verification. Color-only status indicators.
**Fix:** Add accessibility props to all interactive elements. Verify tap targets.

### L6. MarkerWrapper/AnimatedMarkerWrapper Dead `id` Prop
**Files:** `src/components/map/MarkerWrapper.js`, `src/components/map/AnimatedMarkerWrapper.js`
**Problem:** `id` prop is destructured but never used.
**Fix:** Remove unused `id` destructuring.

### L7. `markerImages.js` Null at Index 0
**File:** `src/components/map/markerImages.js`
**Problem:** `stop[0]` and `stopSmall[0]` are `null`. No guard at usage sites.
**Fix:** Add a guard or use 1-based indexing consistently.

### L8. DriverCluster Recomputes on Every Render
**File:** `src/components/map/DriverCluster.js`
**Problem:** `drivers` array prop is a new reference on every parent render, causing `useMemo` clustering to recompute.
**Fix:** Memoize the `drivers` array in the parent, or use a deep comparison.

### L9. RideReviewModal/CancelRideModal Reset State Before Async Completes
**Files:** `src/components/RideReviewModal.js`, `src/components/CancelRideModal.js`
**Problem:** State (rating, text, reason) is reset before `onSubmit`/`onConfirm` async callback resolves.
**Impact:** If submission fails, user's input is lost.
**Fix:** Reset state only after successful completion.

### L10. Dead Code: FLAGS Constant in LanguageSelectScreen
**File:** `src/screens/LanguageSelectScreen.js` ~line 17-20
**Problem:** `FLAGS` object defined but never used.
**Fix:** Remove dead code.

### L11. Inconsistent Indentation Across 13+ Screens
**Files:** PhoneAuthScreen, SettingsScreen, NotificationSettingsScreen, LanguageSelectScreen, PermissionsScreen, SupportScreen, SupportHistoryScreen, FAQDetailScreen, AboutScreen, PaymentSettingsScreen, UpdatePhoneScreen, WelcomeScreen, SignupScreen
**Fix:** Run a formatter (Prettier) with consistent settings.

### L12. PaymentMethodModal Shows Apple Pay on Android
**File:** `src/components/taxi/PaymentMethodModal.js`
**Problem:** No platform check — Apple Pay is shown on Android, Google Pay shown on iOS.
**Fix:** Filter payment methods by `Platform.OS`.

### L13. SignupScreen Terms/Privacy Links Not Tappable
**File:** `src/screens/SignupScreen.js` ~lines 195-198
**Problem:** Styled as links but are plain `Text` components, not `TouchableOpacity`.
**Fix:** Make them tappable or remove link styling.

---

## Priority Implementation Order

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1: Critical Fixes** | C1-C6 | 1-2 days | Prevents auth loss, fare display bugs, socket failures, iOS rotation |
| **Phase 2: UX Integrity** | H1-H8 | 3-5 days | Eliminates stub features, silent failures, god component decomposition |
| **Phase 3: Polish & Feedback** | M1-M12 | 3-4 days | Theme compliance, proper error handling, accessibility groundwork |
| **Phase 4: Optimization** | L1-L13 | 2-3 days | Memoization, dead code cleanup, formatting consistency |

---

## Best Practices for Rider Apps

1. **Auth resilience**: Never delete tokens on network errors — only on explicit 401. Implement silent token refresh. Show "session expired" only when truly expired.
2. **Booking state persistence**: Already implemented via `rideStorage.js` — good. Ensure all booking steps are restored on app restart, including stops and payment method.
3. **Fare transparency**: Always show price breakdown (base fare, distance, time, surge, waiting fee). Use template literals correctly. Show "price may vary" for estimates.
4. **Offline-first booking**: Queue ride requests when offline. Show clear "no connection" indicator. Auto-retry when connectivity returns.
5. **Map performance**: Image-based markers with `tracksViewChanges={false}` (already done). Pre-decode polylines. Memoize clustering. Limit re-renders to significant location changes.
6. **OTP flow**: Auto-submit on full code entry. Clear error on re-type. Show countdown for resend. Handle paste from SMS. Verify via ref, not state.
7. **Error transparency**: Show toast for every failed action with retry option. Never fail silently. Distinguish network errors from server errors in user-facing messages.
8. **Theme consistency**: All colors and typography should flow through the theme system. This enables dark mode, accessibility scaling, and brand consistency.
9. **Feature gating**: Never ship tappable buttons with no implementation. Use "Coming Soon" labels or hide unfinished features entirely.
10. **Connection management**: Show clear connected/disconnected/reconnecting states. Refresh socket auth token on reconnect. Emit fresh location after connectivity recovery (already done).

---

*This audit reflects the codebase as of 2026-03-04. Issues ranked by real-world impact on riders using the app in daily conditions.*
