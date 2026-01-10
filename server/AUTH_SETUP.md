# Authentication Setup Guide

## Table of Contents
- [Environment Variables](#environment-variables)
- [Google OAuth Setup](#google-oauth-setup)
- [Facebook OAuth Setup](#facebook-oauth-setup)
- [API Endpoints](#api-endpoints)
- [Frontend Integration](#frontend-integration)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/lulini
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/api/auth/facebook/callback
```

---

## Google OAuth Setup

### Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name and click **Create**

### Step 2: Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** and click **Create**
3. Fill in:
   - App name: `Lulini`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. Skip Scopes, click **Save and Continue**
6. Add test users if needed, click **Save and Continue**

### Step 3: Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Fill in:
   - Name: `Lulini Web Client`
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `http://localhost:5173`
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback`
5. Click **Create**
6. Copy **Client ID** and **Client Secret** to your `.env` file

---

## Facebook OAuth Setup

### Step 1: Create a Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Consumer** and click **Next**
4. Enter app name: `Lulini` and click **Create App**

### Step 2: Add Facebook Login
1. In your app dashboard, find **Facebook Login** and click **Set Up**
2. Select **Web**
3. Enter site URL: `http://localhost:5173`
4. Click **Save** → **Continue**

### Step 3: Configure Settings
1. Go to **Facebook Login** → **Settings**
2. Add Valid OAuth Redirect URIs:
   - `http://localhost:3000/api/auth/facebook/callback`
3. Click **Save Changes**

### Step 4: Get App Credentials
1. Go to **Settings** → **Basic**
2. Copy **App ID** → `FACEBOOK_APP_ID` in `.env`
3. Click **Show** next to App Secret, copy → `FACEBOOK_APP_SECRET` in `.env`

### Step 5: Enable Live Mode (for production)
1. Complete all required fields in **Settings** → **Basic**
2. Add Privacy Policy URL
3. Toggle **App Mode** from Development to Live

---

## API Endpoints

### Traditional Authentication

#### Register
```
POST /api/auth/register
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"  // optional
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Logout
```
POST /api/auth/logout
```

#### Get Current User
```
GET /api/auth/me
```
Requires authentication (cookie or Bearer token)

---

### OAuth Authentication

#### Google Login
```
GET /api/auth/google
```
Redirects user to Google login page. After successful login, user is redirected to `CLIENT_URL` with auth cookie set.

#### Facebook Login
```
GET /api/auth/facebook
```
Redirects user to Facebook login page. After successful login, user is redirected to `CLIENT_URL` with auth cookie set.

---

## Frontend Integration

### Login Buttons (React example)

```jsx
const LoginPage = () => {
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:3000/api/auth/google';
  };

  const handleFacebookLogin = () => {
    window.location.href = 'http://localhost:3000/api/auth/facebook';
  };

  return (
    <div>
      <button onClick={handleGoogleLogin}>
        Login with Google
      </button>
      <button onClick={handleFacebookLogin}>
        Login with Facebook
      </button>
    </div>
  );
};
```

### API Calls with Cookies

```jsx
// Enable credentials for all requests
axios.defaults.withCredentials = true;

// Or per request
const getUser = async () => {
  const response = await fetch('http://localhost:3000/api/auth/me', {
    credentials: 'include'
  });
  return response.json();
};
```

### Check Authentication Status

```jsx
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3000/api/auth/me', {
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) setUser(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
};
```

---

## Response Examples

### Successful Login/Register
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "role": "user",
      "avatar": null
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "status": "fail",
  "message": "Invalid credentials"
}
```
