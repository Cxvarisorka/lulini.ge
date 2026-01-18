# Fix Location Issues on iOS - Driver App

## Update: Simplified for Expo Go

**Background location tracking has been removed** to allow the app to work with Expo Go immediately. The app now only uses foreground location tracking, which is sufficient for testing and works without a custom build.

### What Changed:
- ✅ Removed background location permissions
- ✅ App now works with standard Expo Go
- ✅ Location tracking works while app is open
- ⚠️ Location tracking stops when app goes to background (this is normal for Expo Go)

### What This Means:
- You can test the app immediately without building
- Drivers stay online as long as the app is in the foreground
- For production with background tracking, you'll need a development build later

## Quick Test Now (Expo Go)

Just restart your Expo development server and reload the app:

```bash
# In mobile-driver directory
npm start
```

Then:
1. Scan the QR code with Expo Go on your iPhone
2. Login to the driver app
3. Try to go online
4. Grant location permission when prompted
5. You should now be able to go online!

**Note**: Keep the app in the foreground while online. If you switch to another app, location tracking will pause.

---

## For Production: Build a Development Build for iOS (Later)

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
```

### Step 2: Login to Expo
```bash
cd mobile-driver
eas login
```

### Step 3: Update Project ID (if needed)
Get your Expo project ID:
```bash
eas project:info
```

If you don't have a project yet, create one:
```bash
eas init
```

The command will automatically update your `app.config.js` with the correct project ID.

### Step 4: Build Development Build for iOS

For iOS Simulator (faster, for testing):
```bash
eas build --profile development --platform ios --local
```

For Physical iPhone Device:
```bash
eas build --profile development --platform ios
```

This will:
1. Compile the native code with location permissions
2. Generate an IPA file you can install on your iPhone
3. Include all the necessary Info.plist entries

### Step 5: Install the Development Build

**For Physical Device:**
1. EAS will generate a download link
2. Open it on your iPhone
3. Install the development build

**For Simulator:**
1. EAS will generate an `.app` file
2. Drag it to your iOS Simulator

### Step 6: Start Development Server
```bash
npm start
```

Then press `i` to open in iOS, or scan the QR code with your development build app.

## Alternative: Use prebuild (if you prefer local development)

### Step 1: Generate Native Projects
```bash
cd mobile-driver
npx expo prebuild
```

This creates `ios/` and `android/` folders with native code.

### Step 2: Open in Xcode
```bash
open ios/gotours-driver.xcworkspace
```

### Step 3: Run from Xcode
1. Select your device or simulator
2. Press the Play button
3. The app will have all permissions configured

### Step 4: For Future Changes
After any native changes (like permissions), run:
```bash
npx expo prebuild --clean
```

## Why This Fixes the Issue

1. **Expo Go Limitations**: Expo Go can't access certain native features like background location
2. **Development Build**: Includes your custom native configuration
3. **Info.plist**: The location permission strings from `app.config.js` get compiled into the iOS Info.plist

## Testing Location After Build

1. Launch the development build on your iPhone
2. Login to the driver app
3. Try to go online
4. iOS will prompt for location permissions
5. Grant "Allow While Using App" or "Always Allow"
6. Location should work properly now

## Troubleshooting

### If location still doesn't work:
1. Check Settings > Privacy > Location Services (enabled)
2. Check Settings > Privacy > Location Services > GoTours Driver
3. Make sure you're outside or near a window (GPS signal)
4. Check the console logs in Metro bundler for specific errors

### If build fails:
1. Make sure you're logged into EAS: `eas whoami`
2. Check your Apple Developer account is set up
3. For local builds, ensure Xcode is installed

## Quick Command Reference

```bash
# Build for iOS device
eas build --profile development --platform ios

# Build for iOS simulator
eas build --profile development --platform ios --simulator

# Run development server
npm start

# Check Expo account
eas whoami

# View project info
eas project:info
```

## After Building

Your location features will work including:
- ✅ Foreground location access
- ✅ Background location tracking
- ✅ Going online/offline
- ✅ Real-time location updates
- ✅ Tab bar properly positioned for iPhone

The fixes I made to the code will provide:
- Better error messages
- Timeout protection (15 seconds)
- Proper safe area handling for iPhone notch/home indicator
