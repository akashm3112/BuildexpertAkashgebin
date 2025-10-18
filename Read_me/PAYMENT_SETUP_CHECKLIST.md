# Payment Gateway Setup Checklist

## ✅ Completed Implementation

### Frontend (ProviderApp)
- [x] Payment screen with Paytm integration (`providerApp/app/payment.tsx`)
- [x] Service registration redirects to payment (`providerApp/app/service-registration/[category].tsx`)
- [x] Services screen shows expiry status (`providerApp/app/(tabs)/services.tsx`)
- [x] Pay Now button for pending services
- [x] Renew Now button for expired services
- [x] Color-coded expiry warnings
- [x] Days remaining countdown

### Backend
- [x] Payment routes (`backend/routes/payments.js`)
  - POST `/api/payments/initiate-paytm`
  - POST `/api/payments/verify-paytm`
  - GET `/api/payments/transaction-history`
- [x] Service expiry manager (`backend/services/serviceExpiryManager.js`)
- [x] Cron jobs for expiry warnings (9 AM) and deactivation (10 AM)
- [x] Updated service registration (removes auto-activation)
- [x] Updated my-registrations endpoint (includes expiry fields)
- [x] Payment transactions table migration
- [x] Smart renewal logic (extends from current expiry)

### Database
- [x] `payment_transactions` table created
- [x] `provider_services` table has expiry fields
- [x] Database migration script ready

## 🔧 Required Configuration

### 1. Paytm Account Setup
- [ ] Sign up at https://business.paytm.com/
- [ ] Complete KYC verification
- [ ] Get Merchant ID (MID)
- [ ] Get Merchant Key
- [ ] Configure callback URL in Paytm dashboard
- [ ] Note down credentials for testing and production

### 2. Environment Variables
Add to `backend/config.env`:

```env
# Paytm Configuration (Required)
PAYTM_MID=YOUR_MERCHANT_ID_HERE
PAYTM_MERCHANT_KEY=YOUR_MERCHANT_KEY_HERE
PAYTM_WEBSITE=WEBSTAGING  # Change to production website name for prod
PAYTM_CHANNEL_ID=WAP
PAYTM_INDUSTRY_TYPE=Retail
PAYTM_CALLBACK_URL=https://your-domain.com/api/payments/paytm-callback
```

### 3. Database Migration
```bash
cd backend
node migrations/add-payment-transactions-table.js
```

### 4. Install Dependencies
```bash
# ProviderApp
cd providerApp
npm install

# Backend
cd backend
npm install
```

## 🚀 Deployment Steps

### 1. Production Paytm Setup
- [ ] Switch from staging to production MID
- [ ] Update PAYTM_WEBSITE to production value
- [ ] Configure production callback URL
- [ ] Whitelist production server IP in Paytm dashboard
- [ ] Test payment with small amount

### 2. Server Configuration
- [ ] Set correct timezone for cron jobs
- [ ] Ensure server stays running (use PM2 or similar)
- [ ] Configure SSL for callback URL
- [ ] Set up server monitoring
- [ ] Enable error logging

### 3. Testing Checklist
- [ ] Test new service registration flow
- [ ] Test payment initiation
- [ ] Test payment verification
- [ ] Test expiry warning notifications (set test expiry to 2 days)
- [ ] Test service deactivation (set test expiry to past date)
- [ ] Test renewal for active service
- [ ] Test renewal for expired service
- [ ] Test booking creation (should reject expired services)

## 📋 Paytm Dashboard Configuration

### Required Fields:
1. **Business Information**
   - Business Name: `[Your Business Name]`
   - Business Type: `Service Marketplace`
   - Website: `[Your Website/App URL]`

2. **Bank Details**
   - Account Number: `[Your Account]`
   - IFSC Code: `[Your IFSC]`
   - Account Holder Name: `[Name matching bank]`

3. **Callback URLs**
   - Callback URL: `https://your-domain.com/api/payments/paytm-callback`
   - Webhook URL: `https://your-domain.com/api/payments/paytm-webhook`

4. **Security**
   - IP Whitelist: `[Your Server IPs]`
   - Enable: All payment methods (Card, UPI, Net Banking, Wallet)

## ⚙️ System Behavior

### Service Lifecycle
```
1. Registration → Payment Status: PENDING
2. Payment Completed → Payment Status: ACTIVE (30 days)
3. Day 28 → Warning Notification Sent
4. Day 31 → Payment Status: EXPIRED
5. Renewal → New 30 days (starts from current expiry if active)
```

### Booking Rules
- ✅ **ACTIVE** services: Receive bookings
- ❌ **PENDING** services: Cannot receive bookings
- ❌ **EXPIRED** services: Cannot receive bookings

### Renewal Logic
```javascript
If service is ACTIVE:
  New period = current_expiry_date + 30 days
  
If service is EXPIRED or PENDING:
  New period = today + 30 days
```

## 🐛 Troubleshooting

### Payment Not Working
1. Check environment variables in `backend/config.env`
2. Verify Paytm credentials are correct
3. Check callback URL is accessible from internet
4. Review payment transaction logs
5. Test with Paytm staging environment first

### Notifications Not Sending
1. Verify serviceExpiryManager is started in server.js
2. Check cron job schedule (9 AM and 10 AM)
3. Verify notification service is initialized
4. Check server timezone matches expected timezone
5. Review notification logs

### Service Not Activating After Payment
1. Check payment verification endpoint logs
2. Verify database update queries
3. Check payment_status field in provider_services
4. Verify JWT token is valid
5. Check payment_transactions table for record

## 📊 Monitoring

### Key Metrics to Monitor
- Payment success rate
- Failed payment transactions
- Services expiring soon (< 7 days)
- Expired services count
- Renewal rate
- Average time to renewal

### Log Files to Check
```bash
# Backend logs
backend/logs/

# Check cron job execution
grep "Service expiry" backend/logs/

# Check payment transactions
psql -d your_db -c "SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT 10;"

# Check expiring services
psql -d your_db -c "SELECT * FROM provider_services WHERE payment_status = 'active' AND payment_end_date < CURRENT_DATE + INTERVAL '7 days';"
```

## 🎯 Next Steps After Setup

1. **Test Payment Flow**
   - Register a test service
   - Complete test payment
   - Verify service activation

2. **Test Expiry Management**
   - Set a service to expire in 2 days
   - Wait for notification (or trigger manually)
   - Verify service deactivation after expiry

3. **Test Renewal**
   - Renew an active service
   - Verify new period starts after current expiry
   - Renew an expired service
   - Verify new period starts immediately

4. **Production Deployment**
   - Switch to production Paytm credentials
   - Update callback URLs to production domain
   - Monitor first few transactions closely
   - Set up alerts for failed payments

## 📞 Support Contacts

### Paytm Support
- Email: business.support@paytm.com
- Phone: 0120-4770770
- Dashboard: https://dashboard.paytm.com/

### Technical Issues
- Review `PAYTM_PAYMENT_INTEGRATION_GUIDE.md` for detailed information
- Check backend logs for error messages
- Test in staging environment before production

---

**Status**: All features implemented ✅  
**Ready for**: Configuration and Testing  
**Last Updated**: October 16, 2025

