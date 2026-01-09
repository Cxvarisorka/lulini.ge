# GoTours Georgia

A full-stack web application for booking airport transfers and car rentals in Georgia. Built with React and Express.js, featuring a modern UI, multi-language support, and a comprehensive admin dashboard.

## Features

### Customer Features
- **Airport & City Transfers** - Book transfers with real-time route calculation, Google Maps integration, and multiple vehicle classes (Economy, Business, First Class)
- **Car Rentals** - Browse 50+ vehicles across multiple locations with filtering by category, location, and availability
- **User Accounts** - Register and login with email/password or OAuth (Google, Facebook)
- **Multi-language Support** - Available in English, Spanish, Russian, and Georgian
- **Order Tracking** - View booking history and order status in user profile

### Admin Features
- **Dashboard** - Real-time KPIs, statistics, and visualizations
- **Car Management** - Full CRUD operations for rental vehicles
- **Transfer Pricing** - Configure base rates and vehicle type multipliers
- **Order Management** - Track and manage transfer and rental orders

## Tech Stack

### Frontend
- React 19 with Vite
- React Router DOM for navigation
- Tailwind CSS for styling
- Radix UI component primitives
- i18next for internationalization
- Google Maps API for route visualization
- Lucide React for icons

### Backend
- Express.js 5
- MongoDB with Mongoose ODM
- Passport.js for OAuth authentication
- JWT for session management
- bcryptjs for password hashing

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── admin/      # Admin panel components
│   │   │   └── ui/         # Base UI primitives
│   │   ├── pages/          # Page components
│   │   │   └── admin/      # Admin pages
│   │   ├── context/        # React Context providers
│   │   ├── services/       # API communication
│   │   ├── hooks/          # Custom React hooks
│   │   ├── i18n/           # Internationalization
│   │   │   └── locales/    # Language files
│   │   ├── data/           # Static data
│   │   └── lib/            # Utility functions
│   └── public/             # Static assets
│
└── server/                 # Express backend
    ├── configs/            # Database and OAuth config
    ├── controllers/        # Request handlers
    ├── middlewares/        # Express middleware
    ├── models/             # Mongoose schemas
    ├── routers/            # API routes
    └── utils/              # Helper utilities
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB instance
- Google Maps API key
- OAuth credentials (Google, Facebook)

### Environment Variables

**Server (`server/.env`):**
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
FACEBOOK_CLIENT_ID=your_facebook_client_id
FACEBOOK_CLIENT_SECRET=your_facebook_client_secret
CLIENT_URL=http://localhost:5173
```

**Client (`client/.env`):**
```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Installation

1. Clone the repository
```bash
git clone https://github.com/Cxvarisorka/gotours.ge.git
cd gotours.ge
```

2. Install server dependencies
```bash
cd server
npm install
```

3. Install client dependencies
```bash
cd ../client
npm install
```

4. Start the development servers

**Server:**
```bash
cd server
npm run dev
```

**Client:**
```bash
cd client
npm run dev
```

The client will be available at `http://localhost:5173` and the API at `http://localhost:5000`.

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/google` | Google OAuth login |
| GET | `/api/auth/facebook` | Facebook OAuth login |

## Available Scripts

### Client
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Server
- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server

## License

MIT
