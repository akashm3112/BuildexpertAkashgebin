# BuildXpert Backend API

A comprehensive Node.js backend API for the BuildXpert platform, connecting both user and provider mobile applications.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **User Management**: Complete user profile and address management
- **Service Provider Management**: Provider registration, profile management, and service offerings
- **Booking System**: Complete booking lifecycle with status management
- **Rating & Review System**: Customer feedback and provider ratings
- **Payment Integration**: Payment processing and tracking
- **OTP Verification**: SMS-based mobile verification using Twilio
- **PostgreSQL Database**: Robust relational database with proper indexing
- **Security**: Helmet, CORS, rate limiting, and input validation

## 📋 Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- Twilio Account (for SMS OTP)
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp config.env.example config.env
   ```
   Edit `config.env` with your configuration:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=buildxpert
   DB_USER=postgres
   DB_PASSWORD=your_password_here

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRE=7d

   # Twilio Configuration
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   ```

4. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb buildxpert
   
   # Run migrations
   npm run db:migrate
   
   # Seed initial data
   npm run db:seed
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 📊 Database Schema

The application uses PostgreSQL with the following main tables:

- **users**: User accounts and authentication
- **addresses**: User address management (up to 3 per user)
- **services_master**: Predefined service categories
- **provider_profiles**: Service provider profiles
- **provider_services**: Provider service offerings
- **bookings**: Service booking management
- **ratings**: Customer ratings and reviews
- **notifications**: User notifications
- **payments**: Payment tracking

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/resend-otp` - Resend OTP
- `GET /api/auth/me` - Get current user profile

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/addresses` - Get user addresses
- `POST /api/users/addresses` - Add new address
- `PUT /api/users/addresses/:id` - Update address
- `DELETE /api/users/addresses/:id` - Delete address

### Services
- `GET /api/services` - Get all services
- `GET /api/services/:id` - Get service details
- `GET /api/services/:id/providers` - Get providers for service
- `GET /api/services/:id/providers/:providerId` - Get provider details
- `POST /api/services/:id/providers` - Register as provider

### Providers
- `GET /api/providers/profile` - Get provider profile
- `PUT /api/providers/profile` - Update provider profile
- `GET /api/providers/services` - Get provider services
- `PUT /api/providers/services/:id` - Update provider service
- `DELETE /api/providers/services/:id` - Remove provider service
- `GET /api/providers/bookings` - Get provider bookings
- `PUT /api/providers/bookings/:id/status` - Update booking status

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings` - Get user bookings
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `POST /api/bookings/:id/rate` - Rate booking
- `POST /api/bookings/:id/report` - Report booking
- `POST /api/bookings/:id/payment` - Process payment

## 🔐 Authentication

The API uses JWT tokens for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## 📱 Mobile App Integration

### User App Integration
```javascript
// Example API call from React Native
const response = await fetch('http://localhost:5000/api/auth/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fullName: 'John Doe',
    email: 'john@example.com',
    phone: '9876543210',
    password: 'password123',
    role: 'user'
  })
});
```

### Provider App Integration
```javascript
// Example API call for provider registration
const response = await fetch('http://localhost:5000/api/services/plumber/providers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    yearsOfExperience: 5,
    serviceDescription: 'Experienced plumber',
    serviceChargeValue: 500,
    serviceChargeUnit: 'per hour',
    state: 'Maharashtra',
    fullAddress: 'Mumbai, Maharashtra'
  })
});
```

## 🧪 Testing

```bash
# Health check
curl http://localhost:5000/health

# Test authentication
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Test User","email":"test@example.com","phone":"9876543210","password":"password123","role":"user"}'
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `NODE_ENV` | Environment | development |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 5432 |
| `DB_NAME` | Database name | buildxpert |
| `DB_USER` | Database user | postgres |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRE` | JWT expiration | 7d |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | - |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | - |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | - |

## 🚀 Deployment

1. **Set up production environment variables**
2. **Install dependencies**: `npm install --production`
3. **Run migrations**: `npm run db:migrate`
4. **Start server**: `npm start`

## 📞 Support

For support and questions, please contact the development team.

## 📄 License

This project is licensed under the MIT License. 