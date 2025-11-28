#!/usr/bin/env node

/**
 * Performance Testing Runner
 * Runs comprehensive performance tests on all API endpoints
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../config.env') });
const { runTests } = require('./loadTest');

// Configuration
const config = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5000',
  concurrentRequests: parseInt(process.env.CONCURRENT_REQUESTS || '10'),
  requestsPerEndpoint: parseInt(process.env.REQUESTS_PER_ENDPOINT || '50')
};

console.log('🚀 Starting Performance Test Suite...');
console.log(`📡 Base URL: ${config.baseUrl}`);
console.log(`⚡ Concurrent Requests: ${config.concurrentRequests}`);
console.log(`📊 Requests per Endpoint: ${config.requestsPerEndpoint}`);
console.log('\n⏳ Waiting 2 seconds to ensure server is ready...\n');

// Wait a bit for server to be ready
setTimeout(() => {
  runTests()
    .then(() => {
      console.log('\n✅ Performance tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Performance tests failed:', error);
      process.exit(1);
    });
}, 2000);

