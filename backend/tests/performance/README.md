# 🚀 API Performance Testing Suite

Comprehensive performance testing and load testing suite for BuildXpert API endpoints.

## Quick Start

```bash
# 1. Start your server
npm run dev

# 2. In another terminal, run performance tests
npm run test:performance
```

## What It Tests

This suite tests all API endpoints for:

- ✅ Response time (average, min, max, percentiles)
- ✅ Throughput (requests per second)
- ✅ Error rates and status codes
- ✅ Concurrent request handling
- ✅ Performance bottlenecks

## Test Coverage

### Health Endpoints
- GET /health
- GET /health/db
- GET /health/gc

### Authentication Endpoints
- POST /api/auth/signup
- POST /api/auth/login
- POST /api/auth/send-otp
- POST /api/auth/verify-otp
- POST /api/auth/refresh
- POST /api/auth/forgot-password

### Public Endpoints
- GET /api/public/services
- GET /api/public/providers

### Protected Endpoints
- GET /api/auth/me
- GET /api/users/profile
- GET /api/users/addresses
- GET /api/bookings
- GET /api/services
- GET /api/providers
- GET /api/notifications
- GET /api/earnings

### Mutation Endpoints
- POST /api/bookings
- POST /api/services

## Configuration

### Environment Variables

```bash
BASE_URL=http://localhost:5000          # API base URL
CONCURRENT_REQUESTS=10                  # Concurrent requests per test
REQUESTS_PER_ENDPOINT=50                # Total requests per endpoint
```

### Custom Configuration

```bash
# Test against production
BASE_URL=https://api.buildxpert.com npm run test:performance

# More aggressive load testing
CONCURRENT_REQUESTS=50 REQUESTS_PER_ENDPOINT=200 npm run test:performance
```

## Output

The test suite generates:

1. **Real-time progress** - Shows each endpoint being tested
2. **Summary statistics** - Overall performance metrics
3. **Performance ratings** - Categorized performance assessment
4. **Recommendations** - Actionable optimization suggestions
5. **Top performers** - Fastest and slowest endpoints

## Understanding Results

### Response Time Categories

- **Excellent:** < 100ms - Optimal for production
- **Good:** 100-500ms - Acceptable for most use cases
- **Acceptable:** 500-1000ms - Should be optimized
- **Poor:** 1000-2000ms - Needs optimization
- **Critical:** > 2000ms - Requires immediate attention

### Percentiles

- **P50 (Median):** 50% of requests complete in this time or less
- **P95:** 95% of requests complete in this time or less
- **P99:** 99% of requests complete in this time or less

## Troubleshooting

### All Tests Failing

**Problem:** All requests return "fetch failed"

**Solution:**
1. Ensure server is running: `npm run dev`
2. Check server is listening on correct port (default: 5000)
3. Verify BASE_URL matches server address

### Timeout Errors

**Problem:** Tests timing out

**Solution:**
1. Check database connectivity
2. Review server logs for errors
3. Increase TIMEOUT_MS in loadTest.js if needed

### High Error Rates

**Problem:** Many requests returning 401/403/500

**Solution:**
1. This is expected for protected endpoints without valid tokens
2. Tests measure response time regardless of status code
3. For authenticated testing, update loadTest.js with valid tokens

## Performance Best Practices

1. **Run tests in production-like environment** when possible
2. **Test during low-traffic periods** for consistent results
3. **Run multiple test iterations** and average results
4. **Monitor server resources** (CPU, memory, database) during tests
5. **Compare results over time** to track performance regression

## Continuous Integration

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Performance Tests
  run: |
    npm run dev &
    sleep 5
    npm run test:performance
```

## Advanced Usage

### Programmatic Usage

```javascript
const { runTests, endpoints } = require('./tests/performance/loadTest');

// Run custom tests
runTests().then(results => {
  console.log('Performance results:', results);
});
```

### Extending Tests

Add new endpoints to test in `loadTest.js`:

```javascript
{
  method: 'GET',
  path: '/api/your-endpoint',
  description: 'Your endpoint description',
  authRequired: false,
  bodyGenerator: null // or function that returns test data
}
```

## Support

For issues or questions:
1. Check server logs
2. Review test output
3. Verify server is running and accessible
4. Check network connectivity

---

**Last Updated:** {{DATE}}  
**Test Suite Version:** 1.0.0

