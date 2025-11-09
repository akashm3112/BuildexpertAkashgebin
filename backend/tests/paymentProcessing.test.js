const request = require('supertest');
const { app } = require('../server');
const { storeOTP, deletePendingSignup } = require('../utils/otp');
const { query } = require('../database/connection');

const PROVIDER_OTP = '778899';
const SERVICE_CATEGORY = 'plumber';
const PAYMENT_AMOUNT = 99;

const sanitizePhone = (phone) =>
  phone.replace(/^\+/, '').replace(/^1/, '').replace(/^91/, '');

const logStep = (label, status, details = {}) => ({
  label,
  status,
  details,
});

async function cleanup({
  providerUserId,
  providerProfileId,
  providerServiceId,
  paymentTransactionId,
  providerPhone,
}) {
  if (paymentTransactionId) {
    await query('DELETE FROM payment_transactions WHERE id = $1', [paymentTransactionId]).catch(() => {});
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
    await query('DELETE FROM payment_locks WHERE user_id = $1::text', [providerUserId]).catch(() => {});
    await query('DELETE FROM users WHERE id = $1', [providerUserId]).catch(() => {});
  }

  if (providerPhone) {
    deletePendingSignup(providerPhone, 'provider');
  }
}

async function signUpProvider({ phone, email, fullName, password, otp }) {
  const steps = [];

  const signupResponse = await request(app)
    .post('/api/auth/signup')
    .set('Content-Type', 'application/json')
    .send({
      fullName,
      email,
      phone,
      password,
      role: 'provider',
    });

  steps.push(
    logStep('Provider signup', signupResponse.status, {
      body: signupResponse.body,
    })
  );

  if (signupResponse.status !== 200 || signupResponse.body.status !== 'success') {
    throw Object.assign(new Error('Provider signup failed'), { steps });
  }

  storeOTP(sanitizePhone(phone), otp);

  const verifyResponse = await request(app)
    .post('/api/auth/verify-otp')
    .set('Content-Type', 'application/json')
    .send({
      phone,
      otp,
    });

  steps.push(
    logStep('Provider OTP verification', verifyResponse.status, {
      body: verifyResponse.body,
    })
  );

  if (verifyResponse.status !== 200 || verifyResponse.body.status !== 'success') {
    throw Object.assign(new Error('Provider OTP verification failed'), { steps });
  }

  return {
    steps,
    token: verifyResponse.body.data?.token,
    user: verifyResponse.body.data?.user,
  };
}

async function registerPaidService({ token }) {
  return request(app)
    .post(`/api/services/${SERVICE_CATEGORY}/providers`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send({
      yearsOfExperience: 6,
      serviceDescription: 'Certified plumbing services for premium customers',
      serviceChargeValue: 1299,
      serviceChargeUnit: 'per_project',
      state: 'Maharashtra',
      fullAddress: '11 Payment Street, Mumbai',
      workingProofUrls: [],
      isEngineeringProvider: false,
    });
}

async function run() {
  const steps = [];
  const timestamp = Date.now();
  const providerPhone = `9${Math.floor(100000000 + Math.random() * 900000000)}`;

  let providerUserId = null;
  let providerProfileId = null;
  let providerServiceId = null;
  let paymentTransactionId = null;

  try {
    // Step 1: Provider signup & verification
    const providerResult = await signUpProvider({
      phone: providerPhone,
      email: `qa.payment.provider.${timestamp}@example.com`,
      fullName: 'QA Payment Provider',
      password: 'ProviderPay@123',
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

    // Step 2: Register paid service (plumber)
    const registerResponse = await registerPaidService({ token: providerToken });
    steps.push(
      logStep('Provider paid service registration', registerResponse.status, {
        body: registerResponse.body,
      })
    );

    if (registerResponse.status !== 201 || registerResponse.body.status !== 'success') {
      throw new Error('Paid service registration failed');
    }

    const servicePayload = registerResponse.body.data?.providerService;
    if (!servicePayload || !servicePayload.id) {
      throw new Error('Provider service data missing from response');
    }

    providerServiceId = servicePayload.id;
    providerProfileId = servicePayload.provider_id;

    if (servicePayload.payment_status !== 'pending') {
      throw new Error('Expected initial payment status to be pending for paid service');
    }

    const pricingPlanId = servicePayload.defaultPricingPlanId;

    // Step 3: Initiate Paytm payment
    const paymentPayload = {
      providerServiceId,
      amount: PAYMENT_AMOUNT,
      serviceCategory: SERVICE_CATEGORY,
      serviceName: 'Premium Plumbing Service',
      pricingPlanId,
      currencyCode: 'INR',
    };

    const initiationResponse = await request(app)
      .post('/api/payments/initiate-paytm')
      .set('Authorization', `Bearer ${providerToken}`)
      .set('Content-Type', 'application/json')
      .send(paymentPayload);

    steps.push(
      logStep('Payment initiation', initiationResponse.status, {
        body: initiationResponse.body,
      })
    );

    if (initiationResponse.status !== 200 || initiationResponse.body.status !== 'success') {
      throw new Error('Payment initiation failed');
    }

    const { orderId, paytmUrl, paytmParams } = initiationResponse.body || {};
    if (!orderId || !paytmUrl || !paytmParams) {
      throw new Error('Missing Paytm initiation details');
    }

    // Step 4: Validate transaction in database
    const transactionResult = await query(
      `
        SELECT *
        FROM payment_transactions
        WHERE order_id = $1
      `,
      [orderId]
    );

    if (transactionResult.rows.length === 0) {
      throw new Error('Payment transaction record not found');
    }

    const transactionRow = transactionResult.rows[0];
    paymentTransactionId = transactionRow.id;

    steps.push(
      logStep('Payment transaction verification', 200, {
        status: transactionRow.status,
        amount: transactionRow.amount,
        currency: transactionRow.currency_code,
        pricingPlanId: transactionRow.pricing_plan_id,
      })
    );

    if (transactionRow.status !== 'pending') {
      throw new Error('Transaction status expected to be pending');
    }
    if (Number(transactionRow.amount) !== PAYMENT_AMOUNT) {
      throw new Error('Transaction amount mismatch');
    }
    if (transactionRow.pricing_plan_id !== pricingPlanId) {
      throw new Error('Pricing plan ID mismatch on transaction');
    }

    // Step 5: Verify transaction history endpoint
    const historyResponse = await request(app)
      .get('/api/payments/transaction-history')
      .set('Authorization', `Bearer ${providerToken}`);

    steps.push(
      logStep('Transaction history retrieval', historyResponse.status, {
        body: historyResponse.body,
      })
    );

    if (historyResponse.status !== 200 || historyResponse.body.status !== 'success') {
      throw new Error('Transaction history retrieval failed');
    }

    const transactions = historyResponse.body.data?.transactions || [];
    const transactionInHistory = transactions.find((t) => t.order_id === orderId);
    if (!transactionInHistory) {
      throw new Error('Transaction not present in history');
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
      providerUserId,
      providerProfileId,
      providerServiceId,
      paymentTransactionId,
      providerPhone: sanitizePhone(providerPhone),
    });
  }
}

(async () => {
  const result = await run();
  console.log('Functional Test: Payment Processing');
  console.log('Result:', result.success ? '✅ PASS' : '❌ FAIL');
  for (const step of result.steps) {
    console.log(`- ${step.label}: ${step.status}`);
    if (step.details) {
      console.log(JSON.stringify(step.details, null, 2));
    }
  }
  process.exit(result.success ? 0 : 1);
})();

