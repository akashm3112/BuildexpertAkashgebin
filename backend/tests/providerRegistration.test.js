const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const TEST_OTP = '654321';
const SERVICE_CATEGORY = 'plumber';

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const logStep = (label, status, details = {}) => ({
  label,
  status,
  details,
});

async function cleanup(userId, providerProfileId, providerServiceId, phone) {
  if (providerServiceId) {
    await query('DELETE FROM provider_services WHERE id = $1', [providerServiceId]).catch(() => {});
  }
  if (providerProfileId) {
    await query('DELETE FROM provider_profiles WHERE id = $1', [providerProfileId]).catch(() => {});
  }
  if (userId) {
    await query('DELETE FROM addresses WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM notifications WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM user_sessions WHERE user_id = $1::uuid', [userId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
  if (phone) {
    deletePendingSignup(phone, 'provider');
  }
}

async function run() {
  const steps = [];
  const timestamp = Date.now();
  const rawPhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;
  const email = `qa.provider.${timestamp}@example.com`;
  const password = 'Provider@1234';
  const role = 'provider';
  const fullName = 'QA Provider Automation';

  let userId = null;
  let providerProfileId = null;
  let providerServiceId = null;

  try {
    // Step 1: Provider signup
    const signupResponse = await request(app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')
      .send({
        fullName,
        email,
        phone: rawPhone,
        password,
        role,
      });

    steps.push(
      logStep('Provider signup API', signupResponse.status, {
        body: signupResponse.body,
      })
    );

    if (signupResponse.status !== 200 || signupResponse.body.status !== 'success') {
      throw new Error('Provider signup failed');
    }

    // Override OTP for automated verification
    const sanitizedPhone = sanitizePhone(rawPhone);
    storeOTP(sanitizedPhone, TEST_OTP);

    // Step 2: Verify OTP for provider
    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({
        phone: rawPhone,
        otp: TEST_OTP,
      });

    steps.push(
      logStep('Provider verify OTP API', verifyResponse.status, {
        body: verifyResponse.body,
      })
    );

    if (verifyResponse.status !== 200 || verifyResponse.body.status !== 'success') {
      throw new Error('Provider OTP verification failed');
    }

    userId = verifyResponse.body.data?.user?.id;
    const authToken = verifyResponse.body.data?.token;
    if (!userId || !authToken) {
      throw new Error('Missing user ID or token after OTP verification');
    }

    // Step 3: Register provider for a paid service
    const registerPayload = {
      yearsOfExperience: 7,
      serviceDescription: 'Certified plumbing professional for residential & commercial projects',
      serviceChargeValue: 799,
      serviceChargeUnit: 'per_visit',
      state: 'Karnataka',
      fullAddress: '221B Baker Street, Bengaluru',
      workingProofUrls: [],
      isEngineeringProvider: false,
    };

    const registerResponse = await request(app)
      .post(`/api/services/${SERVICE_CATEGORY}/providers`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('Content-Type', 'application/json')
      .send(registerPayload);

    steps.push(
      logStep('Provider service registration API', registerResponse.status, {
        body: registerResponse.body,
      })
    );

    if (registerResponse.status !== 201 || registerResponse.body.status !== 'success') {
      throw new Error('Provider service registration failed');
    }

    const providerService = registerResponse.body.data?.providerService;
    if (!providerService || !providerService.id) {
      throw new Error('Missing provider service information in response');
    }

    providerServiceId = providerService.id;

    // Validate provider_services entry
    const serviceRowResult = await query(
      `
        SELECT ps.*, sm.name as service_name
        FROM provider_services ps
        JOIN services_master sm ON ps.service_id = sm.id
        WHERE ps.id = $1
      `,
      [providerServiceId]
    );

    if (serviceRowResult.rows.length === 0) {
      throw new Error('Provider service row not found in database');
    }

    const serviceRow = serviceRowResult.rows[0];
    providerProfileId = serviceRow.provider_id;

    steps.push(
      logStep('Provider service database verification', 200, {
        paymentStatus: serviceRow.payment_status,
        serviceChargeValue: serviceRow.service_charge_value,
        serviceName: serviceRow.service_name,
      })
    );

    if (serviceRow.payment_status !== 'pending') {
      throw new Error('Expected payment status to be pending');
    }
    if (Number(serviceRow.service_charge_value) !== registerPayload.serviceChargeValue) {
      throw new Error('Service charge value mismatch');
    }

    // Validate provider profile
    const profileRowResult = await query(
      'SELECT * FROM provider_profiles WHERE id = $1',
      [providerProfileId]
    );

    if (profileRowResult.rows.length === 0) {
      throw new Error('Provider profile not found in database');
    }

    const profileRow = profileRowResult.rows[0];
    steps.push(
      logStep('Provider profile verification', 200, {
        yearsOfExperience: profileRow.years_of_experience,
        serviceDescription: profileRow.service_description,
      })
    );

    if (profileRow.years_of_experience !== registerPayload.yearsOfExperience) {
      throw new Error('Provider profile years of experience mismatch');
    }

    return { success: true, steps };
  } catch (error) {
    steps.push(
      logStep('Test failure', 500, {
        error: error.message,
        stack: error.stack,
      })
    );
    return { success: false, steps };
  } finally {
    await cleanup(
      userId,
      providerProfileId,
      providerServiceId,
      sanitizePhone(rawPhone)
    );
  }
}

(async () => {
  const result = await run();
  console.log('Functional Test: Provider Service Registration');
  console.log('Result:', result.success ? '✅ PASS' : '❌ FAIL');
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
    if (step.details) {
      console.log(JSON.stringify(step.details, null, 2));
    }
  }
  process.exit(result.success ? 0 : 1);
})();

