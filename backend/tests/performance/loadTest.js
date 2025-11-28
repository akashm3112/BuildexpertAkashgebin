/**
 * ============================================================================
 * COMPREHENSIVE API PERFORMANCE TESTING SUITE
 * Purpose: Load testing and performance auditing for all API endpoints
 * Features: Concurrent requests, response time measurement, throughput analysis
 * ============================================================================
 */

// Use built-in fetch in Node 18+ or fallback to node-fetch
let fetch;
try {
  fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
  fetch = require('node-fetch');
}
const crypto = require('crypto');
const { performance } = require('perf_hooks');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS || '10');
const REQUESTS_PER_ENDPOINT = parseInt(process.env.REQUESTS_PER_ENDPOINT || '50');
const TIMEOUT_MS = 30000; // 30 seconds

// Test results storage
const results = {
  endpoints: [],
  summary: {
    totalEndpoints: 0,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    minResponseTime: Infinity,
    maxResponseTime: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    throughput: 0,
    errorRate: 0,
    statusCodes: {},
    slowEndpoints: [],
    errorEndpoints: []
  }
};

// Helper: Generate test data
function generateTestData(type) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  
  switch (type) {
    case 'phone':
      return `9${Math.floor(Math.random() * 1000000000)}`;
    case 'email':
      return `test_${timestamp}_${random}@test.com`;
    case 'password':
      return 'Test123!@#';
    case 'name':
      return `Test User ${timestamp}`;
    case 'uuid':
      return crypto.randomUUID();
    default:
      return `${timestamp}_${random}`;
  }
}

// Helper: Make HTTP request and measure performance
async function makeRequest(method, url, headers = {}, body = null) {
  const startTime = performance.now();
  let statusCode = 0;
  let responseTime = 0;
  let error = null;
  let responseSize = 0;

  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: TIMEOUT_MS
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    statusCode = response.status;
    responseTime = performance.now() - startTime;

    // Try to get response body size
    try {
      const text = await response.text();
      responseSize = Buffer.byteLength(text, 'utf8');
    } catch (e) {
      // Ignore body read errors
    }

    return {
      statusCode,
      responseTime,
      responseSize,
      success: statusCode >= 200 && statusCode < 400,
      error: null
    };
  } catch (err) {
    responseTime = performance.now() - startTime;
    return {
      statusCode: 0,
      responseTime,
      responseSize: 0,
      success: false,
      error: err.message
    };
  }
}

// Test endpoint with multiple concurrent requests
async function testEndpoint(endpoint) {
  const {
    method,
    path,
    description,
    authRequired = false,
    bodyGenerator = null,
    headers = {}
  } = endpoint;

  const url = `${BASE_URL}${path}`;
  const measurements = [];

  console.log(`\n🧪 Testing: ${method} ${path}`);
  console.log(`   Description: ${description || 'No description'}`);

  // Generate auth token if needed (simplified - would need actual login in real test)
  let authHeaders = { ...headers };
  if (authRequired) {
    // In real scenario, you'd get a valid token here
    // For now, we'll test and expect 401
    authHeaders['Authorization'] = 'Bearer invalid_token_for_testing';
  }

  // Run concurrent requests
  const promises = [];
  for (let i = 0; i < REQUESTS_PER_ENDPOINT; i++) {
    const body = bodyGenerator ? bodyGenerator() : null;
    promises.push(makeRequest(method, url, authHeaders, body));
  }

  const responses = await Promise.all(promises);

  // Calculate statistics
  const successful = responses.filter(r => r.success);
  const failed = responses.filter(r => !r.success);
  const responseTimes = responses.map(r => r.responseTime).sort((a, b) => a - b);

  const stats = {
    endpoint: `${method} ${path}`,
    description,
    totalRequests: REQUESTS_PER_ENDPOINT,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    successRate: (successful.length / REQUESTS_PER_ENDPOINT * 100).toFixed(2),
    averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    p50: responseTimes[Math.floor(responseTimes.length * 0.5)] || 0,
    p95: responseTimes[Math.floor(responseTimes.length * 0.95)] || 0,
    p99: responseTimes[Math.floor(responseTimes.length * 0.99)] || 0,
    throughput: (successful.length / (Math.max(...responseTimes) / 1000)).toFixed(2),
    statusCodes: {},
    errors: [],
    averageResponseSize: 0
  };

  // Count status codes
  responses.forEach(r => {
    const code = r.statusCode || 'TIMEOUT';
    stats.statusCodes[code] = (stats.statusCodes[code] || 0) + 1;
  });

  // Collect errors
  failed.forEach(r => {
    if (r.error) {
      stats.errors.push(r.error);
    }
  });

  // Calculate average response size
  const sizes = responses.map(r => r.responseSize);
  stats.averageResponseSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

  results.endpoints.push(stats);
  
  // Update summary
  results.summary.totalEndpoints++;
  results.summary.totalRequests += REQUESTS_PER_ENDPOINT;
  results.summary.successfulRequests += successful.length;
  results.summary.failedRequests += failed.length;

  // Update status code counts
  Object.keys(stats.statusCodes).forEach(code => {
    results.summary.statusCodes[code] = 
      (results.summary.statusCodes[code] || 0) + stats.statusCodes[code];
  });

  // Identify slow endpoints (>1 second average)
  if (stats.averageResponseTime > 1000) {
    results.summary.slowEndpoints.push({
      endpoint: `${method} ${path}`,
      averageTime: stats.averageResponseTime.toFixed(2),
      p95: stats.p95.toFixed(2)
    });
  }

  // Identify error endpoints (>50% failure rate)
  if (stats.failedRequests / stats.totalRequests > 0.5) {
    results.summary.errorEndpoints.push({
      endpoint: `${method} ${path}`,
      errorRate: stats.successRate,
      errors: [...new Set(stats.errors)].slice(0, 3)
    });
  }

  console.log(`   ✅ Success: ${stats.successfulRequests}/${stats.totalRequests} (${stats.successRate}%)`);
  console.log(`   ⏱️  Avg Response: ${stats.averageResponseTime.toFixed(2)}ms`);
  console.log(`   📊 P95: ${stats.p95.toFixed(2)}ms, P99: ${stats.p99.toFixed(2)}ms`);

  return stats;
}

// Define all API endpoints to test
const endpoints = [
  // Health & Monitoring
  { method: 'GET', path: '/health', description: 'Health check endpoint' },
  { method: 'GET', path: '/health/db', description: 'Database health check' },
  { method: 'GET', path: '/health/gc', description: 'Garbage collection stats' },
  
  // Auth Endpoints (Public)
  {
    method: 'POST',
    path: '/api/auth/signup',
    description: 'User signup',
    bodyGenerator: () => ({
      fullName: generateTestData('name'),
      email: generateTestData('email'),
      phone: generateTestData('phone'),
      password: generateTestData('password'),
      role: 'user'
    })
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    description: 'User login',
    bodyGenerator: () => ({
      phone: '9999999999',
      password: 'test123',
      role: 'user'
    })
  },
  {
    method: 'POST',
    path: '/api/auth/send-otp',
    description: 'Send OTP',
    bodyGenerator: () => ({
      phone: generateTestData('phone')
    })
  },
  {
    method: 'POST',
    path: '/api/auth/verify-otp',
    description: 'Verify OTP',
    bodyGenerator: () => ({
      phone: generateTestData('phone'),
      otp: '123456'
    })
  },
  {
    method: 'POST',
    path: '/api/auth/forgot-password',
    description: 'Forgot password',
    bodyGenerator: () => ({
      phone: generateTestData('phone'),
      role: 'user'
    })
  },
  {
    method: 'POST',
    path: '/api/auth/refresh',
    description: 'Refresh token',
    bodyGenerator: () => ({
      refreshToken: 'test_refresh_token'
    })
  },

  // Public Endpoints
  { method: 'GET', path: '/api/public/services', description: 'Get all services' },
  { method: 'GET', path: '/api/public/providers', description: 'Get all providers' },
  { method: 'GET', path: '/api/public/services/:id', description: 'Get service by ID', path: '/api/public/services/1' },

  // Auth Required Endpoints (will test with invalid token to measure auth overhead)
  { method: 'GET', path: '/api/auth/me', description: 'Get current user', authRequired: true },
  { method: 'GET', path: '/api/users/profile', description: 'Get user profile', authRequired: true },
  { method: 'GET', path: '/api/users/addresses', description: 'Get user addresses', authRequired: true },
  { method: 'GET', path: '/api/bookings', description: 'Get user bookings', authRequired: true },
  { method: 'GET', path: '/api/services', description: 'Get services', authRequired: true },
  { method: 'GET', path: '/api/providers', description: 'Get providers', authRequired: true },
  { method: 'GET', path: '/api/notifications', description: 'Get notifications', authRequired: true },
  { method: 'GET', path: '/api/earnings', description: 'Get earnings', authRequired: true },

  // POST endpoints (will test with sample data)
  {
    method: 'POST',
    path: '/api/bookings',
    description: 'Create booking',
    authRequired: true,
    bodyGenerator: () => ({
      providerServiceId: 1,
      appointmentDate: new Date().toISOString(),
      appointmentTime: '10:00',
      address: 'Test Address',
      description: 'Test booking'
    })
  },
  {
    method: 'POST',
    path: '/api/services',
    description: 'Register service',
    authRequired: true,
    bodyGenerator: () => ({
      serviceId: 1,
      serviceChargeValue: 100,
      serviceChargeUnit: 'per_hour'
    })
  }
];

// Main test execution
async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 BUILDXPERT API PERFORMANCE TESTING SUITE');
  console.log('='.repeat(80));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Requests per Endpoint: ${REQUESTS_PER_ENDPOINT}`);
  console.log(`Total Endpoints to Test: ${endpoints.length}`);
  console.log('='.repeat(80));

  const startTime = performance.now();

  // Test each endpoint
  for (const endpoint of endpoints) {
    try {
      await testEndpoint(endpoint);
      // Small delay between endpoint tests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`❌ Error testing ${endpoint.method} ${endpoint.path}:`, error.message);
    }
  }

  const totalTime = performance.now() - startTime;

  // Calculate summary statistics
  const allResponseTimes = results.endpoints.flatMap(e => {
    const times = [];
    for (let i = 0; i < e.successfulRequests; i++) {
      times.push(e.averageResponseTime);
    }
    return times;
  }).sort((a, b) => a - b);

  if (allResponseTimes.length > 0) {
    results.summary.averageResponseTime = 
      allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
    results.summary.minResponseTime = Math.min(...allResponseTimes);
    results.summary.maxResponseTime = Math.max(...allResponseTimes);
    results.summary.p50 = allResponseTimes[Math.floor(allResponseTimes.length * 0.5)];
    results.summary.p95 = allResponseTimes[Math.floor(allResponseTimes.length * 0.95)];
    results.summary.p99 = allResponseTimes[Math.floor(allResponseTimes.length * 0.99)];
  }

  results.summary.throughput = (results.summary.successfulRequests / (totalTime / 1000)).toFixed(2);
  results.summary.errorRate = ((results.summary.failedRequests / results.summary.totalRequests) * 100).toFixed(2);

  // Generate report
  generateReport(totalTime);
}

// Generate comprehensive audit report
function generateReport(totalTime) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PERFORMANCE AUDIT REPORT');
  console.log('='.repeat(80));

  console.log('\n📈 SUMMARY STATISTICS');
  console.log('-'.repeat(80));
  console.log(`Total Endpoints Tested: ${results.summary.totalEndpoints}`);
  console.log(`Total Requests: ${results.summary.totalRequests}`);
  console.log(`Successful Requests: ${results.summary.successfulRequests}`);
  console.log(`Failed Requests: ${results.summary.failedRequests}`);
  console.log(`Success Rate: ${((results.summary.successfulRequests / results.summary.totalRequests) * 100).toFixed(2)}%`);
  console.log(`Error Rate: ${results.summary.errorRate}%`);
  console.log(`Total Test Duration: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${results.summary.throughput} req/s`);

  console.log('\n⏱️  RESPONSE TIME STATISTICS');
  console.log('-'.repeat(80));
  console.log(`Average Response Time: ${results.summary.averageResponseTime.toFixed(2)}ms`);
  console.log(`Min Response Time: ${results.summary.minResponseTime.toFixed(2)}ms`);
  console.log(`Max Response Time: ${results.summary.maxResponseTime.toFixed(2)}ms`);
  console.log(`P50 (Median): ${results.summary.p50.toFixed(2)}ms`);
  console.log(`P95: ${results.summary.p95.toFixed(2)}ms`);
  console.log(`P99: ${results.summary.p99.toFixed(2)}ms`);

  console.log('\n📊 STATUS CODE DISTRIBUTION');
  console.log('-'.repeat(80));
  Object.keys(results.summary.statusCodes)
    .sort((a, b) => results.summary.statusCodes[b] - results.summary.statusCodes[a])
    .forEach(code => {
      const count = results.summary.statusCodes[code];
      const percentage = ((count / results.summary.totalRequests) * 100).toFixed(2);
      console.log(`  ${code}: ${count} (${percentage}%)`);
    });

  if (results.summary.slowEndpoints.length > 0) {
    console.log('\n🐌 SLOW ENDPOINTS (>1000ms average)');
    console.log('-'.repeat(80));
    results.summary.slowEndpoints
      .sort((a, b) => parseFloat(b.averageTime) - parseFloat(a.averageTime))
      .forEach(ep => {
        console.log(`  ${ep.endpoint}`);
        console.log(`    Average: ${ep.averageTime}ms, P95: ${ep.p95}ms`);
      });
  }

  if (results.summary.errorEndpoints.length > 0) {
    console.log('\n❌ ERROR-PRONE ENDPOINTS (>50% failure rate)');
    console.log('-'.repeat(80));
    results.summary.errorEndpoints.forEach(ep => {
      console.log(`  ${ep.endpoint}`);
      console.log(`    Success Rate: ${ep.errorRate}%`);
      if (ep.errors.length > 0) {
        console.log(`    Common Errors: ${ep.errors.join(', ')}`);
      }
    });
  }

  // Performance ratings
  console.log('\n🎯 PERFORMANCE RATINGS');
  console.log('-'.repeat(80));
  
  const avgTime = results.summary.averageResponseTime;
  let rating = 'Excellent';
  if (avgTime > 500) rating = 'Good';
  if (avgTime > 1000) rating = 'Acceptable';
  if (avgTime > 2000) rating = 'Poor';
  if (avgTime > 5000) rating = 'Critical';

  console.log(`Overall Performance: ${rating} (${avgTime.toFixed(2)}ms average)`);
  
  const p95Rating = results.summary.p95 < 1000 ? 'Excellent' :
                    results.summary.p95 < 2000 ? 'Good' :
                    results.summary.p95 < 5000 ? 'Acceptable' : 'Poor';
  console.log(`P95 Performance: ${p95Rating} (${results.summary.p95.toFixed(2)}ms)`);

  const throughputRating = parseFloat(results.summary.throughput) > 100 ? 'Excellent' :
                          parseFloat(results.summary.throughput) > 50 ? 'Good' :
                          parseFloat(results.summary.throughput) > 10 ? 'Acceptable' : 'Poor';
  console.log(`Throughput: ${throughputRating} (${results.summary.throughput} req/s)`);

  const errorRating = parseFloat(results.summary.errorRate) < 1 ? 'Excellent' :
                     parseFloat(results.summary.errorRate) < 5 ? 'Good' :
                     parseFloat(results.summary.errorRate) < 10 ? 'Acceptable' : 'Poor';
  console.log(`Error Rate: ${errorRating} (${results.summary.errorRate}%)`);

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('-'.repeat(80));
  
  if (results.summary.slowEndpoints.length > 0) {
    console.log('⚠️  Optimize slow endpoints:');
    results.summary.slowEndpoints.slice(0, 5).forEach(ep => {
      console.log(`   - ${ep.endpoint}: Consider caching, database query optimization, or async processing`);
    });
  }

  if (parseFloat(results.summary.errorRate) > 10) {
    console.log('⚠️  High error rate detected. Review error logs and endpoint implementations.');
  }

  if (results.summary.p95 > 2000) {
    console.log('⚠️  95% of requests exceed 2 seconds. Consider horizontal scaling or optimization.');
  }

  if (parseFloat(results.summary.throughput) < 10) {
    console.log('⚠️  Low throughput detected. Consider connection pooling, caching, or load balancing.');
  }

  // Top 10 fastest and slowest endpoints
  const sortedEndpoints = [...results.endpoints]
    .sort((a, b) => a.averageResponseTime - b.averageResponseTime);

  if (sortedEndpoints.length > 0) {
    console.log('\n🏆 TOP 10 FASTEST ENDPOINTS');
    console.log('-'.repeat(80));
    sortedEndpoints.slice(0, 10).forEach((ep, index) => {
      console.log(`  ${index + 1}. ${ep.endpoint} - ${ep.averageResponseTime.toFixed(2)}ms`);
    });

    if (sortedEndpoints.length > 10) {
      console.log('\n🐌 TOP 10 SLOWEST ENDPOINTS');
      console.log('-'.repeat(80));
      sortedEndpoints.slice(-10).reverse().forEach((ep, index) => {
        console.log(`  ${index + 1}. ${ep.endpoint} - ${ep.averageResponseTime.toFixed(2)}ms (P95: ${ep.p95.toFixed(2)}ms)`);
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ PERFORMANCE TESTING COMPLETE');
  console.log('='.repeat(80) + '\n');
}

// Run the tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Fatal error during testing:', error);
    process.exit(1);
  });
}

module.exports = { runTests, endpoints, results };

