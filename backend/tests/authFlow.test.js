const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const TEST_OTP = '123456';

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const logStep = (label, status, details = {}) => ({
  label,
  status,
  details,
});

async function cleanup(userId, phone, role) {
  if (userId) {
    await query('DELETE FROM notifications WHERE user_id = $1', [userId]).catch(() => {});
    await query('DELETE FROM user_sessions WHERE user_id = $1::uuid', [userId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
  if (phone && role) {
    deletePendingSignup(phone, role);
  }
}

async function run() {
  const steps = [];
  const timestamp = Date.now();
  const phone = `9${Math.floor(100000000 + Math.random() * 900000000)}`; // 10-digit starting with 9
  const email = `qa.user.${timestamp}@example.com`;
  const password = 'Test@1234';
  const role = 'user';
  const fullName = 'QA Automation';

  let createdUserId = null;
  let readinessScore = 0;
  const totalChecks = 6;

  try {
    // 1️⃣ Signup Request
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

    steps.push(logStep('Signup API', signupResponse.status, { body: signupResponse.body }));

    if (signupResponse.status === 200 && signupResponse.body.status === 'success') {
      readinessScore++;
    } else {
      throw new Error('Signup failed');
    }

    // 2️⃣ OTP Verification
    const sanitizedPhone = sanitizePhone(phone);
    storeOTP(sanitizedPhone, TEST_OTP);

    const verifyResponse = await request(app)
      .post('/api/auth/verify-otp')
      .set('Content-Type', 'application/json')
      .send({
        phone,
        otp: TEST_OTP,
      });

    steps.push(logStep('Verify OTP API', verifyResponse.status, { body: verifyResponse.body }));

    if (verifyResponse.status === 200 && verifyResponse.body.status === 'success') {
      readinessScore++;
    } else {
      throw new Error('OTP verification failed');
    }

    createdUserId = verifyResponse.body.data?.user?.id;

    // 3️⃣ Login with Valid Credentials
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({
        phone,
        password,
        role,
      });

    steps.push(logStep('Login API (valid credentials)', loginResponse.status, { body: loginResponse.body }));

    if (loginResponse.status === 200 && loginResponse.body.status === 'success') {
      readinessScore++;
    } else {
      throw new Error('Login with valid credentials failed');
    }

    // 4️⃣ Login with Invalid Password
    const invalidLoginResponse = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({
        phone,
        password: 'WrongPassword!',
        role,
      });

    steps.push(logStep('Login API (invalid password)', invalidLoginResponse.status, { body: invalidLoginResponse.body }));

    if (invalidLoginResponse.status === 401) {
      readinessScore++;
    } else {
      throw new Error('Invalid login did not return 401 as expected');
    }

    // 5️⃣ Duplicate Signup Prevention
    const duplicateSignup = await request(app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')
      .send({
        fullName,
        email,
        phone,
        password,
        role,
      });

    steps.push(logStep('Duplicate Signup Prevention', duplicateSignup.status, { body: duplicateSignup.body }));

    if (duplicateSignup.status === 409 || duplicateSignup.body.status === 'error') {
      readinessScore++;
    } else {
      throw new Error('Duplicate signup did not return conflict/error');
    }

    // 6️⃣ Session Persistence Check
    const sessions = await query(
      'SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC',
      [createdUserId]
    );

    steps.push(logStep('Session Persistence Check', 200, { sessionCount: sessions.rows.length }));

    if (sessions.rows.length > 0) {
      readinessScore++;
    } else {
      throw new Error('No session record found');
    }

    const readinessPercent = Math.round((readinessScore / totalChecks) * 100);

    return {
      success: true,
      readinessPercent,
      steps,
    };
  } catch (error) {
    steps.push(logStep('Test Failure', 500, { error: error.message, stack: error.stack }));
    return { success: false, readinessPercent: 0, steps };
  } finally {
    await cleanup(createdUserId, sanitizePhone(phone), role);
  }
}

(async () => {
  const result = await run();
  console.log('Functional Test: User Registration & Login');
  console.log('---------------------------------------------------');
  console.log('Result:', result.success ? '✅ PASS' : '❌ FAIL');
  console.log(`Readiness Score: ${result.readinessPercent}%`);
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
    if (step.details) {
      console.log(JSON.stringify(step.details, null, 2));
    }
  }

  if (result.readinessPercent >= 90) {
    console.log('\n🚀 Application is functionally ready for production deployment.');
  } else {
    console.log('\n⚠️ Functional readiness below threshold — review API behavior.');
  }

  process.exit(result.success ? 0 : 1);
})();
