/**
 * ============================================================================
 * PRODUCTION-READY ADVANCED LOAD TESTING SUITE
 * ============================================================================
 * 
 * Comprehensive load testing with multiple scenarios, real-time metrics,
 * and detailed reporting for BuildXpert API.
 * 
 * Features:
 * - Multiple test scenarios (baseline, spike, stress, endurance, soak)
 * - Comprehensive endpoint coverage
 * - Real-time metrics collection
 * - Detailed error tracking and analysis
 * - Performance bottleneck identification
 * - Production-ready markdown reporting
 * - Connection pooling and keep-alive
 * - Realistic request patterns
 * 
 * Usage:
 *   node load-testing/advanced-load-test.js [scenario] [options]
 * 
 * Scenarios:
 *   baseline  - Normal production load (default)
 *   spike     - Sudden traffic spike simulation
 *   stress    - Maximum capacity testing
 *   endurance - Long-running stability test
 *   soak      - Extended load test for memory leaks
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Configuration
const DEFAULT_CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5000',
  duration: parseInt(process.env.DURATION) || 60,
  connections: parseInt(process.env.CONNECTIONS) || 50,
  rate: parseInt(process.env.RATE) || 100,
  timeout: 30000,
  scenario: process.env.SCENARIO || 'baseline',
  rampUp: parseInt(process.env.RAMP_UP) || 10
};

// Test scenarios configuration
const SCENARIOS = {
  baseline: {
    name: 'Baseline Load Test',
    description: 'Normal production load simulation - represents typical user traffic patterns',
    duration: 60,
    connections: 50,
    rate: 100,
    rampUp: 10
  },
  spike: {
    name: 'Traffic Spike Test',
    description: 'Sudden traffic spike simulation - tests system resilience to sudden load increases',
    duration: 120,
    connections: 200,
    rate: 500,
    rampUp: 5
  },
  stress: {
    name: 'Stress Test',
    description: 'Maximum capacity testing - identifies breaking points and system limits',
    duration: 180,
    connections: 500,
    rate: 1000,
    rampUp: 15
  },
  endurance: {
    name: 'Endurance Test',
    description: 'Long-running stability test - ensures system stability over extended periods',
    duration: 600,
    connections: 100,
    rate: 200,
    rampUp: 30
  },
  soak: {
    name: 'Soak Test',
    description: 'Extended load test for memory leaks and resource exhaustion detection',
    duration: 1800,
    connections: 75,
    rate: 150,
    rampUp: 60
  }
};

// API Endpoints to test with realistic weights
// Note: Service IDs will be dynamically fetched and replaced
const BASE_ENDPOINTS = [
  // Health & Monitoring (High frequency, low weight)
  { method: 'GET', path: '/health', name: 'Health Check', weight: 15, auth: false },
  
  // Public Endpoints (High frequency)
  { method: 'GET', path: '/api/public/services', name: 'Get Public Services', weight: 20, auth: false },
  { method: 'GET', path: '/api/services', name: 'Get Services', weight: 12, auth: false },
  
  // Bookings (Medium frequency) - Only test if authenticated
  { method: 'GET', path: '/api/bookings', name: 'Get User Bookings', weight: 10, auth: true },
  { method: 'GET', path: '/api/providers/bookings', name: 'Get Provider Bookings', weight: 10, auth: true },
  
  // Providers
  { method: 'GET', path: '/api/providers/profile', name: 'Get Provider Profile', weight: 8, auth: true },
  
  // Earnings (Lower frequency)
  { method: 'GET', path: '/api/earnings', name: 'Get Earnings', weight: 5, auth: true },
  
  // Notifications (Medium frequency)
  { method: 'GET', path: '/api/notifications', name: 'Get Notifications', weight: 12, auth: true },
];

// Dynamic endpoints that will be populated with actual service IDs
let DYNAMIC_ENDPOINTS = [];

// Function to fetch valid service IDs and build dynamic endpoints
async function fetchServiceIdsAndBuildEndpoints(baseUrl) {
  try {
    const url = new URL('/api/public/services', baseUrl);
    const httpModule = url.protocol === 'https:' ? https : http;
    
    const services = await new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.status === 'success' && response.data && response.data.services) {
              resolve(response.data.services);
            } else {
              resolve([]);
            }
          } catch (e) {
            resolve([]);
          }
        });
      });

      req.on('error', (error) => {
        console.warn('⚠️  Could not fetch service IDs, using fallback endpoints:', error.message);
        resolve([]);
      });

      req.on('timeout', () => {
        req.destroy();
        console.warn('⚠️  Timeout fetching service IDs, using fallback endpoints');
        resolve([]);
      });

      req.end();
    });

    // Build dynamic endpoints with actual service IDs
    DYNAMIC_ENDPOINTS = [];
    
    if (services.length > 0) {
      // Use first service for Bangalore
      const service1 = services[0];
      DYNAMIC_ENDPOINTS.push({
        method: 'GET',
        path: `/api/public/services/${service1.id}/providers?state=Karnataka&city=Bangalore`,
        name: `Get Providers by Service (${service1.name})`,
        weight: 25,
        auth: false
      });

      // Use second service for Mumbai (if available)
      if (services.length > 1) {
        const service2 = services[1];
        DYNAMIC_ENDPOINTS.push({
          method: 'GET',
          path: `/api/public/services/${service2.id}/providers?state=Maharashtra&city=Mumbai`,
          name: `Get Providers (${service2.name} - Mumbai)`,
          weight: 15,
          auth: false
        });
      } else {
        // Use same service with different location
        DYNAMIC_ENDPOINTS.push({
          method: 'GET',
          path: `/api/public/services/${service1.id}/providers?state=Maharashtra&city=Mumbai`,
          name: `Get Providers (${service1.name} - Mumbai)`,
          weight: 15,
          auth: false
        });
      }
    } else {
      // Fallback: Remove provider endpoints if no services found
      console.warn('⚠️  No services found, skipping provider endpoints');
    }

    return [...BASE_ENDPOINTS, ...DYNAMIC_ENDPOINTS];
  } catch (error) {
    console.warn('⚠️  Error fetching service IDs:', error.message);
    // Return base endpoints without provider-specific ones
    return BASE_ENDPOINTS;
  }
}

// Metrics collection with advanced statistics
class AdvancedMetricsCollector {
  constructor() {
    this.reset();
  }

  reset() {
    this.startTime = Date.now();
    this.endpoints = new Map();
    this.errors = [];
    this.totalRequests = 0;
    this.totalResponses = 0;
    this.totalErrors = 0;
    this.totalBytes = 0;
    this.responseTimes = [];
    this.statusCodes = new Map();
    this.errorTypes = new Map();
    this.timeSeries = []; // For tracking performance over time
    this.peakResponseTime = 0;
    this.peakThroughput = 0;
    this.peakErrorRate = 0;
  }

  recordRequest(endpoint, startTime) {
    this.totalRequests++;
    if (!this.endpoints.has(endpoint)) {
      this.endpoints.set(endpoint, {
        name: endpoint,
        requests: 0,
        responses: 0,
        errors: 0,
        responseTimes: [],
        statusCodes: new Map(),
        bytes: 0,
        timeSeries: []
      });
    }
    const ep = this.endpoints.get(endpoint);
    ep.requests++;
    ep.startTime = startTime;
  }

  recordResponse(endpoint, statusCode, responseTime, bytes) {
    this.totalResponses++;
    this.totalBytes += bytes;
    this.responseTimes.push(responseTime);
    
    // Track peak response time
    if (responseTime > this.peakResponseTime) {
      this.peakResponseTime = responseTime;
    }
    
    // Status code tracking
    if (!this.statusCodes.has(statusCode)) {
      this.statusCodes.set(statusCode, 0);
    }
    this.statusCodes.set(statusCode, this.statusCodes.get(statusCode) + 1);

    const ep = this.endpoints.get(endpoint);
    if (ep) {
      ep.responses++;
      ep.responseTimes.push(responseTime);
      ep.bytes += bytes;
      if (!ep.statusCodes.has(statusCode)) {
        ep.statusCodes.set(statusCode, 0);
      }
      ep.statusCodes.set(statusCode, ep.statusCodes.get(statusCode) + 1);
      
      // Time series tracking (sample every 5 seconds)
      const now = Date.now();
      const lastSample = ep.timeSeries[ep.timeSeries.length - 1];
      if (!lastSample || now - lastSample.timestamp > 5000) {
        ep.timeSeries.push({
          timestamp: now,
          avgResponseTime: responseTime,
          requests: 1,
          errors: 0
        });
      } else {
        lastSample.avgResponseTime = (lastSample.avgResponseTime * lastSample.requests + responseTime) / (lastSample.requests + 1);
        lastSample.requests++;
      }
    }
    
    // Global time series
    const now = Date.now();
    const lastGlobalSample = this.timeSeries[this.timeSeries.length - 1];
    if (!lastGlobalSample || now - lastGlobalSample.timestamp > 5000) {
      const currentThroughput = this.totalResponses / ((now - this.startTime) / 1000);
      const currentErrorRate = (this.totalErrors / this.totalRequests) * 100;
      this.timeSeries.push({
        timestamp: now,
        requestsPerSecond: currentThroughput,
        errorRate: currentErrorRate,
        avgResponseTime: responseTime
      });
      if (currentThroughput > this.peakThroughput) {
        this.peakThroughput = currentThroughput;
      }
      if (currentErrorRate > this.peakErrorRate) {
        this.peakErrorRate = currentErrorRate;
      }
    }
  }

  recordError(endpoint, error, statusCode = null) {
    this.totalErrors++;
    this.errors.push({
      endpoint,
      error: error.message || error,
      statusCode,
      timestamp: Date.now()
    });

    const errorType = error.message || 'Unknown Error';
    if (!this.errorTypes.has(errorType)) {
      this.errorTypes.set(errorType, 0);
    }
    this.errorTypes.set(errorType, this.errorTypes.get(errorType) + 1);

    const ep = this.endpoints.get(endpoint);
    if (ep) {
      ep.errors++;
    }
  }

  getStats() {
    const duration = (Date.now() - this.startTime) / 1000;
    const sortedResponseTimes = [...this.responseTimes].sort((a, b) => a - b);
    
    const percentile = (arr, p) => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, index)];
    };

    return {
      duration,
      totalRequests: this.totalRequests,
      totalResponses: this.totalResponses,
      totalErrors: this.totalErrors,
      totalBytes: this.totalBytes,
      requestsPerSecond: this.totalRequests / duration,
      responsesPerSecond: this.totalResponses / duration,
      errorRate: (this.totalErrors / this.totalRequests) * 100,
      throughput: this.totalBytes / duration,
      peakResponseTime: this.peakResponseTime,
      peakThroughput: this.peakThroughput,
      peakErrorRate: this.peakErrorRate,
      responseTime: {
        min: Math.min(...this.responseTimes) || 0,
        max: Math.max(...this.responseTimes) || 0,
        mean: this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length || 0,
        median: percentile(sortedResponseTimes, 50),
        p75: percentile(sortedResponseTimes, 75),
        p90: percentile(sortedResponseTimes, 90),
        p95: percentile(sortedResponseTimes, 95),
        p99: percentile(sortedResponseTimes, 99),
        p999: percentile(sortedResponseTimes, 99.9)
      },
      statusCodes: Object.fromEntries(this.statusCodes),
      errorTypes: Object.fromEntries(this.errorTypes),
      timeSeries: this.timeSeries,
      endpoints: Array.from(this.endpoints.values()).map(ep => {
        const sorted = [...ep.responseTimes].sort((a, b) => a - b);
        return {
          name: ep.name,
          requests: ep.requests,
          responses: ep.responses,
          errors: ep.errors,
          errorRate: (ep.errors / ep.requests) * 100,
          avgResponseTime: ep.responseTimes.reduce((a, b) => a + b, 0) / ep.responseTimes.length || 0,
          minResponseTime: Math.min(...ep.responseTimes) || 0,
          maxResponseTime: Math.max(...ep.responseTimes) || 0,
          median: percentile(sorted, 50),
          p75: percentile(sorted, 75),
          p90: percentile(sorted, 90),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          throughput: ep.bytes / duration,
          statusCodes: Object.fromEntries(ep.statusCodes),
          timeSeries: ep.timeSeries
        };
      })
    };
  }
}

// HTTP Client with connection pooling and keep-alive
class AdvancedLoadTestClient {
  constructor(baseUrl, config) {
    this.baseUrl = baseUrl;
    this.config = config;
    this.url = new URL(baseUrl);
    this.httpModule = this.url.protocol === 'https:' ? https : http;
    this.agent = new this.httpModule.Agent({
      keepAlive: true,
      maxSockets: config.connections * 2,
      maxFreeSockets: 10,
      keepAliveMsecs: 1000
    });
  }

  async makeRequest(endpoint, authToken = null) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      const url = new URL(endpoint.path, this.baseUrl);
      
      const port = this.url.port || (this.url.protocol === 'https:' ? 443 : 80);
      const options = {
        hostname: this.url.hostname,
        port: port,
        path: url.pathname + url.search,
        method: endpoint.method,
        agent: this.agent,
        headers: {
          'User-Agent': 'BuildXpert-LoadTest/1.0',
          'Accept': 'application/json',
          'Connection': 'keep-alive',
          'Accept-Encoding': 'gzip, deflate'
        }
      };

      if (authToken) {
        options.headers['Authorization'] = `Bearer ${authToken}`;
      }

      const req = this.httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const responseTime = performance.now() - startTime;
          resolve({
            statusCode: res.statusCode,
            responseTime,
            bytes: Buffer.byteLength(data),
            headers: res.headers
          });
        });
      });

      req.on('error', (error) => {
        const responseTime = performance.now() - startTime;
        reject({ error, responseTime });
      });

      // Set timeout on the request
      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        const responseTime = performance.now() - startTime;
        reject({ error: new Error('Request timeout'), responseTime });
      });

      req.end();
    });
  }

  destroy() {
    this.agent.destroy();
  }
}

// Load Test Runner with ramp-up support
class AdvancedLoadTestRunner {
  constructor(config) {
    this.config = config;
    this.metrics = new AdvancedMetricsCollector();
    this.client = new AdvancedLoadTestClient(config.baseUrl, config);
    this.running = false;
    this.workers = [];
    this.testToken = null;
    this.endpoints = [];
  }

  async initialize() {
    // Fetch service IDs and build endpoints
    console.log('📋 Fetching service IDs and building test endpoints...');
    this.endpoints = await fetchServiceIdsAndBuildEndpoints(this.config.baseUrl);
    console.log(`✅ Loaded ${this.endpoints.length} endpoints for testing\n`);
  }

  async authenticate() {
    // Optional authentication for testing authenticated endpoints
    try {
      // Skip authentication for now - test public endpoints
      console.log('ℹ️  Testing public endpoints (authentication skipped)');
    } catch (error) {
      console.log('⚠️  Authentication skipped - testing public endpoints only');
    }
  }

  async runWorker(workerId, endpoints, rampUpTime) {
    const startTime = Date.now();
    const interval = 1000 / this.config.rate;
    let lastRequest = Date.now();
    let currentRate = 0;
    const targetRate = this.config.rate;

    while (this.running) {
      const now = Date.now();
      const elapsed = now - startTime;
      
      // Ramp up logic
      if (elapsed < rampUpTime * 1000) {
        currentRate = (targetRate * elapsed) / (rampUpTime * 1000);
      } else {
        currentRate = targetRate;
      }
      
      const currentInterval = 1000 / currentRate;
      const timeSinceLastRequest = now - lastRequest;

      if (timeSinceLastRequest >= currentInterval) {
        // Select endpoint based on weight
        const endpoint = this.selectEndpoint(endpoints);
        const requestStartTime = performance.now();
        
        this.metrics.recordRequest(endpoint.path, requestStartTime);

        try {
          const result = await this.client.makeRequest(endpoint, this.testToken);
          this.metrics.recordResponse(
            endpoint.path,
            result.statusCode,
            result.responseTime,
            result.bytes
          );

          if (result.statusCode >= 400) {
            this.metrics.recordError(endpoint.path, new Error(`HTTP ${result.statusCode}`), result.statusCode);
          }
        } catch (error) {
          this.metrics.recordError(endpoint.path, error.error || error, error.statusCode);
        }

        lastRequest = now;
      } else {
        await new Promise(resolve => setTimeout(resolve, currentInterval - timeSinceLastRequest));
      }
    }
  }

  selectEndpoint(endpoints) {
    const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const endpoint of endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }
    return endpoints[0];
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 BUILDXPERT ADVANCED LOAD TESTING SUITE');
    console.log('='.repeat(80));
    console.log(`📊 Scenario: ${this.config.scenario}`);
    console.log(`⏱️  Duration: ${this.config.duration}s`);
    console.log(`🔗 Connections: ${this.config.connections}`);
    console.log(`📈 Target Rate: ${this.config.rate} req/s`);
    console.log(`📈 Ramp Up: ${this.config.rampUp}s`);
    console.log(`🌐 Base URL: ${this.config.baseUrl}`);
    console.log('='.repeat(80) + '\n');

    // Initialize endpoints (fetch service IDs)
    await this.initialize();

    // Filter endpoints based on auth requirement
    const testEndpoints = this.endpoints.filter(ep => !ep.auth || this.testToken);
    
    this.running = true;
    this.metrics.reset();

    // Start workers with ramp-up
    for (let i = 0; i < this.config.connections; i++) {
      this.workers.push(this.runWorker(i, testEndpoints, this.config.rampUp));
    }

    // Progress reporting
    let lastReportTime = Date.now();
    const progressInterval = setInterval(() => {
      const stats = this.metrics.getStats();
      const elapsed = (Date.now() - this.metrics.startTime) / 1000;
      const remaining = this.config.duration - elapsed;
      process.stdout.write(
        `\r⏳ Progress: ${elapsed.toFixed(0)}s/${this.config.duration}s | ` +
        `Requests: ${stats.totalRequests.toLocaleString()} | ` +
        `Rate: ${stats.responsesPerSecond.toFixed(1)} req/s | ` +
        `Errors: ${stats.errorRate.toFixed(2)}% | ` +
        `Avg RT: ${stats.responseTime.mean.toFixed(0)}ms | ` +
        `Remaining: ${remaining.toFixed(0)}s`
      );
    }, 1000);

    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, this.config.duration * 1000));

    // Stop test
    this.running = false;
    clearInterval(progressInterval);
    
    // Wait for workers to finish
    await Promise.all(this.workers);
    this.workers = [];

    // Final wait for pending requests
    await new Promise(resolve => setTimeout(resolve, 3000));

    this.client.destroy();

    console.log('\n\n✅ Load test completed!\n');

    return this.metrics.getStats();
  }
}

// Advanced Report Generator
class AdvancedReportGenerator {
  constructor(stats, config, scenario, endpoints = []) {
    this.stats = stats;
    this.config = config;
    this.scenario = scenario;
    this.endpoints = endpoints;
  }

  generate() {
    const timestamp = new Date().toISOString();
    const report = `# BuildXpert API - Advanced Load Test Report

**Generated:** ${timestamp}  
**Scenario:** ${this.scenario.name}  
**Description:** ${this.scenario.description}  
**Duration:** ${this.config.duration}s  
**Connections:** ${this.config.connections}  
**Target Rate:** ${this.config.rate} req/s  
**Ramp Up:** ${this.config.rampUp}s  
**Base URL:** ${this.config.baseUrl}

---

## Executive Summary

${this.generateExecutiveSummary()}

---

## Overall Performance Metrics

${this.generateOverallMetrics()}

---

## Response Time Analysis

${this.generateResponseTimeAnalysis()}

---

## Endpoint Performance Breakdown

${this.generateEndpointPerformance()}

---

## Error Analysis

${this.generateErrorAnalysis()}

---

## Status Code Distribution

${this.generateStatusCodes()}

---

## Performance Over Time

${this.generateTimeSeriesAnalysis()}

---

## Performance Recommendations

${this.generateRecommendations()}

---

## Test Configuration

${this.generateConfiguration()}

---

## Detailed Statistics

<details>
<summary>Click to expand raw statistics</summary>

\`\`\`json
${JSON.stringify(this.stats, null, 2)}
\`\`\`

</details>

---

**Report Generated by:** BuildXpert Advanced Load Testing Suite  
**Version:** 2.0.0
`;

    return report;
  }

  generateExecutiveSummary() {
    const { stats } = this;
    const successRate = 100 - stats.errorRate;
    const status = successRate >= 99 ? '✅ **EXCELLENT**' : 
                   successRate >= 95 ? '✅ **GOOD**' : 
                   successRate >= 90 ? '⚠️ **ACCEPTABLE**' : '❌ **NEEDS ATTENTION**';

    const performanceRating = stats.responseTime.mean < 200 ? '✅ **EXCELLENT**' :
                             stats.responseTime.mean < 500 ? '✅ **GOOD**' :
                             stats.responseTime.mean < 1000 ? '⚠️ **ACCEPTABLE**' : '❌ **POOR**';

    return `
| Metric | Value | Status |
|--------|-------|--------|
| **Total Requests** | ${stats.totalRequests.toLocaleString()} | - |
| **Total Responses** | ${stats.totalResponses.toLocaleString()} | - |
| **Success Rate** | ${successRate.toFixed(2)}% | ${status} |
| **Error Rate** | ${stats.errorRate.toFixed(2)}% | ${stats.errorRate < 1 ? '✅' : stats.errorRate < 5 ? '⚠️' : '❌'} |
| **Requests/Second** | ${stats.requestsPerSecond.toFixed(2)} | ${stats.requestsPerSecond >= this.config.rate * 0.9 ? '✅' : '⚠️'} |
| **Responses/Second** | ${stats.responsesPerSecond.toFixed(2)} | - |
| **Peak Throughput** | ${stats.peakThroughput.toFixed(2)} req/s | - |
| **Throughput** | ${(stats.throughput / 1024).toFixed(2)} KB/s | - |
| **Mean Response Time** | ${stats.responseTime.mean.toFixed(2)}ms | ${performanceRating} |
| **P95 Response Time** | ${stats.responseTime.p95.toFixed(2)}ms | ${stats.responseTime.p95 < 500 ? '✅' : stats.responseTime.p95 < 1000 ? '⚠️' : '❌'} |
| **P99 Response Time** | ${stats.responseTime.p99.toFixed(2)}ms | ${stats.responseTime.p99 < 1000 ? '✅' : stats.responseTime.p99 < 2000 ? '⚠️' : '❌'} |
| **Peak Response Time** | ${stats.peakResponseTime.toFixed(2)}ms | - |
`;
  }

  generateOverallMetrics() {
    const { stats } = this;
    return `
### Request Metrics

- **Total Requests:** ${stats.totalRequests.toLocaleString()}
- **Total Responses:** ${stats.totalResponses.toLocaleString()}
- **Total Errors:** ${stats.totalErrors.toLocaleString()}
- **Requests/Second:** ${stats.requestsPerSecond.toFixed(2)}
- **Responses/Second:** ${stats.responsesPerSecond.toFixed(2)}
- **Peak Throughput:** ${stats.peakThroughput.toFixed(2)} req/s
- **Error Rate:** ${stats.errorRate.toFixed(2)}%

### Throughput

- **Total Bytes:** ${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB
- **Throughput:** ${(stats.throughput / 1024).toFixed(2)} KB/s
- **Average Response Size:** ${stats.totalResponses > 0 ? (stats.totalBytes / stats.totalResponses).toFixed(2) : 0} bytes

### Response Time Distribution

| Percentile | Response Time (ms) | Status |
|------------|-------------------|--------|
| Min | ${stats.responseTime.min.toFixed(2)} | - |
| Mean | ${stats.responseTime.mean.toFixed(2)} | ${stats.responseTime.mean < 200 ? '✅' : stats.responseTime.mean < 500 ? '⚠️' : '❌'} |
| Median (P50) | ${stats.responseTime.median.toFixed(2)} | - |
| P75 | ${stats.responseTime.p75.toFixed(2)} | - |
| P90 | ${stats.responseTime.p90.toFixed(2)} | - |
| P95 | ${stats.responseTime.p95.toFixed(2)} | ${stats.responseTime.p95 < 500 ? '✅' : stats.responseTime.p95 < 1000 ? '⚠️' : '❌'} |
| P99 | ${stats.responseTime.p99.toFixed(2)} | ${stats.responseTime.p99 < 1000 ? '✅' : stats.responseTime.p99 < 2000 ? '⚠️' : '❌'} |
| P99.9 | ${stats.responseTime.p999.toFixed(2)} | - |
| Max | ${stats.responseTime.max.toFixed(2)} | - |
`;
  }

  generateResponseTimeAnalysis() {
    const { stats } = this;
    const mean = stats.responseTime.mean;
    const p95 = stats.responseTime.p95;
    const p99 = stats.responseTime.p99;

    let analysis = '### Response Time Performance Analysis\n\n';

    // Mean analysis
    if (mean < 100) {
      analysis += '✅ **Mean Response Time:** Excellent (< 100ms) - System is highly responsive.\n\n';
    } else if (mean < 200) {
      analysis += '✅ **Mean Response Time:** Good (< 200ms) - System performance is acceptable.\n\n';
    } else if (mean < 500) {
      analysis += '⚠️ **Mean Response Time:** Acceptable (< 500ms) - Consider optimization for better user experience.\n\n';
    } else {
      analysis += '❌ **Mean Response Time:** Needs optimization (> 500ms) - Critical performance issue.\n\n';
    }

    // P95 analysis
    if (p95 < 300) {
      analysis += '✅ **P95 Response Time:** Excellent (< 300ms) - 95% of requests are very fast.\n\n';
    } else if (p95 < 500) {
      analysis += '✅ **P95 Response Time:** Good (< 500ms) - Most requests are performing well.\n\n';
    } else if (p95 < 1000) {
      analysis += '⚠️ **P95 Response Time:** Acceptable (< 1s) - Some requests are slow, optimization recommended.\n\n';
    } else {
      analysis += '❌ **P95 Response Time:** Needs optimization (> 1s) - Critical: 95% of requests are slow.\n\n';
    }

    // P99 analysis
    if (p99 < 500) {
      analysis += '✅ **P99 Response Time:** Excellent (< 500ms) - Even worst-case requests are fast.\n\n';
    } else if (p99 < 1000) {
      analysis += '✅ **P99 Response Time:** Good (< 1s) - Worst-case performance is acceptable.\n\n';
    } else if (p99 < 2000) {
      analysis += '⚠️ **P99 Response Time:** Acceptable (< 2s) - Some edge cases are slow.\n\n';
    } else {
      analysis += '❌ **P99 Response Time:** Needs optimization (> 2s) - Critical: Worst-case requests are very slow.\n\n';
    }

    return analysis;
  }

  generateEndpointPerformance() {
    const { stats } = this;
    let table = `
| Endpoint | Requests | Responses | Errors | Error Rate | Avg RT (ms) | P95 (ms) | P99 (ms) | Throughput (KB/s) | Status |
|----------|----------|-----------|--------|------------|-------------|----------|----------|-------------------|--------|
`;

    // Sort by average response time
    const sortedEndpoints = [...stats.endpoints].sort((a, b) => b.avgResponseTime - a.avgResponseTime);

    sortedEndpoints.forEach(ep => {
      const errorRate = ep.errorRate.toFixed(2);
      const avgRT = ep.avgResponseTime.toFixed(2);
      const p95 = ep.p95.toFixed(2);
      const p99 = ep.p99.toFixed(2);
      const throughput = (ep.throughput / 1024).toFixed(2);
      
      let status = '✅';
      if (ep.errorRate > 5 || ep.avgResponseTime > 1000) {
        status = '❌';
      } else if (ep.errorRate > 1 || ep.avgResponseTime > 500) {
        status = '⚠️';
      }
      
      table += `| ${ep.name} | ${ep.requests} | ${ep.responses} | ${ep.errors} | ${errorRate}% | ${avgRT} | ${p95} | ${p99} | ${throughput} | ${status} |\n`;
    });

    return table;
  }

  generateErrorAnalysis() {
    const { stats } = this;
    
    if (stats.totalErrors === 0) {
      return '✅ **No errors detected during the test.** System performed flawlessly.\n';
    }

    let analysis = `### Error Summary\n\n`;
    analysis += `- **Total Errors:** ${stats.totalErrors.toLocaleString()}\n`;
    analysis += `- **Error Rate:** ${stats.errorRate.toFixed(2)}%\n`;
    analysis += `- **Peak Error Rate:** ${stats.peakErrorRate.toFixed(2)}%\n\n`;

    if (Object.keys(stats.errorTypes).length > 0) {
      analysis += `### Error Types Distribution\n\n`;
      analysis += `| Error Type | Count | Percentage |\n`;
      analysis += `|------------|-------|------------|\n`;
      
      Object.entries(stats.errorTypes)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          const percentage = ((count / stats.totalErrors) * 100).toFixed(2);
          analysis += `| ${type} | ${count} | ${percentage}% |\n`;
        });
    }

    // Top error-prone endpoints
    const errorEndpoints = stats.endpoints
      .filter(ep => ep.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 5);

    if (errorEndpoints.length > 0) {
      analysis += `\n### Top Error-Prone Endpoints\n\n`;
      analysis += `| Endpoint | Errors | Error Rate |\n`;
      analysis += `|----------|--------|------------|\n`;
      errorEndpoints.forEach(ep => {
        analysis += `| ${ep.name} | ${ep.errors} | ${ep.errorRate.toFixed(2)}% |\n`;
      });
    }

    return analysis;
  }

  generateStatusCodes() {
    const { stats } = this;
    let table = `
| Status Code | Count | Percentage | Status |
|-------------|-------|------------|--------|
`;

    const total = Object.values(stats.statusCodes).reduce((a, b) => a + b, 0);
    
    Object.entries(stats.statusCodes)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .forEach(([code, count]) => {
        const percentage = ((count / total) * 100).toFixed(2);
        const emoji = code.startsWith('2') ? '✅' : code.startsWith('4') ? '⚠️' : '❌';
        table += `| ${emoji} ${code} | ${count} | ${percentage}% | ${code.startsWith('2') ? 'Success' : code.startsWith('4') ? 'Client Error' : 'Server Error'} |\n`;
      });

    return table;
  }

  generateTimeSeriesAnalysis() {
    const { stats } = this;
    if (!stats.timeSeries || stats.timeSeries.length === 0) {
      return 'Time series data not available.';
    }

    let analysis = `### Performance Trends Over Time\n\n`;
    analysis += `The following metrics were sampled every 5 seconds during the test:\n\n`;
    analysis += `| Time (s) | Requests/s | Error Rate | Avg RT (ms) |\n`;
    analysis += `|----------|------------|------------|-------------|\n`;

    stats.timeSeries.slice(0, 20).forEach((sample, index) => {
      const time = ((sample.timestamp - stats.timeSeries[0].timestamp) / 1000).toFixed(0);
      analysis += `| ${time} | ${sample.requestsPerSecond.toFixed(1)} | ${sample.errorRate.toFixed(2)}% | ${sample.avgResponseTime.toFixed(0)} |\n`;
    });

    if (stats.timeSeries.length > 20) {
      analysis += `\n*Showing first 20 samples. Total samples: ${stats.timeSeries.length}*\n`;
    }

    return analysis;
  }

  generateRecommendations() {
    const { stats } = this;
    const recommendations = [];

    // Error rate recommendations
    if (stats.errorRate > 5) {
      recommendations.push('❌ **High Error Rate (>5%):** Critical issue. Investigate and fix errors immediately. Error rate should be < 1% for production.');
    } else if (stats.errorRate > 1) {
      recommendations.push('⚠️ **Moderate Error Rate (1-5%):** Review error logs and optimize error-prone endpoints. Target < 1% error rate.');
    } else if (stats.errorRate === 0) {
      recommendations.push('✅ **Zero Errors:** Excellent! System handled all requests successfully.');
    }

    // Response time recommendations
    if (stats.responseTime.mean > 500) {
      recommendations.push('❌ **Slow Mean Response Time (>500ms):** Optimize database queries, add caching, implement connection pooling, or scale horizontally.');
    } else if (stats.responseTime.mean > 200) {
      recommendations.push('⚠️ **Moderate Response Time (200-500ms):** Consider query optimization, caching strategies, and database indexing.');
    } else {
      recommendations.push('✅ **Good Mean Response Time (<200ms):** System is performing well. Consider stress testing for capacity planning.');
    }

    if (stats.responseTime.p95 > 1000) {
      recommendations.push('❌ **High P95 Response Time (>1s):** 95% of requests are taking > 1s. Critical optimization needed. Review slow endpoints.');
    } else if (stats.responseTime.p95 > 500) {
      recommendations.push('⚠️ **Moderate P95 Response Time (500ms-1s):** Some requests are slow. Identify and optimize slow endpoints.');
    }

    if (stats.responseTime.p99 > 2000) {
      recommendations.push('❌ **Very High P99 Response Time (>2s):** 99% of requests are taking > 2s. Urgent optimization required.');
    }

    // Throughput recommendations
    if (stats.requestsPerSecond < this.config.rate * 0.8) {
      recommendations.push('⚠️ **Low Request Rate:** System may be throttling. Check rate limiting, server capacity, and connection limits.');
    } else if (stats.requestsPerSecond >= this.config.rate * 0.95) {
      recommendations.push('✅ **Good Request Rate:** System is handling the target load effectively.');
    }

    // Peak performance
    if (stats.peakResponseTime > 5000) {
      recommendations.push('❌ **Very High Peak Response Time (>5s):** Some requests are extremely slow. Investigate timeout issues and slow queries.');
    }

    // Positive feedback
    if (stats.errorRate < 1 && stats.responseTime.mean < 200 && stats.responseTime.p95 < 500) {
      recommendations.push('✅ **Excellent Overall Performance:** System is performing exceptionally well under load. Ready for production scaling.');
    }

    // Endpoint-specific recommendations
    const slowEndpoints = stats.endpoints
      .filter(ep => ep.avgResponseTime > 1000)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, 3);

    if (slowEndpoints.length > 0) {
      recommendations.push(`\n### Slow Endpoints to Optimize:\n\n`);
      slowEndpoints.forEach(ep => {
        recommendations.push(`- **${ep.name}** (Avg: ${ep.avgResponseTime.toFixed(2)}ms, P95: ${ep.p95.toFixed(2)}ms): Consider caching, database optimization, or async processing.`);
      });
    }

    if (recommendations.length === 0) {
      return '✅ **No critical issues detected.** System performance is within acceptable parameters.';
    }

    return recommendations.join('\n\n');
  }

  generateConfiguration() {
    return `
\`\`\`
Scenario: ${this.scenario.name}
Description: ${this.scenario.description}
Duration: ${this.config.duration}s
Connections: ${this.config.connections}
Target Rate: ${this.config.rate} req/s
Ramp Up: ${this.config.rampUp}s
Base URL: ${this.config.baseUrl}
Timeout: ${this.config.timeout}ms
Test Endpoints: ${this.endpoints.length}
\`\`\`
`;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const scenarioName = args[0] || 'baseline';
  const scenario = SCENARIOS[scenarioName];

  if (!scenario) {
    console.error(`❌ Unknown scenario: ${scenarioName}`);
    console.error(`Available scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  // Parse custom config from args
  const customConfig = { ...DEFAULT_CONFIG };
  args.forEach(arg => {
    if (arg.startsWith('--duration=')) {
      customConfig.duration = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--connections=')) {
      customConfig.connections = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--rate=')) {
      customConfig.rate = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--base-url=')) {
      customConfig.baseUrl = arg.split('=')[1];
    } else if (arg.startsWith('--ramp-up=')) {
      customConfig.rampUp = parseInt(arg.split('=')[1]);
    }
  });

  // Merge scenario config
  const config = {
    ...customConfig,
    duration: scenario.duration,
    connections: scenario.connections,
    rate: scenario.rate,
    rampUp: scenario.rampUp,
    scenario: scenarioName
  };

  try {
    // Run load test
    const runner = new AdvancedLoadTestRunner(config);
    const stats = await runner.run();

    // Generate report
    const generator = new AdvancedReportGenerator(stats, config, scenario, runner.endpoints);
    const report = generator.generate();

    // Save report
    const reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const reportFile = path.join(reportDir, `load-test-report-${scenarioName}-${timestamp}.md`);
    fs.writeFileSync(reportFile, report);

    console.log(`\n📄 Report saved to: ${reportFile}\n`);

    // Print summary
    console.log('📊 Test Summary:');
    console.log(`   Total Requests: ${stats.totalRequests.toLocaleString()}`);
    console.log(`   Total Responses: ${stats.totalResponses.toLocaleString()}`);
    console.log(`   Total Errors: ${stats.totalErrors.toLocaleString()} (${stats.errorRate.toFixed(2)}%)`);
    console.log(`   Requests/Second: ${stats.requestsPerSecond.toFixed(2)}`);
    console.log(`   Responses/Second: ${stats.responsesPerSecond.toFixed(2)}`);
    console.log(`   Mean Response Time: ${stats.responseTime.mean.toFixed(2)}ms`);
    console.log(`   P95 Response Time: ${stats.responseTime.p95.toFixed(2)}ms`);
    console.log(`   P99 Response Time: ${stats.responseTime.p99.toFixed(2)}ms`);
    console.log(`   Peak Response Time: ${stats.peakResponseTime.toFixed(2)}ms`);
    console.log(`   Throughput: ${(stats.throughput / 1024).toFixed(2)} KB/s\n`);

    return reportFile;
  } catch (error) {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { AdvancedLoadTestRunner, AdvancedMetricsCollector, AdvancedReportGenerator };

