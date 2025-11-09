const autocannon = require('autocannon');
const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const USER_OTP = '556677';
const PROVIDER_OTP = '778899';

if (process.env.NODE_ENV === 'production') {
  console.error('⚠️  Safety check failed: Do NOT run performance tests on production!');
  process.exit(1);
}

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const logStep = (label, status, details = {}) => ({
  label,
  status,
  details,
});

const generatePhoneNumber = () => {
  let phone;
  do {
    phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  } while (/^91/.test(phone));
  return phone;
};

async function cleanupUser(userId, phone, role) {
  if (!userId) return;
  const tables = [
    'notifications',
    'user_sessions',
    'payment_transactions',
    'addresses',
    'bookings',
    'provider_profiles',
  ];
  for (const table of tables) {
    try {
      if (table === 'provider_profiles') {
        await query('DELETE FROM provider_services WHERE provider_id = (SELECT id FROM provider_profiles WHERE user_id = $1::uuid)', [userId]);
      }
      if (table === 'user_sessions') {
        await query('DELETE FROM user_sessions WHERE user_id = $1::uuid', [userId]);
      } else {
        await query(`DELETE FROM ${table} WHERE user_id = $1::uuid OR id = $1::uuid`, [userId]);
      }
    } catch (e) {
      console.warn(`Cleanup failed for table ${table}: ${e.message}`);
    }
  }
  if (phone && role) {
    deletePendingSignup(phone, role);
  }
}

async function retry(fn, retries = 2, delayMs = 500) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

async function signUp({ phone, email, fullName, password, role, otp }) {
  const steps = [];

  const signupResponse = await retry(() =>
    request(app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')
      .send({ fullName, email, phone, password, role })
  );

  steps.push(
    logStep(`${role} signup`, signupResponse.status, { body: signupResponse.body })
  );

  if (signupResponse.status !== 200 || signupResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} signup failed`), { steps });
  }

  storeOTP(sanitizePhone(phone), otp);

  const verifyResponse = await retry(() =>
    request(app)
      .post('/api/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({ phone, otp })
  );

  steps.push(
    logStep(`${role} OTP verification`, verifyResponse.status, { body: verifyResponse.body })
  );

  if (verifyResponse.status !== 200 || verifyResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} OTP verification failed`), { steps });
  }

  return {
    steps,
    token: verifyResponse.body.data?.token,
    user: verifyResponse.body.data?.user,
  };
}

async function registerService({ token, serviceType, payload }) {
  return retry(() =>
    request(app)
      .post(`/api/services/${serviceType}/providers`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(payload)
  );
}

async function runLoadTest({ url, method = 'GET', headers = {}, body = null, duration = 10, connections = 50 }) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      { url, method, headers, body, duration, connections, connectionRate: connections },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    autocannon.track(instance);
  });
}

async function run() {
  const steps = [];
  const userPhone = generatePhoneNumber();
  const providerPhone = generatePhoneNumber();

  let userId = null;
  let providerUserId = null;
  let providerServiceId = null;
  let pricingPlanId = null;

  const baseUrl = 'http://localhost:5000';
  const loadDuration = parseInt(process.env.LOAD_DURATION || '10'); // seconds
  const loadConnections = parseInt(process.env.LOAD_CONNECTIONS || '5');

  try {
    // 1. Sign up user
    const userResult = await signUp({
      phone: userPhone,
      email: `perf.user.${Date.now()}@example.com`,
      fullName: 'Performance User',
      password: 'PerfUser@123',
      role: 'user',
      otp: USER_OTP,
    });
    steps.push(...userResult.steps);
    userId = userResult.user.id;
    const userToken = userResult.token;

    // 2. Sign up provider
    const providerResult = await signUp({
      phone: providerPhone,
      email: `perf.provider.${Date.now()}@example.com`,
      fullName: 'Performance Provider',
      password: 'PerfProv@123',
      role: 'provider',
      otp: PROVIDER_OTP,
    });
    steps.push(...providerResult.steps);
    providerUserId = providerResult.user.id;
    const providerToken = providerResult.token;

    // 3. Register services
    const laborPayload = {
      yearsOfExperience: 4,
      serviceDescription: 'Load testing labor service',
      serviceChargeValue: 299,
      serviceChargeUnit: 'per_day',
      state: 'PerformanceState',
      fullAddress: '99 Load Lane',
      workingProofUrls: [],
      isEngineeringProvider: false,
    };
    const laborResponse = await registerService({ token: providerToken, serviceType: 'labor', payload: laborPayload });
    steps.push(logStep('Register labor service', laborResponse.status, { body: laborResponse.body }));
    providerServiceId = laborResponse.body.data?.providerService?.id;

    const paidPayload = {
      yearsOfExperience: 8,
      serviceDescription: 'Paid service for payment load test',
      serviceChargeValue: 899,
      serviceChargeUnit: 'per_project',
      state: 'PaymentState',
      fullAddress: '101 Payment Plaza',
      workingProofUrls: [],
      isEngineeringProvider: false,
    };
    const paidResponse = await registerService({ token: providerToken, serviceType: 'plumber', payload: paidPayload });
    steps.push(logStep('Register paid service', paidResponse.status, { body: paidResponse.body }));
    pricingPlanId = paidResponse.body.data?.providerService?.defaultPricingPlanId;

    // 4. Load test booking creation
    const bookingPayload = JSON.stringify({
      providerServiceId,
      selectedService: 'Load test booking',
      appointmentDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      appointmentTime: '14:00',
    });
    const bookingTest = await runLoadTest({
      url: `${baseUrl}/api/bookings`,
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: bookingPayload,
      duration: loadDuration,
      connections: loadConnections,
    });
    steps.push(
      logStep('Load test: booking creation', 200, {
        requests: bookingTest.requests,
        latency: bookingTest.latency,
        throughput: bookingTest.throughput,
        errors: bookingTest.errors,
      })
    );

    // 5. Load test notifications
    const notificationTest = await runLoadTest({
      url: `${baseUrl}/api/notifications`,
      method: 'GET',
      headers: { Authorization: `Bearer ${userToken}` },
      duration: loadDuration,
      connections: loadConnections,
    });
    steps.push(
      logStep('Load test: notification fetch', 200, {
        requests: notificationTest.requests,
        latency: notificationTest.latency,
        throughput: notificationTest.throughput,
      })
    );

    // 6. Sample API response times
    const apiEndpoints = [
      { label: 'Service list', method: 'GET', path: '/api/services', token: null, requiresAuth: false },
      { label: 'Provider services list', method: 'GET', path: '/api/services/my-registrations', token: providerToken, requiresAuth: true },
      { label: 'User notifications', method: 'GET', path: '/api/notifications', token: userToken, requiresAuth: true },
    ];
    for (const endpoint of apiEndpoints) {
      const start = Date.now();
      let reqBuilder = endpoint.method === 'GET' ? request(app).get(endpoint.path) : request(app).post(endpoint.path);
      if (endpoint.requiresAuth) reqBuilder.set('Authorization', `Bearer ${endpoint.token}`);
      const response = await reqBuilder;
      steps.push(logStep(`API response: ${endpoint.label}`, response.status, { durationMs: Date.now() - start }));
      if (![200, 201].includes(response.status)) throw new Error(`API ${endpoint.label} returned status ${response.status}`);
    }

    // 7. Memory snapshot
    const memoryUsage = process.memoryUsage();
    steps.push(
      logStep('Memory usage', 200, {
        rssMB: +(memoryUsage.rss / 1024 / 1024).toFixed(2),
        heapUsedMB: +(memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
      })
    );

    // 8. Final readiness review
    const failedSteps = steps.filter((s) => s.status >= 400);
    const readiness = failedSteps.length === 0 ? '✅ Application is production-ready' : '❌ Issues detected';
    steps.push(logStep('Readiness review', failedSteps.length === 0 ? 200 : 500, { failedSteps: failedSteps.map((s) => s.label) }));

    return { success: failedSteps.length === 0, steps };
  } catch (error) {
    steps.push(logStep('Test failure', 500, { error: error.message, stack: error.stack }));
    return { success: false, steps };
  } finally {
    await cleanupUser(userId, sanitizePhone(userPhone), 'user');
    await cleanupUser(providerUserId, sanitizePhone(providerPhone), 'provider');
  }
}

(async () => {
  const result = await run();
  console.log('🚀 Production Readiness Test Suite');
  console.log('Result:', result.success ? '✅ PASS' : '❌ FAIL');
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
    if (step.details) console.log(JSON.stringify(step.details, null, 2));
  }
  process.exit(result.success ? 0 : 1);
})();
