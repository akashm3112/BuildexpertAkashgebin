# Construction Marketplace App

A comprehensive mobile application for connecting customers with construction service providers, built with React Native (Expo) and Node.js backend.

## 🏗️ Project Structure

```
├── app/                    # React Native app (Expo Router)
├── server/                 # Node.js backend API
├── components/            # Reusable React Native components
└── hooks/                 # Custom React hooks
```

## 🚀 Features

### Mobile App (React Native + Expo)
- **Authentication**: Email/password login with phone and Aadhaar verification
- **Service Discovery**: Browse and search for construction services
- **Booking System**: Schedule services with date/time selection
- **Real-time Chat**: Communication between customers and providers
- **Payment Integration**: Secure payments with Stripe
- **Reviews & Ratings**: Rate and review service providers
- **Profile Management**: User profiles with image uploads

### Backend API (Node.js + Express)
- **RESTful API**: Complete CRUD operations for all entities
- **Authentication**: JWT-based authentication with role-based access
- **Database**: PostgreSQL with Prisma ORM
- **File Uploads**: Image uploads with Cloudinary integration
- **Real-time Features**: Socket.IO for chat functionality
- **Payment Processing**: Stripe integration for secure payments
- **SMS/Email**: OTP verification with Twilio and NodeMailer

## 🛠️ Technology Stack

### Frontend
- **React Native** with Expo SDK 52
- **Expo Router** for navigation
- **TypeScript** for type safety
- **Lucide React Native** for icons

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **PostgreSQL** database
- **Prisma** ORM for database operations
- **JWT** for authentication
- **Socket.IO** for real-time features

### Third-party Services
- **Twilio** for SMS OTP
- **Cloudinary** for image storage
- **Stripe** for payment processing
- **NodeMailer** for email notifications

## 📦 Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL database
- Expo CLI (`npm install -g @expo/cli`)

### 1. Clone the Repository
```bash
git clone <repository-url>
cd construction-marketplace
```

### 2. Install Dependencies

#### Frontend (React Native)
```bash
npm install
```

#### Backend (Node.js)
```bash
npm run server:install
```

### 3. Database Setup

#### Create PostgreSQL Database
```sql
CREATE DATABASE construction_marketplace;
```

#### Configure Environment Variables
```bash
cd server
cp .env.example .env
```

Edit `server/.env` with your database credentials and API keys:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/construction_marketplace"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Twilio (for SMS OTP)
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_PHONE_NUMBER="your-twilio-phone-number"

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME="your-cloudinary-cloud-name"
CLOUDINARY_API_KEY="your-cloudinary-api-key"
CLOUDINARY_API_SECRET="your-cloudinary-api-secret"

# Stripe (for payments)
STRIPE_SECRET_KEY="sk_test_your-stripe-secret-key"
```

#### Run Database Migrations
```bash
cd server
npx prisma migrate dev
npx prisma generate
```

#### Seed Database (Optional)
```bash
npm run seed
```

### 4. Start Development Servers

#### Start Backend Server
```bash
npm run server
```
Backend will run on `http://localhost:3000`

#### Start React Native App
```bash
npm run dev
```
Expo development server will start and provide QR code for mobile testing.

## 🗄️ Database Schema

### Core Entities

#### Users
- Authentication and profile information
- Support for customers and service providers
- Aadhaar and phone verification

#### Service Providers
- Extended profiles for service providers
- Ratings, reviews, and portfolio management
- Service offerings and pricing

#### Services
- Categorized service listings
- Base pricing and descriptions

#### Bookings
- Complete booking lifecycle management
- Status tracking and scheduling
- Payment integration

#### Chat & Messages
- Real-time messaging system
- Booking-specific conversations

#### Payments
- Stripe integration for secure payments
- Transaction history and status tracking

#### Reviews & Notifications
- Rating system for service providers
- Push notification support

## 🔐 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-phone` - Phone verification
- `POST /api/auth/verify-aadhaar` - Aadhaar verification

### Services
- `GET /api/services` - List all services
- `GET /api/services/providers` - List service providers
- `GET /api/services/providers/:id` - Get provider details

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id/status` - Update booking status
- `POST /api/bookings/:id/review` - Add review

### Chat
- `GET /api/chat` - Get user chats
- `GET /api/chat/:chatId/messages` - Get chat messages
- `POST /api/chat/:chatId/messages` - Send message

### Payments
- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/confirm` - Confirm payment
- `GET /api/payments/history` - Payment history

## 🔧 Configuration Required

### 1. Twilio Setup (SMS OTP)
1. Create account at [Twilio](https://www.twilio.com/)
2. Get Account SID, Auth Token, and Phone Number
3. Add to environment variables

### 2. Cloudinary Setup (Image Storage)
1. Create account at [Cloudinary](https://cloudinary.com/)
2. Get Cloud Name, API Key, and API Secret
3. Add to environment variables

### 3. Stripe Setup (Payments)
1. Create account at [Stripe](https://stripe.com/)
2. Get test/live API keys
3. Add to environment variables

### 4. PostgreSQL Database
1. Install PostgreSQL locally or use cloud service
2. Create database and user
3. Update DATABASE_URL in environment variables

## 📱 Mobile App Features

### User Authentication Flow
1. **Registration**: Email, phone, name, password
2. **Phone Verification**: OTP via SMS
3. **Aadhaar Verification**: 12-digit number + OTP
4. **Login**: Email/password authentication

### Service Discovery
- Browse services by category
- Search and filter providers
- View provider profiles and portfolios
- Check ratings and reviews

### Booking Process
1. Select service provider
2. Choose service type
3. Pick date and time
4. Confirm booking details
5. Make payment
6. Track booking status

### Communication
- Real-time chat with service providers
- Booking-specific conversations
- Image sharing support

## 🚀 Deployment

### Backend Deployment
1. Set up production PostgreSQL database
2. Configure production environment variables
3. Deploy to platforms like:
   - Heroku
   - Railway
   - DigitalOcean
   - AWS EC2

### Mobile App Deployment
1. Build production app:
   ```bash
   expo build:android
   expo build:ios
   ```
2. Submit to app stores:
   - Google Play Store
   - Apple App Store

## 🧪 Testing

### Backend Testing
```bash
cd server
npm test
```

### Mobile App Testing
- Use Expo Go app for development testing
- Create development builds for device testing
- Use Expo EAS for cloud builds

## 📄 API Documentation

The API includes comprehensive error handling, validation, and follows RESTful conventions. All endpoints require proper authentication except for public service listings.

### Response Format
```json
{
  "message": "Success message",
  "data": { ... },
  "pagination": { ... } // for paginated responses
}
```

### Error Format
```json
{
  "error": "Error message",
  "details": { ... } // additional error details
}
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

---

**Note**: This is a production-ready application with comprehensive features for a construction marketplace. Make sure to configure all required services and environment variables before deployment.