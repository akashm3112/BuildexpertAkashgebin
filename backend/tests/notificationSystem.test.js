const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const USER_OTP = '334455';
const PROVIDER_OTP = '665577';
const LABOR_CATEGORY = 'labor';

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const logStep = (label, status, details = {}) => ({
  label,
  status,
  details,
});

async function cleanup({
  userId,
  providerUserId,
  providerProfileId,
  providerServiceId,
  bookingId,
  userPhone,
  providerPhone,
}) {
  const safeDelete = async (queryText, params) => {
    try { await query(queryText, params); } catch (e) {}
  };

  if (bookingId) await safeDelete('DELETE FROM bookings WHERE id = $1', [bookingId]);
  if (providerServiceId) await safeDelete('DELETE FROM provider_services WHERE id = $1', [providerServiceId]);
  if (providerProfileId) await safeDelete('DELETE FROM provider_profiles WHERE id = $1', [providerProfileId]);
  if (providerUserId) {
    await safeDelete('DELETE FROM addresses WHERE user_id = $1', [providerUserId]);
    await safeDelete('DELETE FROM notifications WHERE user_id = $1', [providerUserId]);
    await safeDelete('DELETE FROM user_sessions WHERE user_id = $1::uuid', [providerUserId]);
    await safeDelete('DELETE FROM users WHERE id = $1', [providerUserId]);
  }
  if (userId) {
    await safeDelete('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await safeDelete('DELETE FROM user_sessions WHERE user_id = $1::uuid', [userId]);
    await safeDelete('DELETE FROM users WHERE id = $1', [userId]);
  }
  if (userPhone) deletePendingSignup(userPhone, 'user');
  if (providerPhone) deletePendingSignup(providerPhone, 'provider');
}

async function signUp({ phone, email, fullName, password, role, otp }) {
  const steps = [];
  const signupResponse = await request(app).post('/api/auth/signup')
    .set('Content-Type', 'application/json')
    .send({ fullName, email, phone, password, role });

  steps.push(logStep(`${role} signup`, signupResponse.status, { body: signupResponse.body }));

  if (signupResponse.status !== 200 || signupResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} signup failed`), { steps });
  }

  storeOTP(sanitizePhone(phone), otp);

  const verifyResponse = await request(app).post('/api/auth/verify-otp')
    .set('Content-Type', 'application/json')
    .send({ phone, otp });

  steps.push(logStep(`${role} OTP verification`, verifyResponse.status, { body: verifyResponse.body }));

  if (verifyResponse.status !== 200 || verifyResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} OTP verification failed`), { steps });
  }

  return {
    steps,
    token: verifyResponse.body.data?.token,
    user: verifyResponse.body.data?.user,
  };
}

async function registerLaborService({ token }) {
  return request(app)
    .post(`/api/services/${LABOR_CATEGORY}/providers`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({
      yearsOfExperience: 4,
      serviceDescription: 'Labor support for notification testing',
      serviceChargeValue: 399,
      serviceChargeUnit: 'per_day',
      state: 'Telangana',
      fullAddress: '21 Notification Ave, Hyderabad',
      workingProofUrls: [],
      isEngineeringProvider: false,
    });
}

async function createBooking({ token, providerServiceId }) {
  const appointment = new Date();
  appointment.setDate(appointment.getDate() + 1);
  const appointmentDate = appointment.toISOString().split('T')[0];

  return request(app).post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({
      providerServiceId,
      selectedService: 'Notification check labor service',
      appointmentDate,
      appointmentTime: '11:00',
    });
}

async function cancelBooking({ token, bookingId }) {
  return request(app).put(`/api/bookings/${bookingId}/cancel`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({ cancellationReason: 'Notification test cleanup' });
}

async function run() {
  const steps = [];
  const timestamp = Date.now();

  const generatePhoneNumber = () => {
    let phone;
    do {
      phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
    } while (/^91/.test(phone));
    return phone;
  };

  const userPhone = generatePhoneNumber();
  const providerPhone = generatePhoneNumber();

  let userId = null, providerUserId = null, providerProfileId = null, providerServiceId = null, bookingId = null;

  try {
    const userResult = await signUp({
      phone: userPhone,
      email: `qa.notification.user.${timestamp}@example.com`,
      fullName: 'QA Notification User',
      password: 'UserNotify@123',
      role: 'user',
      otp: USER_OTP,
    });
    steps.push(...userResult.steps);
    userId = userResult.user.id;
    const userToken = userResult.token;

    const providerResult = await signUp({
      phone: providerPhone,
      email: `qa.notification.provider.${timestamp}@example.com`,
      fullName: 'QA Notification Provider',
      password: 'ProviderNotify@123',
      role: 'provider',
      otp: PROVIDER_OTP,
    });
    steps.push(...providerResult.steps);
    providerUserId = providerResult.user.id;
    const providerToken = providerResult.token;

    const registerResponse = await registerLaborService({ token: providerToken });
    steps.push(logStep('Provider labor service registration', registerResponse.status, { body: registerResponse.body }));

    if (registerResponse.status !== 201 || registerResponse.body.status !== 'success') {
      throw new Error('Labor service registration failed');
    }

    const service = registerResponse.body.data?.providerService;
    providerServiceId = service?.id;
    providerProfileId = service?.provider_id;

    const bookingResponse = await createBooking({ token: userToken, providerServiceId });
    steps.push(logStep('Booking creation', bookingResponse.status, { body: bookingResponse.body }));
    if (bookingResponse.status !== 201 || bookingResponse.body.status !== 'success') {
      throw new Error('Booking creation failed');
    }
    bookingId = bookingResponse.body.data?.booking?.id;

    // Notifications checks
    const listResponse = await request(app).get('/api/notifications')
      .set('Authorization', `Bearer ${userToken}`);
    steps.push(logStep('Notification list retrieval', listResponse.status, { body: listResponse.body }));

    const notifications = listResponse.body.data?.notifications || [];
    if (notifications.length === 0) throw new Error('Expected at least one notification');

    // Mark single as read
    const targetNotificationId = notifications[0].id;
    const markReadResponse = await request(app).put(`/api/notifications/${targetNotificationId}/mark-read`)
      .set('Authorization', `Bearer ${userToken}`);
    steps.push(logStep('Mark single notification as read', markReadResponse.status, { body: markReadResponse.body }));

    // Mark all as read
    const markAllResponse = await request(app).put('/api/notifications/mark-all-read')
      .set('Authorization', `Bearer ${userToken}`);
    steps.push(logStep('Mark all notifications as read', markAllResponse.status, { body: markAllResponse.body }));

    // Cancel booking
    const cancelResponse = await cancelBooking({ token: userToken, bookingId });
    steps.push(logStep('Booking cancellation', cancelResponse.status, { body: cancelResponse.body }));

    // Summary calculation
    const passedSteps = steps.filter(s => s.status >= 200 && s.status < 300).length;
    const failedSteps = steps.length - passedSteps;
    const readinessScore = ((passedSteps / steps.length) * 100).toFixed(2);

    return {
      success: failedSteps === 0,
      readinessScore,
      steps,
    };
  } catch (error) {
    steps.push(logStep('Test failure', 500, { error: error.message, stack: error.stack }));
    return {
      success: false,
      readinessScore: 0,
      steps,
    };
  } finally {
    await cleanup({ userId, providerUserId, providerProfileId, providerServiceId, bookingId, userPhone: sanitizePhone(userPhone), providerPhone: sanitizePhone(providerPhone) });
  }
}

(async () => {
  const result = await run();
  console.log('=== Functional Test: Notification System ===');
  console.log(`Production Readiness: ${result.success ? '✅ PASS' : '❌ FAIL'} (${result.readinessScore}% coverage)`);
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
  }
  process.exit(result.success ? 0 : 1);
})();
