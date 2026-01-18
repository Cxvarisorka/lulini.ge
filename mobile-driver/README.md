# GoTours Driver App

React Native mobile application for GoTours drivers built with Expo.

## Features

- **Driver Authentication**: Login system for drivers
- **Real-time Ride Requests**: Receive and accept/decline ride requests in real-time
- **Bolt-like Interface**: Clean, modern UI similar to popular ride-sharing apps
- **Online/Offline Toggle**: Control availability with one tap
- **Live Location Tracking**: GPS-based location updates
- **Earnings Dashboard**: Track daily, weekly, and monthly earnings
- **Ride Management**: View active and completed rides
- **Multi-language Support**: English, Georgian, Russian, Spanish
- **Push Notifications**: Get notified of new ride requests
- **Settings**: Customize app preferences

## Tech Stack

- **React Native** with Expo
- **Socket.IO** for real-time communication
- **Expo Location** for GPS tracking
- **Expo Notifications** for push notifications
- **React Navigation** for navigation
- **Axios** for API requests
- **i18next** for internationalization

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

## Installation

1. Navigate to the driver app directory:
```bash
cd mobile-driver
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```
EXPO_PUBLIC_API_URL=http://your-api-url:5000/api
EXPO_PUBLIC_SOCKET_URL=http://your-api-url:5000
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Running the App

### Development

```bash
# Start Expo development server
npm start

# Run on iOS Simulator
npm run ios

# Run on Android Emulator
npm run android

# Run on web (for testing)
npm run web
```

### Using Expo Go

1. Install Expo Go on your iOS or Android device
2. Scan the QR code from the terminal
3. The app will load on your device

## Building for Production

### iOS

```bash
expo build:ios
```

### Android

```bash
expo build:android
```

## Project Structure

```
mobile-driver/
├── src/
│   ├── components/         # Reusable components
│   ├── context/           # React Context providers
│   │   ├── AuthContext.js
│   │   ├── DriverContext.js
│   │   ├── LocationContext.js
│   │   ├── SocketContext.js
│   │   └── LanguageContext.js
│   ├── i18n/              # Internationalization
│   │   ├── locales/
│   │   └── index.js
│   ├── navigation/        # Navigation configuration
│   │   └── AppNavigator.js
│   ├── screens/           # App screens
│   │   ├── LoginScreen.js
│   │   ├── HomeScreen.js
│   │   ├── RidesScreen.js
│   │   ├── RideDetailScreen.js
│   │   ├── EarningsScreen.js
│   │   ├── ProfileScreen.js
│   │   └── SettingsScreen.js
│   ├── services/          # API services
│   │   └── api.js
│   └── theme/             # Theme configuration
│       └── colors.js
├── assets/                # Images, fonts, etc.
├── App.js                 # Entry point
├── app.config.js          # Expo configuration
└── package.json

```

## Key Features Explained

### Real-time Communication
- Uses Socket.IO to receive ride requests instantly
- Maintains persistent connection when driver is online
- Automatic reconnection on network issues

### Location Tracking
- Background location permission required
- Updates driver location every 10 seconds while online
- Sends location to server for driver-rider matching

### Notifications
- Local notifications for new ride requests
- Sound and vibration alerts
- Persistent notifications until driver responds

### State Management
- Context API for global state
- Separate contexts for auth, driver status, location, and socket
- Optimized re-renders with proper context splitting

## API Integration

The app communicates with the backend API:

- `POST /api/auth/login` - Driver login
- `GET /api/drivers/profile` - Get driver profile
- `PATCH /api/drivers/status` - Update online/offline status
- `PATCH /api/drivers/location` - Update location
- `GET /api/drivers/stats` - Get driver statistics
- `POST /api/rides/:id/accept` - Accept ride request
- `POST /api/rides/:id/decline` - Decline ride request
- `POST /api/rides/:id/complete` - Complete ride

## Socket Events

### Listening to:
- `ride:request` - New ride request
- `ride:updated` - Ride status updated
- `ride:cancelled` - Ride cancelled by passenger

### Emitting:
- `driver:online` - Driver went online
- `driver:offline` - Driver went offline
- `driver:location` - Location update

## Permissions Required

### iOS
- Location When In Use
- Location Always (for background tracking)
- Notifications

### Android
- ACCESS_FINE_LOCATION
- ACCESS_COARSE_LOCATION
- FOREGROUND_SERVICE
- POST_NOTIFICATIONS

## Troubleshooting

### Location not working
- Ensure location permissions are granted
- Check that device location services are enabled
- Verify API URL is correctly configured

### Socket connection issues
- Verify EXPO_PUBLIC_SOCKET_URL is correct
- Check network connectivity
- Ensure backend server is running

### Build errors
- Clear Expo cache: `expo start -c`
- Delete node_modules and reinstall
- Update Expo SDK: `expo upgrade`

## License

Proprietary - GoTours
