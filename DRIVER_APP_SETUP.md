# GoTours Driver App - Complete Setup Guide

This guide explains the complete driver app ecosystem including the mobile app, backend integration, and admin panel management.

## Overview

The GoTours driver system consists of three main components:

1. **Mobile Driver App** (`mobile-driver/`) - React Native app for drivers
2. **Backend API** (`server/`) - Node.js/Express backend with driver endpoints
3. **Admin Panel** (`client/`) - Web interface for managing drivers

## Architecture

```
┌─────────────────┐         WebSocket/HTTP        ┌──────────────┐
│  Driver Mobile  │ ◄──────────────────────────► │    Backend   │
│      App        │                                │   Server     │
└─────────────────┘                                └──────┬───────┘
                                                          │
                                                          │ HTTP/WS
                                                          │
                                                   ┌──────▼───────┐
                                                   │ Admin Panel  │
                                                   │  (Website)   │
                                                   └──────────────┘
```

## Backend Setup

### 1. Database Models

Three new models have been added:

#### Driver Model (`server/models/driver.model.js`)
```javascript
{
  user: ObjectId,           // Reference to User
  phone: String,
  licenseNumber: String,
  vehicle: {
    type: String,          // economy, comfort, business, van, minibus
    make: String,
    model: String,
    year: Number,
    licensePlate: String,
    color: String
  },
  status: String,          // online, offline, busy
  location: {
    type: 'Point',
    coordinates: [lng, lat]
  },
  rating: Number,
  totalTrips: Number,
  totalEarnings: Number,
  isActive: Boolean,
  isApproved: Boolean
}
```

#### Ride Model (`server/models/ride.model.js`)
```javascript
{
  user: ObjectId,
  driver: ObjectId,
  pickup: { lat, lng, address },
  dropoff: { lat, lng, address },
  vehicleType: String,
  quote: { distance, duration, price },
  status: String,          // pending, accepted, in_progress, completed, cancelled
  paymentMethod: String,
  fare: Number,
  passengerName: String,
  passengerPhone: String
}
```

### 2. User Model Update

The User model now supports a `driver` role:

```javascript
role: {
  type: String,
  enum: ['user', 'admin', 'driver'],  // Added 'driver'
  default: 'user'
}
```

### 3. API Routes

New routes added to `server/app.js`:

```javascript
app.use('/api/drivers', driverRouter);
```

#### Driver Endpoints:

**Admin Only:**
- `POST /api/drivers` - Create new driver
- `GET /api/drivers` - Get all drivers
- `GET /api/drivers/:id` - Get single driver
- `PATCH /api/drivers/:id` - Update driver
- `DELETE /api/drivers/:id` - Delete driver

**Driver Only:**
- `GET /api/drivers/profile` - Get own profile
- `PATCH /api/drivers/status` - Update online/offline status
- `PATCH /api/drivers/location` - Update GPS location
- `GET /api/drivers/stats` - Get daily statistics
- `GET /api/drivers/earnings` - Get earnings by period

### 4. Socket.IO Events

Real-time events for driver-client matching:

```javascript
// Server emits to driver
socket.emit('ride:request', rideData);      // New ride request
socket.emit('ride:updated', rideData);      // Ride status changed
socket.emit('ride:cancelled', rideData);    // Ride cancelled

// Driver emits to server
socket.emit('driver:online', { status });   // Go online
socket.emit('driver:offline', { status });  // Go offline
socket.emit('driver:location', { lat, lng }); // Location update
```

## Mobile Driver App Setup

### Installation

```bash
cd mobile-driver
npm install
cp .env.example .env
```

### Environment Configuration

Edit `.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.100.3:5000/api
EXPO_PUBLIC_SOCKET_URL=http://192.168.100.3:5000
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
```

### Running the App

```bash
# Start development server
npm start

# Run on specific platform
npm run ios
npm run android
```

### Key Features

1. **Authentication**
   - Drivers login with email/password
   - Only users with role='driver' can access
   - JWT token stored in SecureStore

2. **Home Screen (Bolt-like UI)**
   - Large circular online/offline toggle button
   - Real-time status display
   - Stats cards showing earnings, trips, rating
   - Map showing driver's current location

3. **Real-time Ride Requests**
   - Modal popup when new ride received
   - Shows pickup/dropoff locations
   - Distance and estimated fare
   - Accept/Decline buttons with 30s timeout

4. **Location Tracking**
   - Background location permission
   - Updates server every 10 seconds when online
   - Uses geospatial indexing for nearby drivers

5. **Earnings Dashboard**
   - View earnings by day/week/month
   - Total trips and average per trip
   - Earnings history

## Admin Panel Setup

### Driver Management Page

New admin page at `/admin/drivers` allows:

- **View all drivers** with status indicators (online/offline/busy)
- **Add new drivers** with complete profile
- **Edit driver information** and vehicle details
- **Activate/Deactivate drivers**
- **Delete drivers** and their accounts
- **Real-time status updates** via Socket.IO

### Adding a Driver via Admin Panel

1. Login to admin panel
2. Navigate to "Drivers" in sidebar
3. Click "Add Driver" button
4. Fill in the form:
   - Personal info (name, email, phone)
   - Password (for driver login)
   - License number
   - Vehicle details (type, make, model, year, plate, color)
5. Click "Create Driver"

The system will:
- Create a user account with role='driver'
- Create driver profile linked to user
- Send credentials to driver (implementation pending)
- Driver can now login to mobile app

## Workflow Example

### Driver Onboarding

1. **Admin adds driver** via admin panel
2. **Driver receives** login credentials
3. **Driver downloads** mobile app
4. **Driver logs in** with credentials
5. **Driver goes online** with toggle button

### Ride Request Flow

1. **Client requests** ride via client app/website
2. **Backend finds** nearby online drivers using geospatial query
3. **Socket emits** ride request to selected driver(s)
4. **Driver receives** notification with ride details
5. **Driver accepts** within 30 seconds
6. **Driver status** changes to 'busy'
7. **Driver navigates** to pickup location
8. **Driver starts** ride
9. **Driver completes** ride
10. **Earnings updated** automatically
11. **Driver status** back to 'online'

## Testing

### Test Driver Creation

```bash
# Via API
curl -X POST http://localhost:5000/api/drivers \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_ADMIN_TOKEN" \
  -d '{
    "email": "driver@test.com",
    "password": "test123",
    "firstName": "John",
    "lastName": "Driver",
    "phone": "+995555123456",
    "licenseNumber": "DL123456",
    "vehicle": {
      "type": "economy",
      "make": "Toyota",
      "model": "Prius",
      "year": 2020,
      "licensePlate": "AB123CD",
      "color": "White"
    }
  }'
```

### Test Driver Login (Mobile App)

1. Open mobile app
2. Enter credentials:
   - Email: `driver@test.com`
   - Password: `test123`
3. Should redirect to home screen
4. Toggle to go online
5. Location should start tracking

## Security Considerations

1. **Authentication**
   - JWT tokens with httpOnly cookies
   - Role-based access control
   - Driver-specific routes protected

2. **Location Privacy**
   - Location only tracked when online
   - Stored as geospatial index
   - Not exposed to clients directly

3. **Data Protection**
   - Driver documents encrypted
   - Phone numbers validated
   - Passwords hashed with bcrypt

## Production Deployment

### Mobile App

```bash
# Build for iOS
expo build:ios

# Build for Android
expo build:android
```

### Backend

Ensure environment variables are set:
```env
NODE_ENV=production
JWT_SECRET=your_secret_key
MONGODB_URI=mongodb://...
```

### Admin Panel

Already included in main client deployment.

## Troubleshooting

### Driver can't login to mobile app
- Check user role is 'driver' in database
- Verify credentials are correct
- Check API_URL in .env matches backend

### Ride requests not received
- Ensure driver is online
- Check Socket.IO connection in app
- Verify backend socket events are emitting

### Location not updating
- Check location permissions granted
- Verify background location permission
- Check network connectivity

## Future Enhancements

- [ ] Ride history for drivers
- [ ] In-app chat with passengers
- [ ] Navigation integration (Google Maps/Waze)
- [ ] Driver ratings and reviews
- [ ] Offline mode with queue
- [ ] Push notifications via FCM
- [ ] Driver documents upload
- [ ] Earnings payout system
- [ ] Trip replay on map
- [ ] Driver performance analytics

## Support

For issues or questions:
- Check logs in `mobile-driver/` and `server/`
- Review Socket.IO connection in browser/app console
- Verify database indexes are created

## License

Proprietary - GoTours
