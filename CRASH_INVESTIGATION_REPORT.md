# iOS Crash Investigation Report: Taxi Request Submit Flow

**App:** Lulini Passenger (React Native / Expo)
**Platform:** iOS (react-native-maps, Google Maps provider)
**Date:** 2026-03-16
**State:** 671 lines of uncommitted changes in TaxiScreen alone

---

## A. Last Known Working State

**Commit `60c24d1`** (Mar 11, 2026) — *"Fix passenger app GPS timeout, state resets, and memoize sheet content"*

This is the last commit touching `mobile/src/screens/TaxiScreen.js`. At this point:
- Payment used `preChargeRide` endpoint (`/payments/ride/pre-charge`)
- Map calls were direct (`mapRef.current.fitToCoordinates()`, `mapRef.current.animateToRegion()`)
- No `mapSafety.js` or `polylineSimplify.js` utilities
- `destinationCoords` was conditionally set to `null` during `accepted`/`driver_arrived` steps
- Cookie parsing in `mobile/src/services/api.js` assumed `set-cookie` was always an array

**Prior commit `83be83a`** (Mar 10) introduced the current payment preauth architecture with `preChargeRide`.

---

## B. First Suspicious Broken Change

**The current uncommitted working copy** — 671 lines of diff against `60c24d1`. Key changes:

| Change | File | Impact |
|--------|------|--------|
| `preChargeRide` → `chargeRide` (different endpoint path) | `mobile/src/components/taxi/PaymentMethodModal.js:157` | **BREAKING** if server not redeployed |
| New `payRide` endpoint for Apple/Google Pay | `mobile/src/components/taxi/PaymentMethodModal.js:71` | **BREAKING** if route not registered |
| `PulsingUserMarker` import removed | `mobile/src/screens/TaxiScreen.js:41` | Safe (no JSX usage) |
| New `mapSafety.js` + `polylineSimplify.js` imports | `mobile/src/screens/TaxiScreen.js:50-51` | New untracked files |
| `destinationCoords` always set (was conditional) | `mobile/src/screens/TaxiScreen.js:493` | Changed render behavior |
| Direct map calls → safety wrappers | Throughout TaxiScreen | Changed native bridge calls |

---

## C. Diff Summary Between Working and Broken Versions

### C1. Payment API Rename (CRITICAL)

**Before** (`mobile/src/services/api.js` committed):
```javascript
preChargeRide: (cardId, amount, lang) =>
    api.post('/payments/ride/pre-charge', { cardId, amount, lang }),
```

**After** (uncommitted):
```javascript
chargeRide: (cardId, amount, rideId, lang) =>
    api.post('/payments/ride/charge', { cardId, amount, rideId, lang }),

payRide: (amount, rideId, paymentMethods, lang) =>
    api.post('/payments/ride/pay', { amount, rideId, paymentMethods, lang }),
```

The endpoint path changed from `/payments/ride/pre-charge` to `/payments/ride/charge`, and a new `payRide` endpoint was added. The server diffs add corresponding routes, but **if the server is deployed from the committed code**, the client calls non-existent endpoints.

### C2. PaymentMethodModal — async mobile pay (NEW)

**Before:** `handleMobilePaySelect` was synchronous — just called `onSelect(method)` and closed.

**After** (`mobile/src/components/taxi/PaymentMethodModal.js:48-103`): Now async — calls `paymentAPI.payRide()`, opens WebBrowser, verifies payment, then calls `onSelect(method, null, confirmedPaymentId)`.

### C3. Unsafe Response Access at Line 1909

```javascript
// Line 1908-1909 — NO optional chaining on .data.ride
if (response.data.success) {
    const ride = response.data.data.ride;  // TypeError if .data is undefined
```

This existed before and remains. If the server's idempotency cache or any edge case returns `{ success: true }` without the nested `data.ride`, this throws.

### C4. Map Safety Wrapper Introduction

All direct `mapRef.current.fitToCoordinates()` and `mapRef.current.animateToRegion()` calls were replaced with `safeFitToCoordinates()` and `safeAnimateToRegion()` from the new `mobile/src/utils/mapSafety.js`. These are defensive but add a new dependency on untracked files.

---

## D. Likely Crash Causes (Ranked)

### #1 — Server/Client API Mismatch (Confidence: 95%)

**File:** `mobile/src/components/taxi/PaymentMethodModal.js:157`, `mobile/src/services/api.js:188`

**What:** Client calls `chargeRide()` → POST `/payments/ride/charge`. But the committed server code has this endpoint at `/payments/ride/charge` since commit `8dbdfbb`. **However**, the new `payRide` endpoint (POST `/payments/ride/pay`) only exists in the uncommitted server diff. If the server isn't redeployed with the uncommitted changes, Apple Pay/Google Pay users hit a **404**.

**Crash path:**
1. User selects Apple Pay → `handleMobilePaySelect()` → calls `paymentAPI.payRide()`
2. Server returns 404 (route doesn't exist)
3. Error is caught, shows alert — **no crash for card payments**
4. BUT: if user selected cash, they skip PaymentMethodModal entirely → `submitRideRequest('cash')` → this path is **unaffected** by payment changes

**Verdict:** This causes card/Apple Pay payment failure, not necessarily a crash. Downgraded if the user means cash payments crash too.

---

### #2 — Unsafe `response.data.data.ride` Access (Confidence: 85%)

**File:** `mobile/src/screens/TaxiScreen.js:1908-1909`

```javascript
if (response.data.success) {
    const ride = response.data.data.ride;  // CRASH: TypeError if .data is undefined
    setCurrentRide(ride);                   // sets undefined
    setCachedRide(ride);                    // sets undefined
    // ...
    persistRideState({
        rideId: ride._id,                   // CRASH: Cannot read '_id' of undefined
```

**When this happens:** If the server returns `{ success: true, data: null }` or `{ success: true, message: "..." }` without the `data.ride` wrapper. This can occur when:
- The idempotency cache returns a re-serialized response with a different shape
- A race condition where the ride was already cancelled between creation and response
- Server validation passes but `.populate()` on the Ride model fails

**Why it crashes instead of being caught:** It IS inside a try-catch, so it shows a generic error alert rather than crashing the app. **However**, if `ride` is `undefined` and `setCurrentRide(undefined)` triggers a re-render where downstream components access `currentRide.status` or `currentRide._id` without null checks, the crash happens in the **render cycle**, which can escape the try-catch.

---

### #3 — State Update During Unmounted Component (Confidence: 70%)

**File:** `mobile/src/screens/TaxiScreen.js:2422-2430`

```javascript
onSelect={(method, cardId, paymentId) => {
    setShowPaymentMethodModal(false);    // triggers re-render
    if (paymentModalMode === 'select') {
        // ...
    } else {
        setSelectedCardId(cardId || null);      // another state update
        setConfirmedPaymentId(paymentId || null); // another state update
        submitRideRequest(method, paymentId);     // ASYNC — runs after re-render
    }
}}
```

**What:** Three synchronous state updates (`setShowPaymentMethodModal(false)`, `setSelectedCardId`, `setConfirmedPaymentId`) fire before `submitRideRequest` starts. React batches these, but the async `submitRideRequest` starts executing in the current closure where `location`, `destinationCoords`, `estimatedPrice`, etc. may have been captured from a stale render.

**Critical:** If the modal close + state updates cause TaxiScreen to re-render and the component's internal state resets (e.g., `destinationCoords` becomes null due to a `useEffect` cleanup), then `submitRideRequest` accesses stale closure values.

---

### #4 — `location` null in getNearbyDrivers (Confidence: 60%)

**File:** `mobile/src/screens/TaxiScreen.js:1957-1962`

```javascript
const driversRes = await taxiAPI.getNearbyDrivers(
    location.latitude,   // TypeError if location is null
    location.longitude,
    selectedVehicle
);
```

**When:** After returning from the BOG payment WebBrowser session, the app re-activates. If the GPS provider hasn't re-established a fix, `location` from the context could be `null`. The `location` check at line 1947 only guards `safeAnimateToRegion`, NOT `getNearbyDrivers`.

**Mitigating:** Wrapped in try-catch (lines 1957/1966), so this causes a caught error, not a crash. But if `location` is null, the catch fires silently and no drivers are shown.

---

### #5 — Native Map Crash from Zero-Area MKMapRect (Confidence: 50%)

**File:** `mobile/src/screens/TaxiScreen.js:531-568` (`fitMapToRide`)

**Before (committed):**
```javascript
if (coords.length >= 2) {
    mapRef.current.fitToCoordinates(coords, { ... });
}
```

**After (uncommitted):**
```javascript
safeFitToCoordinates(mapRef, coords, { ... });
```

The new `safeFitToCoordinates` handles single-point and identical-point cases that the old code didn't. **But** the old code had a `coords.length >= 2` guard that's now removed — the safety utility handles this, but if the utility file (`mapSafety.js`) has a bug or the import fails, this removes the guard entirely.

**iOS-specific:** `MKMapView.fitToCoordinates` with a single coordinate or two identical coordinates creates a zero-area `MKMapRect`, which causes `NSInvalidArgumentException` on some iOS versions. This is the classic iOS crash after ride submission — the map tries to fit to coordinates before the driver's location is known.

---

### #6 — `polylineSimplify` Stack Overflow on Degenerate Input (Confidence: 30%)

**File:** `mobile/src/utils/polylineSimplify.js:26-44`

The Douglas-Peucker algorithm uses recursion. With a highly detailed polyline (1000+ points) and a very small tolerance, the recursion depth could exceed the JS engine's stack limit on iOS JavaScriptCore (which has a smaller stack than V8).

**When:** Not during submit itself, but if the post-submit map display triggers an OSRM route fetch that returns a massive polyline.

---

## E. Exact Fix Recommendations

### Fix #1: Safe response access (CRITICAL)

**File:** `mobile/src/screens/TaxiScreen.js:1908-1909`

```javascript
// BEFORE (unsafe):
if (response.data.success) {
    const ride = response.data.data.ride;

// AFTER (safe):
const ride = response.data?.data?.ride;
if (response.data.success && ride?._id) {
```

### Fix #2: Guard `getNearbyDrivers` against null location

**File:** `mobile/src/screens/TaxiScreen.js:1956-1968`

```javascript
// BEFORE:
try {
    const driversRes = await taxiAPI.getNearbyDrivers(
        location.latitude,
        location.longitude,
        selectedVehicle
    );

// AFTER:
try {
    if (!location?.latitude || !location?.longitude) throw new Error('No location');
    const driversRes = await taxiAPI.getNearbyDrivers(
        location.latitude,
        location.longitude,
        selectedVehicle
    );
```

### Fix #3: Verify server endpoints are deployed before client update

Ensure the server is redeployed with the uncommitted payment controller changes **before** shipping the mobile app update. The new endpoints are:
- `POST /api/payments/ride/pay` (new)
- `POST /api/payments/ride/charge` (already exists, parameter change only)
- `GET /api/payments/history` (new)

---

## F. Safer Code Example

Here's the hardened `submitRideRequest` success handler:

```javascript
if (response.data?.success) {
    const ride = response.data?.data?.ride;

    if (!ride?._id) {
        console.error('[TaxiScreen] Server returned success but no ride object:',
            JSON.stringify(response.data));
        Alert.alert(t('errors.somethingWentWrong'), t('errors.tryAgain'));
        return;
    }

    setCurrentRide(ride);
    setCachedRide(ride);

    const now = Date.now();
    searchStartedAtRef.current = now;
    _searchStartedAt = now;

    setBookingStep(BOOKING_STEPS.SEARCHING);

    persistRideState({
        rideId: ride._id,
        status: ride.status,
        bookingStep: BOOKING_STEPS.SEARCHING,
        pickup: rideData.pickup,
        dropoff: rideData.dropoff,
        vehicleType: selectedVehicle,
        paymentMethod: selectedPaymentMethod,
        estimatedPrice: price.toFixed(2),
        estimatedDuration: duration,
        driverLocation: null,
        driverName: null,
        totalDistance: totalDistance || routeDistanceRef.current,
    });

    savedDestinationRef.current = destination;
    savedDestinationCoordsRef.current = destinationCoords;
    persistLastDestination(destination, destinationCoords);
    setRoutePolyline(null);

    if (location?.latitude && location?.longitude) {
        safeAnimateToRegion(mapRef, {
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
        }, 300);

        try {
            const driversRes = await taxiAPI.getNearbyDrivers(
                location.latitude,
                location.longitude,
                selectedVehicle
            );
            const drivers = driversRes.data?.data?.drivers || [];
            _nearbyDriversCache = drivers;
            setNearbyDrivers(drivers);
        } catch (err) {
            if (__DEV__) console.warn('[TaxiScreen] Failed to fetch nearby drivers:', err.message);
        }
    }
}
```

---

## G. Test Plan

### Crash Reproduction Steps
1. Open passenger app with uncommitted code
2. Ensure server is running (check if both committed and uncommitted endpoints exist)
3. Set pickup and destination
4. Select **card payment** → complete BOG flow → observe crash after modal closes
5. Alternatively, select **cash payment** → tap "Request Ride" → observe crash
6. Check Xcode console for `NSInvalidArgumentException` or JS red screen error

### Regression Test Checklist

- [ ] **Cash submit** — tap Request Ride with cash selected → ride created, transitions to SEARCHING
- [ ] **Card submit** — select card → complete BOG charge → verify `submitRideRequest` fires with valid paymentId
- [ ] **Apple Pay submit** — select Apple Pay → complete BOG pay → verify `/payments/ride/pay` endpoint exists on server
- [ ] **Duplicate submit** — tap Request Ride twice rapidly → only one ride created (idempotency)
- [ ] **No GPS** — submit when location is null → alert shown, no crash
- [ ] **Server 500** — simulate server error → error alert shown, `isRequesting` reset to false
- [ ] **Server 409** — submit when user has active ride → conflict alert shown
- [ ] **Map fit after submit** — verify no `NSInvalidArgumentException` when map fits to single coordinate
- [ ] **Payment verification failure** — BOG returns `status: 'rejected'` → alert shown, no ride created
- [ ] **Payment verification undefined** — mock `verifyRidePayment` returning `{ data: {} }` → graceful fallback
- [ ] **App backgrounded during payment** — complete BOG in Safari, return to app → location still available
- [ ] **Offline submit** — airplane mode → ERR_OFFLINE alert, button re-enabled

### Logging Points to Add

```javascript
// Before API call
console.log('[TaxiScreen] submitRideRequest:', {
    paymentMethod: selectedPaymentMethod,
    hasPaymentId: !!paymentId,
    hasLocation: !!location,
    pickup: pickupCoords ? 'valid' : 'null',
    destination: destinationCoords ? 'valid' : 'null'
});

// After API response
console.log('[TaxiScreen] ride response shape:', {
    success: response.data?.success,
    hasData: !!response.data?.data,
    hasRide: !!response.data?.data?.ride,
    rideId: response.data?.data?.ride?._id
});

// In PaymentMethodModal after verification
console.log('[PaymentModal] verify result:', {
    status,
    confirmedPaymentId,
    orderId
});
```

---

## Summary Table

| # | Cause | Confidence | Fix Complexity |
|---|-------|-----------|----------------|
| 1 | Server/client API endpoint mismatch (`payRide` not deployed) | 95% | Deploy server first |
| 2 | `response.data.data.ride` unsafe access | 85% | 1-line optional chaining |
| 3 | Stale closure in PaymentMethodModal `onSelect` callback | 70% | Move submit to useCallback |
| 4 | `location` null after WebBrowser return | 60% | Add null guard |
| 5 | Zero-area MKMapRect on single coordinate | 50% | Already mitigated by mapSafety |
| 6 | Polyline stack overflow | 30% | Add iterative fallback |

**Most likely root cause:** If the crash happens specifically with **card/Apple Pay**, it's **#1** (endpoint mismatch). If it happens with **all payment methods** including cash, it's **#2** (unsafe response access) or **#3** (stale closure race condition after modal dismiss).

---

## Commit History Timeline (Submit Flow)

| Date | Commit | Description | Impact on Submit |
|------|--------|-------------|------------------|
| Feb 5 | `087de6c` | Refactor taxi screen into modular components | Created current architecture |
| Mar 3 | `725518b` | Dynamic pricing from server | Added pricing config fetch |
| Mar 6 | `8ed1a24` | BOG payment integration | Added payment controller |
| Mar 6 | `d5f4474` | Passenger app payment integration | Added PaymentMethodModal |
| Mar 10 | `8dbdfbb` | Payment preauth flow | Added chargeRide endpoint |
| Mar 10 | `83be83a` | Passenger app preauth + draggable pickup | Added preChargeRide client call |
| Mar 11 | `ad68fc9` | Atomic ops + emitCritical | Idempotency + reliable socket delivery |
| Mar 11 | `3cc2d5e` | JWT expiry check + socket resilience | Auth guard before network calls |
| Mar 11 | `60c24d1` | GPS timeout + state resets | **Last working commit** |
| Mar 13 | `edb7d4e` | Cookie auth fix | sameSite/domain changes |
| — | uncommitted | mapSafety, polylineSimplify, payment API rename | **671 lines of changes** |
