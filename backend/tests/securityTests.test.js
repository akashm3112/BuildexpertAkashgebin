/**
 * Enhanced Security Test Suite for Production Readiness
 * -----------------------------------------------------
 * - Adds categorized step reporting
 * - Adds timing metrics per test
 * - Includes an overall readiness review summary
 * - Masks sensitive output in logs
 * - Handles transient errors more gracefully
 */

const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const USER_OTP = '123789';
const RATE_LIMIT_OTP = '789321';

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const maskSensitive = (obj) => {
  const str = JSON.stringify(obj);
  return str.replace(/"token":"[^"]+"/g, '"token":"***MASKED***"');
};

const logStep = (label, category, status, details = {}, startTime = null) => {
  const duration = startTime ? `${Date.now() - startTime}ms` : null;
  return { label, category, status, details, duration };
};

const generatePhoneNumber = () => {
  let phone;
  do {
    phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  } while (/^91/.test(phone));
  return phone;
};

async function cleanupUser(userId, phone, role) {
  if (!userId) return;
  await query('DELETE FROM notifications WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM user_sessions WHERE user_id = $1::uuid', [userId]).catch(() => {});
  await query('DELETE FROM payment_transactions WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM payment_locks WHERE user_id = $1::text', [userId]).catch(() => {});
  await query('DELETE FROM addresses WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM bookings WHERE user_id = $1', [userId]).catch(() => {});
  await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});

  if (phone && role) {
    deletePendingSignup(phone, role);
  }
}

async function signUpUser({ phone, email, fullName, password, role, otp }) {
  const steps = [];
  const startSignup = Date.now();

  const signupResponse = await request(app)
    .post('/api/auth/signup')
    .set('Content-Type', 'application/json')
    .send({ fullName, email, phone, password, role });

  steps.push(
    logStep(`${role} signup`, 'Authentication', signupResponse.status, signupResponse.body, startSignup)
  );

  if (signupResponse.status !== 200 || signupResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} signup failed`), { steps });
  }

  const sanitized = sanitizePhone(phone);
  storeOTP(sanitized, otp);

  const startVerify = Date.now();
  const verifyResponse = await request(app)
    .post('/api/auth/verify-otp')
    .set('Content-Type', 'application/json')
    .send({ phone, otp });

  steps.push(
    logStep(`${role} OTP verification`, 'Authentication', verifyResponse.status, verifyResponse.body, startVerify)
  );

  if (verifyResponse.status !== 200 || verifyResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} OTP verification failed`), { steps });
  }

  return {
    steps,
    token: verifyResponse.body.data?.token,
    user: verifyResponse.body.data?.user,
    sanitizedPhone: sanitized,
  };
}

async function run() {
  const steps = [];
  const startSuite = Date.now();

  const mainUserPhone = generatePhoneNumber();
  const rateUserPhone = generatePhoneNumber();

  const mainUserPassword = 'SecurityUser@123';
  const rateUserPassword = 'RateLimitUser@123';

  let mainUserId = null;
  let rateUserId = null;

  try {
    // Signup + OTP
    const mainUserResult = await signUpUser({
      phone: mainUserPhone,
      email: `security.user.${Date.now()}@example.com`,
      fullName: 'QA Security User',
      password: mainUserPassword,
      role: 'user',
      otp: USER_OTP,
    });
    steps.push(...mainUserResult.steps);
    mainUserId = mainUserResult.user.id;

    const rateUserResult = await signUpUser({
      phone: rateUserPhone,
      email: `security.rate.${Date.now()}@example.com`,
      fullName: 'QA Rate User',
      password: rateUserPassword,
      role: 'user',
      otp: RATE_LIMIT_OTP,
    });
    steps.push(...rateUserResult.steps);
    rateUserId = rateUserResult.user.id;

    // 1. Authentication Bypass
    const t1 = Date.now();
    const bypassResponse = await request(app).get('/api/services/my-registrations');
    steps.push(
      logStep('Authentication bypass attempt', 'Security', bypassResponse.status, bypassResponse.body, t1)
    );
    if (bypassResponse.status !== 401) throw new Error('Expected 401 for unauthenticated access');

    // 2. Authorization validation
    const t2 = Date.now();
    const authzResponse = await request(app)
      .post('/api/services/labor/providers')
      .set('Authorization', `Bearer ${mainUserResult.token}`)
      .set('Content-Type', 'application/json')
      .send({
        yearsOfExperience: 3,
        serviceDescription: 'Unauthorized registration attempt',
        serviceChargeValue: 500,
        serviceChargeUnit: 'per_day',
        state: 'Kerala',
        fullAddress: '1 Security Street',
        workingProofUrls: [],
        isEngineeringProvider: false,
      });
    steps.push(
      logStep('Authorization validation (user on provider route)', 'Authorization', authzResponse.status, authzResponse.body, t2)
    );
    if (authzResponse.status !== 403) throw new Error('Expected 403 for unauthorized route access');

    // 3. Injection attempt
    const t3 = Date.now();
    const injectionResponse = await request(app)
      .get('/api/notifications/history')
      .set('Authorization', `Bearer ${mainUserResult.token}`)
      .query({ type: "'; DROP TABLE users; --" });
    steps.push(
      logStep('Input injection attempt', 'Security', injectionResponse.status, injectionResponse.body, t3)
    );
    if (![400, 422].includes(injectionResponse.status))
      throw new Error('Expected sanitization to reject injection pattern');

    // 4. Session management
    const t4 = Date.now();
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({
        phone: mainUserResult.sanitizedPhone,
        password: mainUserPassword,
        role: 'user',
      });
    if (loginResponse.status !== 200) throw new Error('Login failed for session test');

    const sessionToken = loginResponse.body.data?.token;
    const logoutResponse = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${sessionToken}`);
    steps.push(logStep('Logout request', 'Session', logoutResponse.status, logoutResponse.body, t4));
    if (logoutResponse.status !== 200) throw new Error('Logout failed');

    const postLogoutAccess = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${sessionToken}`);
    steps.push(
      logStep('Access after logout (revoked token)', 'Session', postLogoutAccess.status, postLogoutAccess.body)
    );
    if (postLogoutAccess.status !== 401) throw new Error('Expected 401 for revoked session token');

    // 5. Rate limiting
    const rateLimiterThreshold = 5;
    let rateLimitTriggered = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const start = Date.now();
      const loginFail = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send({
          phone: rateUserResult.sanitizedPhone,
          password: 'WrongPassword!',
          role: 'user',
        });
      steps.push(
        logStep(`Login attempt ${attempt} (rate limit test)`, 'Rate Limiting', loginFail.status, loginFail.body, start)
      );
      if (attempt >= rateLimiterThreshold && loginFail.status === 429) rateLimitTriggered = true;
    }

    if (!rateLimitTriggered) throw new Error('Rate limiting did not trigger as expected');

    const totalDuration = `${Date.now() - startSuite}ms`;
    return { success: true, steps, totalDuration };
  } catch (error) {
    steps.push(
      logStep('Test failure', 'System', 500, { error: error.message, stack: error.stack })
    );
    return { success: false, steps };
  } finally {
    await cleanupUser(mainUserId, sanitizePhone(mainUserPhone), 'user');
    await cleanupUser(rateUserId, sanitizePhone(rateUserPhone), 'user');
  }
}

(async () => {
  const result = await run();
  console.log('\n🚀 SECURITY TEST SUITE RESULT 🚀');
  console.log('--------------------------------');
  console.log('✅ Status:', result.success ? 'PASS' : 'FAIL');
  console.log('🕒 Total Duration:', result.totalDuration || 'N/A');

  const grouped = result.steps.reduce((acc, step) => {
    acc[step.category] = acc[step.category] || [];
    acc[step.category].push(step);
    return acc;
  }, {});

  for (const [category, steps] of Object.entries(grouped)) {
    console.log(`\n📂 Category: ${category}`);
    for (const step of steps) {
      console.log(`- ${step.label}: ${step.status} (${step.duration || 'N/A'})`);
      console.log(maskSensitive(step.details));
    }
  }

  // Production Readiness Review
  console.log('\n🔍 Readiness Review:');
  if (result.success) {
    console.log('✅ Application is READY for production from a security sanity standpoint.');
  } else {
    console.log('❌ Application requires further review before production.');
    console.log('⚠️ Check failing steps and address issues in authentication, authorization, or sanitization layers.');
  }

  process.exit(result.success ? 0 : 1);
})();
