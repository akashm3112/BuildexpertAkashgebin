const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const USER_OTP = '112233';
const PROVIDER_OTP = '445566';
const SERVICE_CATEGORY = 'labor';

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
  if (bookingId) {
    await query('DELETE FROM bookings WHERE id = $1', [bookingId]).catch(() => {});
  }

  if (providerServiceId) {
    await query('DELETE FROM provider_services WHERE id = $1', [providerServiceId]).catch(() => {});
  }

  if (providerProfileId) {
    await query('DELETE FROM provider_profiles WHERE id = $1', [providerProfileId]).catch(() => {});
  }

  if (providerUserId) {
    await query('DELETE FROM addresses WHERE user_id = $1', [providerUserId]).catch(() => {});
    await query('DELETE FROM notifications WHERE user_id = $1', [providerUserId]).catch(() => {});
    await query('DELETE FROM user_sessions WHERE user_id = $1::uuid', [providerUserId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [providerUserId]).catch(() => {});
  }

  if (userId) {
    await query('DELETE FROM notifications WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM user_sessions WHERE user_id = $1::uuid', [userId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }

  if (userPhone) {
    deletePendingSignup(userPhone, 'user');
  }
  if (providerPhone) {
    deletePendingSignup(providerPhone, 'provider');
  }
}

async function signUpAndVerify({ phone, email, fullName, password, role, otp }) {
  const steps = [];

  const signupResponse = await request(app)
    .post('/api/auth/signup')
    .set('Content-Type', 'application/json')
    .send({
      fullName,
      email,
      phone,
      password,
      role,
    });

  steps.push(
    logStep(`${role} signup`, signupResponse.status, {
      body: signupResponse.body,
    })
  );

  if (signupResponse.status !== 200 || signupResponse.body.status !== 'success') {
    throw Object.assign(new Error(`${role} signup failed`), { steps });
  }

  storeOTP(sanitizePhone(phone), otp);

  const verifyResponse = await request(app)
    .post('/api/auth/verify-otp')
    .set('Content-Type', 'application/json')
    .send({ phone, otp });

  steps.push(
    logStep(`${role} OTP verification`, verifyResponse.status, {
      body: verifyResponse.body,
    })
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

async function registerProviderService({ token, yearsOfExperience = 5 }) {
  const response = await request(app)
    .post(`/api/services/${SERVICE_CATEGORY}/providers`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({
      yearsOfExperience,
      serviceDescription: 'Labor support for automation test bookings',
      serviceChargeValue: 499,
      serviceChargeUnit: 'per_project',
      state: 'Tamil Nadu',
      fullAddress: '42 Test Street, Chennai',
      workingProofUrls: [],
      isEngineeringProvider: false,
    });

  return response;
}

async function run() {
  const steps = [];
  const timestamp = Date.now();

  const userPhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const providerPhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;

  let userId = null;
  let providerUserId = null;
  let providerProfileId = null;
  let providerServiceId = null;
  let bookingId = null;

  try {
    // Step 1: Create user account
    const userResult = await signUpAndVerify({
      phone: userPhone,
      email: `qa.booking.user.${timestamp}@example.com`,
      fullName: 'QA Booking User',
      password: 'User@12345',
      role: 'user',
      otp: USER_OTP,
    }).catch((error) => {
      if (error.steps) {
        steps.push(...error.steps);
      }
      throw error;
    });
    steps.push(...userResult.steps);

    userId = userResult.user.id;
    const userToken = userResult.token;

    // Step 2: Create provider account and register service
    const providerResult = await signUpAndVerify({
      phone: providerPhone,
      email: `qa.booking.provider.${timestamp}@example.com`,
      fullName: 'QA Booking Provider',
      password: 'Provider@12345',
      role: 'provider',
      otp: PROVIDER_OTP,
    }).catch((error) => {
      if (error.steps) {
        steps.push(...error.steps);
      }
      throw error;
    });
    steps.push(...providerResult.steps);

    providerUserId = providerResult.user.id;
    const providerToken = providerResult.token;

    const registerResponse = await registerProviderService({ token: providerToken });
    steps.push(
      logStep('Provider service registration (labor)', registerResponse.status, {
        body: registerResponse.body,
      })
    );

    if (registerResponse.status !== 201 || registerResponse.body.status !== 'success') {
      throw new Error('Provider service registration failed');
    }

    providerServiceId = registerResponse.body.data?.providerService?.id;
    providerProfileId = registerResponse.body.data?.providerService?.provider_id;

    if (!providerServiceId) {
      throw new Error('Provider service ID missing from registration response');
    }

    // Verify service is active (labor should auto-activate)
    const serviceRow = await query(
      'SELECT * FROM provider_services WHERE id = $1',
      [providerServiceId]
    );
    if (serviceRow.rows.length === 0 || serviceRow.rows[0].payment_status !== 'active') {
      throw new Error('Provider service is not active for booking');
    }

    // Step 3: User creates a booking
    const appointmentDateObj = new Date();
    appointmentDateObj.setDate(appointmentDateObj.getDate() + 1);
    const appointmentDate = appointmentDateObj.toISOString().split('T')[0];
    const appointmentTime = '10:30';

    const bookingResponse = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Content-Type', 'application/json')
      .send({
        providerServiceId,
        selectedService: 'Skilled labor assistance',
        appointmentDate,
        appointmentTime,
      });

    steps.push(
      logStep('Booking creation', bookingResponse.status, {
        body: bookingResponse.body,
      })
    );

    if (bookingResponse.status !== 201 || bookingResponse.body.status !== 'success') {
      throw new Error('Booking creation failed');
    }

    bookingId = bookingResponse.body.data?.booking?.id;
    if (!bookingId) {
      throw new Error('Missing booking ID in creation response');
    }

    // Step 4: Fetch booking list for user
    const listResponse = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`);

    steps.push(
      logStep('Booking list retrieval', listResponse.status, {
        body: listResponse.body,
      })
    );

    if (listResponse.status !== 200 || listResponse.body.status !== 'success') {
      throw new Error('Booking list retrieval failed');
    }

    const bookingInList = listResponse.body.data?.bookings?.find(
      (booking) => booking.id === bookingId
    );
    if (!bookingInList) {
      throw new Error('New booking not found in booking list');
    }

    // Step 5: Fetch booking details
    const detailResponse = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${userToken}`);

    steps.push(
      logStep('Booking detail retrieval', detailResponse.status, {
        body: detailResponse.body,
      })
    );

    if (detailResponse.status !== 200 || detailResponse.body.status !== 'success') {
      throw new Error('Booking detail retrieval failed');
    }

    // Step 6: Cancel booking
    const cancelResponse = await request(app)
      .put(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Content-Type', 'application/json')
      .send({
        cancellationReason: 'Automated test cleanup',
      });

    steps.push(
      logStep('Booking cancellation', cancelResponse.status, {
        body: cancelResponse.body,
      })
    );

    if (cancelResponse.status !== 200 || cancelResponse.body.status !== 'success') {
      throw new Error('Booking cancellation failed');
    }

    // Verify cancellation in database
    const bookingRow = await query('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    if (bookingRow.rows.length === 0 || bookingRow.rows[0].status !== 'cancelled') {
      throw new Error('Booking status did not update to cancelled');
    }

    return {
      success: true,
      steps,
    };
  } catch (error) {
    steps.push(
      logStep('Test failure', 500, {
        error: error.message,
        stack: error.stack,
      })
    );
    return {
      success: false,
      steps,
    };
  } finally {
    await cleanup({
      userId,
      providerUserId,
      providerProfileId,
      providerServiceId,
      bookingId,
      userPhone: sanitizePhone(userPhone),
      providerPhone: sanitizePhone(providerPhone),
    });
  }
}

(async () => {
  const result = await run();
  console.log('Functional Test: Booking Creation & Management');
  console.log('Result:', result.success ? '✅ PASS' : '❌ FAIL');
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
    if (step.details) {
      console.log(JSON.stringify(step.details, null, 2));
    }
  }
  process.exit(result.success ? 0 : 1);
})();

