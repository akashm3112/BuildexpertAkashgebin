# Paytm Payment Gateway Integration Guide

## Overview
This guide explains the complete payment gateway integration for service registration with 30-day validity, expiry management, and automatic renewal system.

## Features Implemented

### 1. Payment Gateway Integration
- ✅ Paytm payment gateway for service registration
- ✅ Secure payment processing and verification
- ✅ Payment transaction tracking
- ✅ Order ID generation and management

### 2. Service Expiry Management
- ✅ 30-day validity period for each service registration
- ✅ Automatic expiry date calculation
- ✅ Days-until-expiry countdown display
- ✅ Color-coded expiry warnings (green > 7 days, yellow 3-7 days, red < 3 days)

### 3. Automated Notifications
- ✅ Warning notification 2 days before expiry (day 28)
- ✅ Expiry notification when service expires (day 31)
- ✅ Both in-app and push notifications
- ✅ Cron jobs running daily at 9 AM (warnings) and 10 AM (deactivation)

### 4. Booking Control
- ✅ Only active services receive booking requests
- ✅ Expired services automatically blocked from receiving bookings
- ✅ Pending payment services cannot receive bookings

### 5. Renewal Logic
- ✅ **Smart Renewal**: If service is still active, new 30-day period starts AFTER current expiry date
- ✅ **Expired Renewal**: If service expired, new period starts immediately
- ✅ Prevents payment loss - users get full 30 days even if renewing early

## Architecture

### Frontend (ProviderApp)

#### 1. Payment Screen (`providerApp/app/payment.tsx`)
```typescript
// Handles Paytm payment initiation and verification
- initiatePaytmPayment() - Calls backend to start payment
- verifyPayment() - Verifies payment completion
- Displays payment amount and validity (30 days)
```

#### 2. Service Registration (`providerApp/app/service-registration/[category].tsx`)
```typescript
// Redirects to payment after successful registration
- For new registrations: Navigate to payment screen
- For edits: Direct update without payment
```

#### 3. Services Screen (`providerApp/app/(tabs)/services.tsx`)
```typescript
// Displays service status and expiry information
- Active services: Show expiry date and days remaining
- Pending services: Show "Pay Now" button
- Expired services: Show "Renew Now" button
- Color-coded warnings based on days remaining
```

### Backend

#### 1. Payment Routes (`backend/routes/payments.js`)

**Initiate Payment**
```javascript
POST /api/payments/initiate-paytm
- Creates payment transaction record
- Generates unique order ID
- Prepares Paytm parameters
- Returns payment URL
```

**Verify Payment**
```javascript
POST /api/payments/verify-paytm
- Verifies payment with Paytm
- Calculates start/end dates (smart renewal logic)
- Updates service status to 'active'
- Sends success notification
```

**Smart Renewal Logic**:
```javascript
if (service is active && has future expiry date) {
  // New period starts after current expiry
  startDate = currentExpiryDate;
  endDate = currentExpiryDate + 30 days;
} else {
  // New activation or expired service
  startDate = today;
  endDate = today + 30 days;
}
```

#### 2. Service Expiry Manager (`backend/services/serviceExpiryManager.js`)

**Cron Jobs**:
- **9:00 AM Daily**: Check for services expiring in 2 days
  - Send warning notifications
  - Push notifications to mobile devices
  
- **10:00 AM Daily**: Check for expired services
  - Update status from 'active' to 'expired'
  - Send expiry notifications
  - Block from receiving new bookings

**Functions**:
```javascript
sendExpiryWarnings()
- Finds services expiring in exactly 2 days
- Sends in-app and push notifications
- Prevents duplicate notifications

deactivateExpiredServices()
- Finds services past expiry date
- Updates status to 'expired'
- Sends expiry notifications
```

#### 3. Service Routes Updates (`backend/routes/services.js`)

**Registration Endpoint**:
```javascript
POST /api/services/:id/providers
- Creates service with 'pending' status (no auto-activation)
- Returns provider_service_id for payment
```

**My Registrations Endpoint**:
```javascript
GET /api/services/my-registrations
- Returns payment_start_date, payment_end_date
- Calculates days_until_expiry
- Includes all service details
```

#### 4. Booking Routes (`backend/routes/bookings.js`)
```javascript
POST /api/bookings
- Checks: payment_status = 'active'
- Rejects bookings for expired/pending services
```

### Database Schema

#### Payment Transactions Table
```sql
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY,
  order_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  provider_service_id UUID REFERENCES provider_services(id),
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  payment_method VARCHAR(50) DEFAULT 'paytm',
  service_name TEXT,
  payment_gateway_response JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

#### Provider Services Table (Updated)
```sql
provider_services (
  ...existing fields...
  payment_status TEXT DEFAULT 'pending', -- 'pending', 'active', 'expired'
  payment_start_date DATE,
  payment_end_date DATE
);
```

## Paytm Configuration

### Environment Variables Required
Add to `backend/config.env`:

```env
# Paytm Configuration
PAYTM_MID=YOUR_MERCHANT_ID
PAYTM_MERCHANT_KEY=YOUR_MERCHANT_KEY
PAYTM_WEBSITE=WEBSTAGING  # or WEBSITENAME for production
PAYTM_CHANNEL_ID=WAP
PAYTM_INDUSTRY_TYPE=Retail
PAYTM_CALLBACK_URL=http://your-domain.com/api/payments/paytm-callback
```

### Getting Paytm Credentials

1. **Signup**: Visit [Paytm Business](https://business.paytm.com/)
2. **Complete KYC**: Submit required documents
3. **Get Credentials**:
   - Merchant ID (MID)
   - Merchant Key
   - Website Name
4. **Configure Callback URL**: Set in Paytm dashboard
5. **Test Mode**: Use staging credentials for testing

### Paytm Integration Steps

1. **Initiate Transaction**:
```javascript
const paytmParams = {
  MID: MERCHANT_ID,
  ORDER_ID: unique_order_id,
  CUST_ID: user_id,
  TXN_AMOUNT: amount,
  CALLBACK_URL: callback_url,
  // ... other params
};
const checksum = generateChecksum(paytmParams, MERCHANT_KEY);
```

2. **Redirect User**: Send to Paytm payment page with params

3. **Handle Callback**: Verify checksum and update transaction status

4. **Verify Transaction**: Call Paytm API to confirm payment

## User Flow

### New Service Registration
1. Provider fills service registration form
2. Clicks "Continue to Payment"
3. Service created with `payment_status = 'pending'`
4. Redirected to payment screen
5. Selects Paytm payment method
6. Completes payment via Paytm
7. Backend verifies payment
8. Service activated with 30-day validity
9. Start date = today, End date = today + 30 days
10. Success notification sent

### Service Renewal (Before Expiry)
1. Provider sees expiry warning in services screen
2. Clicks "Renew Now" or "Pay Now"
3. Redirected to payment screen
4. Completes payment
5. Backend detects active service
6. **New period starts AFTER current expiry date**
   - Start date = current_expiry_date
   - End date = current_expiry_date + 30 days
7. Provider doesn't lose remaining days
8. Success notification sent

### Service Renewal (After Expiry)
1. Service automatically expires (day 31)
2. Status changed to 'expired'
3. Provider sees "Service Expired" message
4. Clicks "Renew Now"
5. Completes payment
6. New period starts immediately
   - Start date = today
   - End date = today + 30 days
7. Service reactivated

## Notification Timeline

**Day 0**: Service activated (30 days validity)

**Day 28** (2 days before expiry):
```
⚠️ Service Expiring Soon
Your [Service Name] service will expire on [Date].
Please renew to continue receiving bookings.
```

**Day 31** (after expiry):
```
🔴 Service Expired
Your [Service Name] service has expired.
You will not receive new bookings until you renew your subscription.
```

## Installation & Setup

### 1. Install Dependencies

**ProviderApp**:
```bash
cd providerApp
npm install react-native-paytm
npm install
```

**Backend**:
```bash
cd backend
npm install
```

### 2. Run Database Migration
```bash
cd backend
node migrations/add-payment-transactions-table.js
```

### 3. Configure Environment Variables
Add Paytm credentials to `backend/config.env`

### 4. Start Services
```bash
# Backend
cd backend
npm start

# ProviderApp
cd providerApp
npx expo start
```

## Testing

### Test Paytm Integration

**Test Credentials** (Staging):
```
MID: Your_Test_MID
Merchant Key: Your_Test_Key
Website: WEBSTAGING
```

**Test Cards**:
```
Card Number: 4111111111111111
CVV: 123
Expiry: Any future date
```

### Test Expiry Management

**Manually Set Expiry Date**:
```sql
-- Set service to expire in 2 days
UPDATE provider_services
SET payment_end_date = CURRENT_DATE + INTERVAL '2 days',
    payment_status = 'active'
WHERE id = 'your-service-id';

-- Trigger notification job manually
-- In backend console:
const { serviceExpiryManager } = require('./services/serviceExpiryManager');
serviceExpiryManager.sendExpiryWarnings();
```

**Set Service to Expired**:
```sql
UPDATE provider_services
SET payment_end_date = CURRENT_DATE - INTERVAL '1 day',
    payment_status = 'active'
WHERE id = 'your-service-id';

-- Trigger deactivation job
serviceExpiryManager.deactivateExpiredServices();
```

### Test Renewal Logic

**Test Active Service Renewal**:
1. Create active service expiring in 10 days
2. Complete payment (renewal)
3. Verify new period starts after current expiry
4. Check: new_start_date = old_end_date

**Test Expired Service Renewal**:
1. Create expired service
2. Complete payment (renewal)
3. Verify new period starts immediately
4. Check: new_start_date = today

## Important Notes

### Payment Security
- ✅ All payments processed through Paytm secure gateway
- ✅ Checksums validated for transaction integrity
- ✅ Transaction records maintained for auditing
- ✅ Payment verification before service activation

### Data to Fill in Paytm Dashboard
When setting up your Paytm account, you'll need to provide:

1. **Business Details**:
   - Business Name: Your company name
   - Business Type: Service Provider / Marketplace
   - Website URL: Your app/website URL

2. **Bank Account Details**:
   - Account Number
   - IFSC Code
   - Account Holder Name
   - Branch Name

3. **KYC Documents**:
   - PAN Card
   - GST Certificate (if applicable)
   - Address Proof (Aadhar/Passport)
   - Cancelled Cheque

4. **Technical Configuration**:
   - **Callback URL**: `https://your-domain.com/api/payments/paytm-callback`
   - **Webhook URL**: `https://your-domain.com/api/payments/paytm-webhook`
   - **IP Whitelist**: Your server IP addresses
   - **Payment Methods**: Card, UPI, Net Banking, Wallet

5. **Settlement Details**:
   - Settlement Frequency: Daily/Weekly
   - Settlement Account: Verified bank account
   - Transaction Charges: Agree to Paytm fee structure

### Service Validity Rules
- ✅ Each payment = 30 days validity
- ✅ Expiry warning sent on day 28 (2 days before)
- ✅ Service deactivated on day 31 (after expiry)
- ✅ Renewal extends from current expiry (not immediate)
- ✅ No bookings accepted for expired/pending services

### Cron Job Schedule
- ✅ Expiry warnings: Daily at 9:00 AM
- ✅ Service deactivation: Daily at 10:00 AM
- ✅ Jobs run automatically on server startup
- ✅ Duplicate notifications prevented

## Troubleshooting

### Payment Not Completing
- Check Paytm credentials in config.env
- Verify callback URL is accessible
- Check server logs for errors
- Ensure payment_transactions table exists

### Notifications Not Sending
- Verify cron jobs are running
- Check notification service is initialized
- Verify push notification tokens are registered
- Check server time zone settings

### Service Not Activating
- Check payment verification endpoint logs
- Verify payment_status update query
- Check database constraints
- Verify JWT token in request headers

### Renewal Issues
- Check current expiry date in database
- Verify renewal logic conditions
- Check payment_start_date and payment_end_date values
- Review backend logs for renewal calculation

## API Reference

### Payment Endpoints

**Initiate Payment**
```
POST /api/payments/initiate-paytm
Headers: Authorization: Bearer <token>
Body: {
  providerServiceId: UUID,
  amount: number,
  serviceCategory: string,
  serviceName: string
}
Response: {
  status: 'success',
  orderId: string,
  paytmUrl: string,
  paytmParams: object
}
```

**Verify Payment**
```
POST /api/payments/verify-paytm
Headers: Authorization: Bearer <token>
Body: {
  orderId: string,
  providerServiceId: UUID
}
Response: {
  status: 'success',
  data: {
    startDate: date,
    endDate: date,
    validity: 30
  }
}
```

**Transaction History**
```
GET /api/payments/transaction-history
Headers: Authorization: Bearer <token>
Response: {
  status: 'success',
  data: {
    transactions: array
  }
}
```

## Future Enhancements

1. **Multiple Payment Methods**: Add Razorpay, Stripe
2. **Subscription Plans**: Monthly, Quarterly, Yearly options
3. **Auto-renewal**: Automatic payment before expiry
4. **Payment Analytics**: Dashboard for providers
5. **Refund System**: Handle cancellations and refunds
6. **Promo Codes**: Discount codes for registrations

## Support

For issues or questions:
1. Check server logs in `backend/logs/`
2. Review database records in `payment_transactions` table
3. Test payment flow in staging environment
4. Contact Paytm support for gateway issues

---

**Last Updated**: October 16, 2025
**Version**: 1.0.0

