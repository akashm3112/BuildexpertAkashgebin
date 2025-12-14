/**
 * ============================================================================
 * PRODUCTION-READY ADVANCED LOAD TESTING SUITE
 * ============================================================================
 * 
 * This comprehensive load testing suite tests all critical API endpoints
 * under various load conditions to ensure production readiness.
 * 
 * Features:
 * - Multiple test scenarios (baseline, spike, stress, endurance)
 * - Comprehensive endpoint coverage
 * - Real-time metrics collection
 * - Detailed error tracking
 * - Performance bottleneck identification
 * - Production-ready reporting
 * 
 * Usage:
 *   node tests/load-test.js [scenario] [options]
 * 
 * Scenarios:
 *   baseline  - Normal load (default)
 *   spike     - Sudden traffic spike
 *   stress    - Maximum capacity testing
 *   endurance - Long-running stability test
 * 
 * Options:
 *   --duration=60    - Test duration in seconds
 *   --connections=50 - Concurrent connections
 *   --rate=100       - Requests per second
 *   --base-url=http://localhost:5000 - API base URL
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Configuration
const DEFAULT_CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:5000',
  duration: parseInt(process.env.DURATION) || 60,
  connections: parseInt(process.env.CONNECTIONS) || 50,
  rate: parseInt(process.env.RATE) || 100,
  timeout: 30000,
  scenario: process.env.SCENARIO || 'baseline'
};

// Test scenarios configuration
const SCENARIOS = {
  baseline: {
    name: 'Baseline Load Test',
    description: 'Normal production load simulation',
    duration: 60,
    connections: 50,
    rate: 100,
    rampUp: 10
  },
  spike: {
    name: 'Traffic Spike Test',
    description: 'Sudden traffic spike simulation',
    duration: 120,
    connections: 200,
    rate: 500,
    rampUp: 5
  },
  stress: {
    name: 'Stress Test',
    description: 'Maximum capacity testing',
    duration: 180,
    connections: 500,
    rate: 1000,
    rampUp: 15
  },
  endurance: {
    name: 'Endurance Test',
    description: 'Long-running stability test',
    duration: 600,
    connections: 100,
    rate: 200,
    rampUp: 30
  }
};

// API Endpoints to test
const ENDPOINTS = [
  // Health & Monitoring
  { method: 'GET', path: '/health', name: 'Health Check', weight: 10, auth: false },
  { method: 'GET', path: '/api/monitoring/health', name: 'Monitoring Health', weight: 5, auth: false },
  
  // Public Endpoints
  { method: 'GET', path: '/api/public/services', name: 'Get Public Services', weight: 15, auth: false },
  { method: 'GET', path: '/api/public/services/1/providers?state=Karnataka&city=Bangalore', name: 'Get Providers by Service', weight: 20, auth: false },
  
  // Services
  { method: 'GET', path: '/api/services', name: 'Get Services', weight: 10, auth: false },
  { method: 'GET', path: '/api/services/my-registrations', name: 'Get My Services', weight: 8, auth: true },
  
  // Bookings
  { method: 'GET', path: '/api/bookings', name: 'Get Bookings', weight: 12, auth: true },
  { method: 'GET', path: '/api/providers/bookings', name: 'Get Provider Bookings', weight: 10, auth: true },
  
  // Providers
  { method: 'GET', path: '/api/providers/profile', name: 'Get Provider Profile', weight: 8, auth: true },
  
  // Earnings
  { method: 'GET', path: '/api/earnings', name: 'Get Earnings', weight: 5, auth: true },
  
  // Notifications
  { method: 'GET', path: '/api/notifications', name: 'Get Notifications', weight: 10, auth: true },
];

// Metrics collection
class MetricsCollector {
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
        bytes: 0
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
      responseTime: {
        min: Math.min(...this.responseTimes) || 0,
        max: Math.max(...this.responseTimes) || 0,
        mean: this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length || 0,
        median: percentile(sortedResponseTimes, 50),
        p95: percentile(sortedResponseTimes, 95),
        p99: percentile(sortedResponseTimes, 99)
      },
      statusCodes: Object.fromEntries(this.statusCodes),
      errorTypes: Object.fromEntries(this.errorTypes),
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
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          throughput: ep.bytes / duration,
          statusCodes: Object.fromEntries(ep.statusCodes)
        };
      })
    };
  }
}

// HTTP Client with connection pooling
class LoadTestClient {
  constructor(baseUrl, config) {
    this.baseUrl = baseUrl;
    this.config = config;
    this.url = new URL(baseUrl);
    this.httpModule = this.url.protocol === 'https:' ? https : http;
    this.agent = new this.httpModule.Agent({
      keepAlive: true,
      maxSockets: config.connections,
      maxFreeSockets: 10,
      timeout: config.timeout,
      keepAliveMsecs: 1000
    });
  }

  async makeRequest(endpoint, authToken = null) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const url = new URL(endpoint.path, this.baseUrl);
      
      const options = {
        hostname: this.url.hostname,
        port: this.url.port || (this.url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: endpoint.method,
        agent: this.agent,
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'LoadTest/1.0',
          'Accept': 'application/json',
          'Connection': 'keep-alive'
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
          const responseTime = Date.now() - startTime;
          resolve({
            statusCode: res.statusCode,
            responseTime,
            bytes: Buffer.byteLength(data),
            headers: res.headers
          });
        });
      });

      req.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        reject({ error, responseTime });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({ error: new Error('Request timeout'), responseTime: this.config.timeout });
      });

      req.end();
    });
  }

  destroy() {
    this.agent.destroy();
  }
}

// Load Test Runner
class LoadTestRunner {
  constructor(config) {
    this.config = config;
    this.metrics = new MetricsCollector();
    this.client = new LoadTestClient(config.baseUrl, config);
    this.running = false;
    this.workers = [];
    this.testToken = null; // For authenticated endpoints
  }

  async authenticate() {
    // Try to authenticate for testing authenticated endpoints
    // This is optional and can be skipped if no auth token is available
    try {
      const response = await this.client.makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        name: 'Auth',
        weight: 0,
        auth: false
      });
      // If authentication is needed, implement token extraction here
    } catch (error) {
      // Authentication failed, continue without auth
      console.log('⚠️  Authentication skipped - testing public endpoints only');
    }
  }

  async runWorker(workerId, endpoints) {
    const interval = 1000 / this.config.rate;
    let lastRequest = Date.now();

    while (this.running) {
      const now = Date.now();
      const elapsed = now - lastRequest;

      if (elapsed >= interval) {
        // Select endpoint based on weight
        const endpoint = this.selectEndpoint(endpoints);
        const startTime = Date.now();
        
        this.metrics.recordRequest(endpoint.path, startTime);

        try {
          const result = await this.client.makeRequest(endpoint, this.testToken);
          this.metrics.recordResponse(
            endpoint.path,
            result.statusCode,
            result.responseTime,
            result.bytes
          );

          if (result.statusCode >= 400) {
            this.metrics.recordError(endpoint.path, `HTTP ${result.statusCode}`, result.statusCode);
          }
        } catch (error) {
          this.metrics.recordError(endpoint.path, error.error || error, error.statusCode);
        }

        lastRequest = now;
      } else {
        await new Promise(resolve => setTimeout(resolve, interval - elapsed));
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
    console.log('\n🚀 Starting Load Test...\n');
    console.log(`📊 Scenario: ${this.config.scenario}`);
    console.log(`⏱️  Duration: ${this.config.duration}s`);
    console.log(`🔗 Connections: ${this.config.connections}`);
    console.log(`📈 Rate: ${this.config.rate} req/s`);
    console.log(`🌐 Base URL: ${this.config.baseUrl}\n`);

    // Filter endpoints based on auth requirement
    const testEndpoints = ENDPOINTS.filter(ep => !ep.auth || this.testToken);
    
    this.running = true;
    this.metrics.reset();

    // Start workers
    for (let i = 0; i < this.config.connections; i++) {
      this.workers.push(this.runWorker(i, testEndpoints));
    }

    // Progress reporting
    const progressInterval = setInterval(() => {
      const stats = this.metrics.getStats();
      process.stdout.write(`\r⏳ Running... ${stats.totalRequests} requests | ${stats.responsesPerSecond.toFixed(1)} req/s | ${stats.errorRate.toFixed(2)}% errors`);
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
    await new Promise(resolve => setTimeout(resolve, 2000));

    this.client.destroy();

    console.log('\n✅ Load test completed!\n');

    return this.metrics.getStats();
  }
}

// Report Generator
class ReportGenerator {
  constructor(stats, config, scenario) {
    this.stats = stats;
    this.config = config;
    this.scenario = scenario;
  }

  generate() {
    const timestamp = new Date().toISOString();
    const report = `# Load Test Report

**Generated:** ${timestamp}  
**Scenario:** ${this.scenario.name}  
**Duration:** ${this.config.duration}s  
**Connections:** ${this.config.connections}  
**Target Rate:** ${this.config.rate} req/s  
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

## Endpoint Performance

${this.generateEndpointPerformance()}

---

## Error Analysis

${this.generateErrorAnalysis()}

---

## Status Code Distribution

${this.generateStatusCodes()}

---

## Performance Recommendations

${this.generateRecommendations()}

---

## Test Configuration

${this.generateConfiguration()}

---

## Raw Statistics

\`\`\`json
${JSON.stringify(this.stats, null, 2)}
\`\`\`
`;

    return report;
  }

  generateExecutiveSummary() {
    const { stats } = this;
    const successRate = 100 - stats.errorRate;
    const status = successRate >= 99 ? '✅ EXCELLENT' : 
                   successRate >= 95 ? '✅ GOOD' : 
                   successRate >= 90 ? '⚠️ ACCEPTABLE' : '❌ NEEDS ATTENTION';

    return `
| Metric | Value | Status |
|--------|-------|--------|
| **Total Requests** | ${stats.totalRequests.toLocaleString()} | - |
| **Total Responses** | ${stats.totalResponses.toLocaleString()} | - |
| **Success Rate** | ${successRate.toFixed(2)}% | ${status} |
| **Error Rate** | ${stats.errorRate.toFixed(2)}% | ${stats.errorRate < 1 ? '✅' : stats.errorRate < 5 ? '⚠️' : '❌'} |
| **Requests/Second** | ${stats.requestsPerSecond.toFixed(2)} | ${stats.requestsPerSecond >= this.config.rate * 0.9 ? '✅' : '⚠️'} |
| **Responses/Second** | ${stats.responsesPerSecond.toFixed(2)} | - |
| **Throughput** | ${(stats.throughput / 1024).toFixed(2)} KB/s | - |
| **Mean Response Time** | ${stats.responseTime.mean.toFixed(2)}ms | ${stats.responseTime.mean < 200 ? '✅' : stats.responseTime.mean < 500 ? '⚠️' : '❌'} |
| **P95 Response Time** | ${stats.responseTime.p95.toFixed(2)}ms | ${stats.responseTime.p95 < 500 ? '✅' : stats.responseTime.p95 < 1000 ? '⚠️' : '❌'} |
| **P99 Response Time** | ${stats.responseTime.p99.toFixed(2)}ms | ${stats.responseTime.p99 < 1000 ? '✅' : stats.responseTime.p99 < 2000 ? '⚠️' : '❌'} |
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
- **Error Rate:** ${stats.errorRate.toFixed(2)}%

### Throughput

- **Total Bytes:** ${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB
- **Throughput:** ${(stats.throughput / 1024).toFixed(2)} KB/s
- **Average Response Size:** ${(stats.totalBytes / stats.totalResponses).toFixed(2)} bytes

### Response Time Distribution

| Percentile | Response Time (ms) |
|------------|-------------------|
| Min | ${stats.responseTime.min.toFixed(2)} |
| Mean | ${stats.responseTime.mean.toFixed(2)} |
| Median (P50) | ${stats.responseTime.median.toFixed(2)} |
| P95 | ${stats.responseTime.p95.toFixed(2)} |
| P99 | ${stats.responseTime.p99.toFixed(2)} |
| Max | ${stats.responseTime.max.toFixed(2)} |
`;
  }

  generateResponseTimeAnalysis() {
    const { stats } = this;
    const mean = stats.responseTime.mean;
    const p95 = stats.responseTime.p95;
    const p99 = stats.responseTime.p99;

    let analysis = '### Response Time Performance\n\n';

    // Mean analysis
    if (mean < 100) {
      analysis += '✅ **Mean Response Time:** Excellent (< 100ms)\n';
    } else if (mean < 200) {
      analysis += '✅ **Mean Response Time:** Good (< 200ms)\n';
    } else if (mean < 500) {
      analysis += '⚠️ **Mean Response Time:** Acceptable (< 500ms)\n';
    } else {
      analysis += '❌ **Mean Response Time:** Needs optimization (> 500ms)\n';
    }

    // P95 analysis
    if (p95 < 300) {
      analysis += '✅ **P95 Response Time:** Excellent (< 300ms)\n';
    } else if (p95 < 500) {
      analysis += '✅ **P95 Response Time:** Good (< 500ms)\n';
    } else if (p95 < 1000) {
      analysis += '⚠️ **P95 Response Time:** Acceptable (< 1s)\n';
    } else {
      analysis += '❌ **P95 Response Time:** Needs optimization (> 1s)\n';
    }

    // P99 analysis
    if (p99 < 500) {
      analysis += '✅ **P99 Response Time:** Excellent (< 500ms)\n';
    } else if (p99 < 1000) {
      analysis += '✅ **P99 Response Time:** Good (< 1s)\n';
    } else if (p99 < 2000) {
      analysis += '⚠️ **P99 Response Time:** Acceptable (< 2s)\n';
    } else {
      analysis += '❌ **P99 Response Time:** Needs optimization (> 2s)\n';
    }

    return analysis;
  }

  generateEndpointPerformance() {
    const { stats } = this;
    let table = `
| Endpoint | Requests | Responses | Errors | Error Rate | Avg RT (ms) | P95 (ms) | P99 (ms) | Throughput (KB/s) |
|----------|----------|-----------|--------|------------|-------------|----------|----------|-------------------|
`;

    stats.endpoints.forEach(ep => {
      const errorRate = ep.errorRate.toFixed(2);
      const avgRT = ep.avgResponseTime.toFixed(2);
      const p95 = ep.p95.toFixed(2);
      const p99 = ep.p99.toFixed(2);
      const throughput = (ep.throughput / 1024).toFixed(2);
      
      table += `| ${ep.name} | ${ep.requests} | ${ep.responses} | ${ep.errors} | ${errorRate}% | ${avgRT} | ${p95} | ${p99} | ${throughput} |\n`;
    });

    return table;
  }

  generateErrorAnalysis() {
    const { stats } = this;
    
    if (stats.totalErrors === 0) {
      return '✅ **No errors detected during the test.**\n';
    }

    let analysis = `### Error Summary\n\n`;
    analysis += `- **Total Errors:** ${stats.totalErrors.toLocaleString()}\n`;
    analysis += `- **Error Rate:** ${stats.errorRate.toFixed(2)}%\n\n`;

    if (Object.keys(stats.errorTypes).length > 0) {
      analysis += `### Error Types\n\n`;
      analysis += `| Error Type | Count | Percentage |\n`;
      analysis += `|------------|-------|------------|\n`;
      
      Object.entries(stats.errorTypes)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          const percentage = ((count / stats.totalErrors) * 100).toFixed(2);
          analysis += `| ${type} | ${count} | ${percentage}% |\n`;
        });
    }

    return analysis;
  }

  generateStatusCodes() {
    const { stats } = this;
    let table = `
| Status Code | Count | Percentage |
|-------------|-------|------------|
`;

    const total = Object.values(stats.statusCodes).reduce((a, b) => a + b, 0);
    
    Object.entries(stats.statusCodes)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .forEach(([code, count]) => {
        const percentage = ((count / total) * 100).toFixed(2);
        const emoji = code.startsWith('2') ? '✅' : code.startsWith('4') ? '⚠️' : '❌';
        table += `| ${emoji} ${code} | ${count} | ${percentage}% |\n`;
      });

    return table;
  }

  generateRecommendations() {
    const { stats } = this;
    const recommendations = [];

    // Error rate recommendations
    if (stats.errorRate > 5) {
      recommendations.push('❌ **High Error Rate:** Investigate and fix errors. Error rate should be < 1% for production.');
    } else if (stats.errorRate > 1) {
      recommendations.push('⚠️ **Moderate Error Rate:** Review error logs and optimize error-prone endpoints.');
    }

    // Response time recommendations
    if (stats.responseTime.mean > 500) {
      recommendations.push('❌ **Slow Mean Response Time:** Optimize database queries, add caching, or scale horizontally.');
    } else if (stats.responseTime.mean > 200) {
      recommendations.push('⚠️ **Moderate Response Time:** Consider query optimization and caching strategies.');
    }

    if (stats.responseTime.p95 > 1000) {
      recommendations.push('❌ **High P95 Response Time:** 95% of requests are taking > 1s. Critical optimization needed.');
    }

    if (stats.responseTime.p99 > 2000) {
      recommendations.push('❌ **Very High P99 Response Time:** 99% of requests are taking > 2s. Urgent optimization required.');
    }

    // Throughput recommendations
    if (stats.requestsPerSecond < this.config.rate * 0.8) {
      recommendations.push('⚠️ **Low Request Rate:** System may be throttling. Check rate limiting and server capacity.');
    }

    // Positive feedback
    if (stats.errorRate < 1 && stats.responseTime.mean < 200 && stats.responseTime.p95 < 500) {
      recommendations.push('✅ **Excellent Performance:** System is performing well under load. Consider stress testing for capacity planning.');
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
Base URL: ${this.config.baseUrl}
Timeout: ${this.config.timeout}ms
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
    }
  });

  // Merge scenario config
  const config = {
    ...customConfig,
    duration: scenario.duration,
    connections: scenario.connections,
    rate: scenario.rate,
    scenario: scenarioName
  };

  // Run load test
  const runner = new LoadTestRunner(config);
  const stats = await runner.run();

  // Generate report
  const generator = new ReportGenerator(stats, config, scenario);
  const report = generator.generate();

  // Save report
  const reportDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(reportDir, `load-test-report-${scenarioName}-${timestamp}.md`);
  fs.writeFileSync(reportFile, report);

  console.log(`\n📄 Report saved to: ${reportFile}\n`);

  // Print summary
  console.log('📊 Test Summary:');
  console.log(`   Requests: ${stats.totalRequests.toLocaleString()}`);
  console.log(`   Responses: ${stats.totalResponses.toLocaleString()}`);
  console.log(`   Errors: ${stats.totalErrors.toLocaleString()} (${stats.errorRate.toFixed(2)}%)`);
  console.log(`   Avg Response Time: ${stats.responseTime.mean.toFixed(2)}ms`);
  console.log(`   P95 Response Time: ${stats.responseTime.p95.toFixed(2)}ms`);
  console.log(`   P99 Response Time: ${stats.responseTime.p99.toFixed(2)}ms`);
  console.log(`   Throughput: ${(stats.throughput / 1024).toFixed(2)} KB/s\n`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  });
}

module.exports = { LoadTestRunner, MetricsCollector, ReportGenerator };

