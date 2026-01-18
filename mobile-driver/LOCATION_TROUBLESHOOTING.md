# Location Troubleshooting Guide for Driver App

## Issues Fixed

### 1. Added iOS Location Permission Descriptions
- Added `NSLocationWhenInUseUsageDescription`
- Added `NSLocationAlwaysAndWhenInUseUsageDescription`
- Added `NSLocationAlwaysUsageDescription`
- Configured expo-location plugin with proper permissions

### 2. Enhanced Error Logging
- Added console logs throughout location flow
- Added user-friendly error alerts
- Added check for location services being enabled

## Steps to Fix Location Issues

### Step 1: Rebuild the App
After the configuration changes, you MUST rebuild the app:

```bash
cd mobile-driver

# For Android
npx expo run:android

# For iOS
npx expo run:ios
```

**Important:** `expo start` alone will NOT apply the permission changes. You must rebuild!

### Step 2: Clear App Data (Android)
If rebuilding doesn't work:
1. Go to Settings > Apps > GoTours Driver
2. Tap "Storage"
3. Tap "Clear Data" and "Clear Cache"
4. Reinstall the app

### Step 3: Reset Location Permissions (iOS)
1. Go to Settings > Privacy & Security > Location Services
2. Find "GoTours Driver"
3. Delete the app
4. Reinstall and grant permissions when prompted

### Step 4: Check Device Location Settings

#### Android:
1. Settings > Location > Turn ON
2. Settings > Apps > GoTours Driver > Permissions > Location > "Allow all the time"

#### iOS:
1. Settings > Privacy & Security > Location Services > ON
2. Settings > Privacy & Security > Location Services > GoTours Driver > "Always"

### Step 5: Verify API Connection
Check that the API URL in `.env` matches your server:

```bash
# Should match your server's actual port (usually 3000)
EXPO_PUBLIC_API_URL=http://192.168.100.3:3000/api
```

### Step 6: Test Location Step by Step

1. **Check Console Logs:**
   - Open React Native Debugger or Metro bundler
   - Look for these logs:
     - "Requesting location permissions..."
     - "Foreground permission status: granted"
     - "Location services enabled: true"
     - "Getting current position..."
     - "Current position: {...}"

2. **Check Permission Status:**
   - The app will show alerts if permissions are denied
   - If you see "Location Permission Required", go to device settings

3. **Check Location Services:**
   - If you see "Location Services Disabled", enable them in device settings

4. **Check Network Connection:**
   - Ensure device and server are on the same network
   - Test API URL in browser: `http://192.168.100.3:3000/api/auth/me`

## Common Issues

### Issue 1: Location Permission Denied
**Solution:** Uninstall the app, reinstall, and grant permissions when prompted.

### Issue 2: Location Services Disabled
**Solution:** Enable location services in device settings.

### Issue 3: Location Stuck on Default (41.7151, 44.8271)
**Solution:** This is Tbilisi, Georgia - the fallback location. Means location isn't being retrieved.
- Check console for errors
- Verify permissions are granted
- Rebuild the app

### Issue 4: Location Not Updating on Server
**Solution:**
- Check network connectivity
- Verify API URL in `.env`
- Check server logs for errors
- Ensure `/api/drivers/location` endpoint exists

### Issue 5: Background Location Not Working
**Solution:**
- Android: Grant "Allow all the time" permission
- iOS: Select "Always" in location permissions
- Ensure location tracking started: `startTracking()` was called

## Testing Checklist

- [ ] App rebuilt after config changes
- [ ] Location permission granted in device settings
- [ ] Location services enabled
- [ ] Console shows location coordinates
- [ ] Map shows your actual location (not Tbilisi)
- [ ] Location updates when you move
- [ ] API receives location updates (check server logs)

## Debug Commands

```bash
# Check Metro bundler logs
cd mobile-driver
npm start

# Check server logs for location updates
cd ../server
npm run dev

# Android: View device logs
adb logcat | grep -i location

# iOS: View device logs
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "GoTours"'
```

## Still Not Working?

If location still doesn't work after following all steps:

1. **Check Console Logs:** Look for specific error messages
2. **Test on Real Device:** Emulators sometimes have location issues
3. **Verify Server Endpoint:** Make sure `/api/drivers/location` exists and accepts PATCH requests
4. **Check Network:** Ensure device and server can communicate
5. **Try Different Location Accuracy:** Change `Location.Accuracy.Balanced` to `Location.Accuracy.High`

## Contact

If you continue to have issues, provide:
- Device type (Android/iOS)
- Console error logs
- Permission status screenshots
- Whether using emulator or real device
