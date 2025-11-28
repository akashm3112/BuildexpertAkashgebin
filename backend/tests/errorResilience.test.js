const request = require('supertest');
const { app } = require('../server');
const db = require('../database/connection');
const otpUtils = require('../utils/otp');
const cloudinary = require('../utils/cloudinary');
const { query } = db;
const originalPoolQuery = db.pool.query.bind(db.pool);

const USER_OTP = '445566';
const PROVIDER_OTP = '667788';

const logStep = (label, status, details = {}) => ({
  label,
  status,
  details,
});

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const generatePhoneNumber = () => {
  let phone;
  do {
    phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  } while (/^91/.test(phone));
  return phone;
};

async function cleanupUser(userId, phone, role) {
  if (!userId) return;

  try {
    await query('DELETE FROM bookings WHERE user_id = $1', [userId]);
    await query(
      `DELETE FROM bookings 
       WHERE provider_service_id IN (
         SELECT ps.id 
         FROM provider_services ps 
         JOIN provider_profiles pp ON ps.provider_id = pp.id 
         WHERE pp.user_id = $1
       )`,
      [userId]
    );
    await query(
      'DELETE FROM provider_services WHERE provider_id IN (SELECT id FROM provider_profiles WHERE user_id = $1)',
      [userId]
    );
    await query('DELETE FROM provider_profiles WHERE user_id = $1', [userId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);
  } catch (_) {}
  if (phone && role) otpUtils.deletePendingSignup(phone, role);
}

async function signUp({ phone, email, fullName, password, role, otp }) {
  const steps = [];

  const signupResponse = await request(app)
    .post('/api/auth/signup')
    .set('Content-Type', 'application/json')
    .send({ fullName, email, phone, password, role });

  steps.push(logStep(`${role} signup`, signupResponse.status, { body: signupResponse.body }));

  if (signupResponse.status !== 200 || signupResponse.body.status !== 'success')
    throw Object.assign(new Error(`${role} signup failed`), { steps });

  const sanitizedPhone = sanitizePhone(phone);
  otpUtils.storeOTP(sanitizedPhone, otp);

  const verifyResponse = await request(app)
    .post('/api/auth/verify-otp')
    .set('Content-Type', 'application/json')
    .send({ phone, otp });

  steps.push(logStep(`${role} OTP verification`, verifyResponse.status, { body: verifyResponse.body }));

  if (verifyResponse.status !== 200 || verifyResponse.body.status !== 'success')
    throw Object.assign(new Error(`${role} OTP verification failed`), { steps });

  return {
    steps,
    token: verifyResponse.body.data?.token,
    user: verifyResponse.body.data?.user,
    sanitizedPhone,
  };
}

async function run() {
  const steps = [];
  const userPhone = generatePhoneNumber();
  const providerPhone = generatePhoneNumber();

  let userId, providerUserId, userToken, providerToken, laborServiceId, paidServiceId, paidPricingPlanId, activeOrderId;
  const originalFetch = global.fetch;

  try {
    // Signups
    const user = await signUp({
      phone: userPhone,
      email: `resilience.user.${Date.now()}@example.com`,
      fullName: 'Resilience User',
      password: 'User@1234',
      role: 'user',
      otp: USER_OTP,
    });
    steps.push(...user.steps);
    userId = user.user.id;
    userToken = user.token;

    const provider = await signUp({
      phone: providerPhone,
      email: `resilience.provider.${Date.now()}@example.com`,
      fullName: 'Resilience Provider',
      password: 'Prov@1234',
      role: 'provider',
      otp: PROVIDER_OTP,
    });
    steps.push(...provider.steps);
    providerUserId = provider.user.id;
    providerToken = provider.token;

    // Service registration
    const laborRes = await request(app)
      .post('/api/services/labor/providers')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        yearsOfExperience: 6,
        serviceDescription: 'Network Resilience Test Service',
        serviceChargeValue: 300,
        serviceChargeUnit: 'per_day',
        state: 'TestState',
        fullAddress: '123 Network Street',
      });
    steps.push(logStep('Register labor service', laborRes.status, { body: laborRes.body }));
    laborServiceId = laborRes.body.data?.providerService?.id;

    const paidRes = await request(app)
      .post('/api/services/plumber/providers')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        yearsOfExperience: 5,
        serviceDescription: 'Payment Failure Simulation',
        serviceChargeValue: 1200,
        serviceChargeUnit: 'per_project',
        state: 'GatewayState',
        fullAddress: '456 Payment Blvd',
      });
    steps.push(logStep('Register paid service', paidRes.status, { body: paidRes.body }));
    paidServiceId = paidRes.body.data?.providerService?.id;
    paidPricingPlanId = paidRes.body.data?.providerService?.defaultPricingPlanId;

    // 1️⃣ Network Disconnection Simulation
    db.pool.query = async (text, params) => {
      if (typeof text === 'string' && text.toLowerCase().includes('insert into bookings')) {
        const err = new Error('Simulated Network Error');
        err.code = 'ECONNRESET';
        throw err;
      }
      return originalPoolQuery(text, params);
    };

    const netRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        providerServiceId: laborServiceId,
        selectedService: 'Network Failure Booking',
        appointmentDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        appointmentTime: '10:00',
      });
    steps.push(logStep('Network failure (booking)', netRes.status, { body: netRes.body }));
    if (netRes.status !== 503) {
      throw new Error(`Expected booking creation to return 503 during simulated network outage, received ${netRes.status}`);
    }
    db.pool.query = originalPoolQuery;

    // 2️⃣ Database Connection Failure
    db.pool.query = async (text, params) => {
      if (text.toLowerCase().includes('select id, name')) {
        const err = new Error('Simulated DB Connection Loss');
        err.code = 'ECONNRESET';
        throw err;
      }
      return originalPoolQuery(text, params);
    };
    const dbRes = await request(app).get('/api/services');
    steps.push(logStep('DB connection failure (service listing)', dbRes.status, { body: dbRes.body }));
    db.pool.query = originalPoolQuery;

    // 3️⃣ Payment Gateway Failure
    const payInit = await request(app)
      .post('/api/payments/initiate-paytm')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        providerServiceId: paidServiceId,
        amount: 99,
        pricingPlanId: paidPricingPlanId,
        serviceCategory: 'plumber',
        serviceName: 'Plumber Service',
      });
    steps.push(logStep('Payment initiation', payInit.status, { body: payInit.body }));
    activeOrderId = payInit.body.orderId;

    global.fetch = async () => {
      const err = new Error('Simulated Paytm Outage');
      err.code = 'ECONNRESET';
      throw err;
    };

    const payVerify = await request(app)
      .post('/api/payments/verify-paytm')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ orderId: activeOrderId, providerServiceId: paidServiceId });
    steps.push(logStep('Payment gateway failure', payVerify.status, { body: payVerify.body }));
    global.fetch = originalFetch;

    // 4️⃣ SMS Service Lockout
    for (let i = 0; i < 6; i++) otpUtils.verifyOTP(user.sanitizedPhone, '000000');
    const smsFail = await request(app)
      .post('/api/auth/send-otp')
      .send({ phone: userPhone });
    steps.push(logStep('SMS rate limit/lockout', smsFail.status, { body: smsFail.body }));

    // 5️⃣ File Upload Failure
    const fileRes = await request(app)
      .post('/api/upload/single')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('image', Buffer.from('invalid-file'), 'test.txt');
    steps.push(logStep('File upload failure', fileRes.status, { body: fileRes.body }));

    // ---- Readiness Score ----
    const toleratedStatuses = new Set([503]);
    const passed = steps.filter(s => (s.status >= 200 && s.status < 500) || toleratedStatuses.has(s.status)).length;
    const score = Math.round((passed / steps.length) * 100);

    steps.push(logStep('Resilience Readiness', 200, { score, verdict: score >= 90 ? '✅ Production-Ready' : '⚠️ Needs Review' }));

    return { success: score >= 90, score, steps };
  } catch (error) {
    steps.push(logStep('Test failure', 500, { error: error.message, stack: error.stack }));
    return { success: false, score: 0, steps };
  } finally {
    global.fetch = originalFetch;
    db.pool.query = originalPoolQuery;
    await cleanupUser(userId, sanitizePhone(userPhone), 'user');
    await cleanupUser(providerUserId, sanitizePhone(providerPhone), 'provider');
    if (activeOrderId)
      await query('DELETE FROM payment_transactions WHERE order_id = $1', [activeOrderId]).catch(() => {});
  }
}

(async () => {
  const result = await run();
  console.log('🧩 Error Resilience Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Result: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Resilience Readiness Score: ${result.score}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
    if (step.details) console.log(JSON.stringify(step.details, null, 2));
  }
  process.exit(result.success ? 0 : 1);
})();
