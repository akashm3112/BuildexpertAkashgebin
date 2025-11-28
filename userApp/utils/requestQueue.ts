import { storage } from './storage';
import { API_BASE_URL } from '@/constants/api';
import { tokenManager } from './tokenManager';
import { globalErrorHandler } from './globalErrorHandler';

export enum RequestPriority {
  CRITICAL = 0,    // Login, payment, critical updates
  HIGH = 1,        // Bookings, notifications
  NORMAL = 2,      // General API calls
  LOW = 3,         // Analytics, non-critical updates
}

export enum NetworkSpeed {
  FAST = 'fast',           // > 1 Mbps
  MODERATE = 'moderate',   // 100 Kbps - 1 Mbps
  SLOW = 'slow',           // < 100 Kbps
  UNKNOWN = 'unknown',
}

export interface QueuedRequest {
  id: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  priority: RequestPriority;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  lastAttemptAt?: number;
  metadata?: Record<string, any>;
}

interface RequestQueueConfig {
  maxQueueSize: number;
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
  persistenceKey: string;
}

const DEFAULT_CONFIG: RequestQueueConfig = {
  maxQueueSize: 100,
  maxRetries: 5,
  retryDelay: 2000, // 2 seconds
  batchSize: 5, // Process 5 requests at a time
  persistenceKey: 'request_queue',
};

class RequestQueueManager {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private isOnline = true;
  private networkSpeed: NetworkSpeed = NetworkSpeed.UNKNOWN;
  private networkSpeedKbps: number = 0;
  private networkListener: (() => void) | null = null;
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private saveQueueTimeout: ReturnType<typeof setTimeout> | null = null;
  private speedCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastSpeedCheck: number = 0;
  private config: RequestQueueConfig;

  constructor(config: Partial<RequestQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  /**
   * Initialize the queue manager
   */
  private async initialize() {
    // Load persisted queue
    await this.loadQueue();

    // Check initial network status
    await this.checkNetworkStatus();

    // Check initial network speed
    await this.checkNetworkSpeed();

    // Start processing interval
    this.startProcessingInterval();

    // Start periodic speed checks
    this.startSpeedCheckInterval();

    // Setup network listener
    this.setupNetworkListener();
  }

  /**
   * Setup network connectivity listener
   */
  private setupNetworkListener() {
    // Use NetInfo if available, otherwise fallback to periodic checks
    try {
      const NetInfo = require('@react-native-community/netinfo');
      
      // NetInfo.addEventListener returns an unsubscribe function
      this.networkListener = NetInfo.addEventListener((state: any) => {
        const wasOffline = !this.isOnline;
        this.isOnline = state.isConnected && state.isInternetReachable !== false;
        
        // If network just came back online, check speed and process queue
        if (wasOffline && this.isOnline) {
          console.log('🌐 Network restored, checking speed and processing queued requests...');
          this.checkNetworkSpeed().then(async () => {
            // Trigger connection recovery to validate/refresh tokens
            try {
              const { connectionRecovery } = await import('./connectionRecovery');
              await connectionRecovery.triggerRecovery();
            } catch (error) {
              console.warn('Failed to trigger connection recovery:', error);
            }
            // Process queued requests after recovery
            this.processQueue();
          });
        } else if (!this.isOnline) {
          console.log('📴 Network offline, requests will be queued');
          this.networkSpeed = NetworkSpeed.UNKNOWN;
        } else if (this.isOnline) {
          // Network status changed, recheck speed
          this.checkNetworkSpeed();
        }
      });
    } catch (error) {
      // NetInfo not available, use periodic checks
      console.warn('NetInfo not available, using periodic network checks');
      setInterval(() => this.checkNetworkStatus(), 5000);
    }
  }

  /**
   * Check network status
   */
  private async checkNetworkStatus(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });
      
      clearTimeout(timeoutId);
      this.isOnline = response.ok;
      return this.isOnline;
    } catch {
      this.isOnline = false;
      return false;
    }
  }

  /**
   * Check network speed by downloading a small resource
   */
  private async checkNetworkSpeed(): Promise<NetworkSpeed> {
    // Don't check too frequently (max once per 30 seconds)
    const now = Date.now();
    if (now - this.lastSpeedCheck < 30000 && this.networkSpeed !== NetworkSpeed.UNKNOWN) {
      return this.networkSpeed;
    }

    try {
      const testUrl = 'https://www.google.com/favicon.ico'; // ~4KB file
      const startTime = Date.now();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(testUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.networkSpeed = NetworkSpeed.UNKNOWN;
        return this.networkSpeed;
      }

      // Read response to measure actual download speed
      const blob = await response.blob();
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // seconds
      const sizeBytes = blob.size;
      const sizeKbps = (sizeBytes * 8) / 1000; // Convert bytes to kilobits
      const speedKbps = sizeKbps / duration;

      this.networkSpeedKbps = speedKbps;
      this.lastSpeedCheck = now;

      // Classify speed
      if (speedKbps > 1000) {
        this.networkSpeed = NetworkSpeed.FAST;
      } else if (speedKbps > 100) {
        this.networkSpeed = NetworkSpeed.MODERATE;
      } else {
        this.networkSpeed = NetworkSpeed.SLOW;
      }

      console.log(`📊 Network speed: ${speedKbps.toFixed(2)} Kbps (${this.networkSpeed})`);
      return this.networkSpeed;
    } catch (error) {
      // If speed check fails, assume slow connection
      this.networkSpeed = NetworkSpeed.SLOW;
      this.networkSpeedKbps = 0;
      return this.networkSpeed;
    }
  }

  /**
   * Start periodic network speed checks
   */
  private startSpeedCheckInterval() {
    // Check speed every 2 minutes
    this.speedCheckInterval = setInterval(() => {
      if (this.isOnline) {
        this.checkNetworkSpeed();
      }
    }, 120000); // 2 minutes
  }

  /**
   * Simple hash function for React Native (replaces btoa)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 16);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(endpoint: string, method: string, body?: string): string {
    const bodyHash = body ? this.simpleHash(body) : '';
    return `${method}_${endpoint}_${bodyHash}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Add request to queue
   */
  async enqueue(
    endpoint: string,
    options: RequestInit = {},
    priority: RequestPriority = RequestPriority.NORMAL,
    metadata?: Record<string, any>
  ): Promise<string> {
    const requestId = this.generateRequestId(endpoint, options.method || 'GET', options.body as string);
    
    // Check for duplicates (same endpoint, method, body)
    const existingIndex = this.queue.findIndex(
      req => req.endpoint === endpoint && 
             req.method === (options.method || 'GET') &&
             req.body === (options.body as string)
    );

      if (existingIndex !== -1) {
      // Update priority if new request has higher priority
      if (priority < this.queue[existingIndex].priority) {
        this.queue[existingIndex].priority = priority;
        this.queue[existingIndex].retryCount = 0; // Reset retry count on priority update
        this.debouncedSaveQueue();
      }
      return this.queue[existingIndex].id;
    }

    // Get current token for headers
    const token = await tokenManager.getValidToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(options.headers as Record<string, string>),
    };

    const queuedRequest: QueuedRequest = {
      id: requestId,
      endpoint,
      method: options.method || 'GET',
      headers,
      body: options.body as string,
      priority,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      createdAt: Date.now(),
      metadata,
    };

    // Add to queue (sorted by priority)
    this.queue.push(queuedRequest);
    this.queue.sort((a, b) => a.priority - b.priority);

    // Enforce max queue size (remove lowest priority items)
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(0, this.config.maxQueueSize);
    }

    this.debouncedSaveQueue();

    // Try to process immediately if online
    if (this.isOnline) {
      this.processQueue();
    }

    return requestId;
  }

  /**
   * Remove request from queue
   */
  async dequeue(requestId: string): Promise<boolean> {
    const index = this.queue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.debouncedSaveQueue();
      return true;
    }
    return false;
  }

  /**
   * Update network speed estimate based on request performance
   */
  private updateSpeedEstimate(response: Response, duration: number) {
    // Estimate speed based on response time and content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && duration > 0) {
      const sizeBytes = parseInt(contentLength, 10);
      const sizeKbps = (sizeBytes * 8) / 1000;
      const estimatedSpeed = sizeKbps / duration;

      // Use exponential moving average for smoother estimates
      const alpha = 0.3; // Smoothing factor
      this.networkSpeedKbps = alpha * estimatedSpeed + (1 - alpha) * this.networkSpeedKbps;

      // Update speed classification
      if (this.networkSpeedKbps > 1000) {
        this.networkSpeed = NetworkSpeed.FAST;
      } else if (this.networkSpeedKbps > 100) {
        this.networkSpeed = NetworkSpeed.MODERATE;
      } else if (this.networkSpeedKbps > 0) {
        this.networkSpeed = NetworkSpeed.SLOW;
      }
    } else if (duration > 5) {
      // If request takes > 5 seconds, assume slow connection
      if (this.networkSpeed === NetworkSpeed.FAST) {
        this.networkSpeed = NetworkSpeed.MODERATE;
      } else if (this.networkSpeed === NetworkSpeed.MODERATE) {
        this.networkSpeed = NetworkSpeed.SLOW;
      }
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = this.config.retryDelay;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const maxDelay = 30000; // Max 30 seconds
    return Math.min(exponentialDelay, maxDelay);
  }

  /**
   * Get adaptive batch size based on network speed
   */
  private getAdaptiveBatchSize(): number {
    switch (this.networkSpeed) {
      case NetworkSpeed.FAST:
        return this.config.batchSize; // Full batch size
      case NetworkSpeed.MODERATE:
        return Math.max(2, Math.floor(this.config.batchSize / 2)); // Half batch
      case NetworkSpeed.SLOW:
        return 1; // One at a time
      default:
        return Math.max(1, Math.floor(this.config.batchSize / 2)); // Conservative
    }
  }

  /**
   * Get adaptive retry delay multiplier based on network speed
   */
  private getAdaptiveDelayMultiplier(): number {
    switch (this.networkSpeed) {
      case NetworkSpeed.FAST:
        return 1.0; // Normal delay
      case NetworkSpeed.MODERATE:
        return 1.5; // 50% longer
      case NetworkSpeed.SLOW:
        return 2.0; // Double delay
      default:
        return 1.5; // Conservative
    }
  }

  /**
   * Check if request should be processed based on network speed and priority
   */
  private shouldProcessRequest(request: QueuedRequest): boolean {
    // On slow connections, skip LOW priority requests
    if (this.networkSpeed === NetworkSpeed.SLOW && request.priority === RequestPriority.LOW) {
      return false;
    }

    // On moderate connections, process LOW priority less frequently
    if (this.networkSpeed === NetworkSpeed.MODERATE && request.priority === RequestPriority.LOW) {
      // Process LOW priority only 30% of the time
      return Math.random() < 0.3;
    }

    // Always process CRITICAL, HIGH, and NORMAL priority
    return true;
  }

  /**
   * Optimize request body for bandwidth (compress if large)
   */
  private optimizeRequestBody(body?: string): string | undefined {
    if (!body) return undefined;

    // If body is large (> 10KB) and connection is slow, consider optimization
    const bodySize = new Blob([body]).size;
    const isLarge = bodySize > 10240; // 10KB

    if (isLarge && (this.networkSpeed === NetworkSpeed.SLOW || this.networkSpeed === NetworkSpeed.MODERATE)) {
      // For slow connections, we could compress here
      // For now, we'll just log a warning
      console.warn(`⚠️ Large request body (${(bodySize / 1024).toFixed(2)}KB) on ${this.networkSpeed} connection`);
    }

    return body;
  }

  /**
   * Process queued requests
   */
  private async processQueue() {
    if (this.isProcessing || !this.isOnline || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get adaptive batch size based on network speed
      const adaptiveBatchSize = this.getAdaptiveBatchSize();
      
      // Filter requests based on network speed and priority
      const eligibleRequests = this.queue
        .filter(req => this.shouldProcessRequest(req))
        .slice(0, adaptiveBatchSize);

      // If no eligible requests and we have LOW priority requests, process one anyway
      if (eligibleRequests.length === 0 && this.queue.length > 0) {
        eligibleRequests.push(this.queue[0]);
      }

      if (eligibleRequests.length === 0) {
        this.isProcessing = false;
        return;
      }

      const successfulIds = new Set<string>();
      const failedRequests: QueuedRequest[] = [];
      
      // Process requests in parallel (or sequentially for slow connections)
      if (this.networkSpeed === NetworkSpeed.SLOW) {
        // Sequential processing for slow connections
        for (const request of eligibleRequests) {
          const result = await this.processRequest(request);
          if (result) {
            successfulIds.add(request.id);
          } else {
            failedRequests.push(request);
          }
        }
      } else {
        // Parallel processing for fast/moderate connections
        const results = await Promise.allSettled(
          eligibleRequests.map(request => this.processRequest(request))
        );

        // Process results
        results.forEach((result, index) => {
          const request = eligibleRequests[index];
          if (result.status === 'fulfilled' && result.value === true) {
            // Success - mark for removal
            successfulIds.add(request.id);
          } else {
            // Failed - keep in queue for retry
            failedRequests.push(request);
          }
        });
      }

      // Remove successfully processed requests from queue
      this.queue = this.queue.filter(req => !successfulIds.has(req.id));

      // Debounced save (only save once after processing batch)
      this.debouncedSaveQueue();

      // Continue processing if there are more requests
      if (this.queue.length > 0) {
        // Use adaptive delay based on network speed
        const baseDelay = failedRequests.length > 0 
          ? this.calculateRetryDelay(failedRequests[0].retryCount)
          : this.config.retryDelay;
        
        const adaptiveDelay = baseDelay * this.getAdaptiveDelayMultiplier();
        
        setTimeout(() => this.processQueue(), adaptiveDelay);
      }
    } catch (error) {
      console.error('Error processing request queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single request
   * Returns true if successful (removed from queue), false otherwise (kept in queue for retry)
   */
  private async processRequest(request: QueuedRequest): Promise<boolean> {
    try {
      // Update token if needed
      const token = await tokenManager.getValidToken();
      if (token) {
        request.headers['Authorization'] = `Bearer ${token}`;
      }

      // Optimize request body for bandwidth
      const optimizedBody = this.optimizeRequestBody(request.body);

      // Measure request time for speed detection
      const requestStartTime = Date.now();
      
      const response = await fetch(`${API_BASE_URL}${request.endpoint}`, {
        method: request.method,
        headers: request.headers,
        body: optimizedBody,
      });

      // Update network speed estimate based on response time
      const requestDuration = (Date.now() - requestStartTime) / 1000;
      this.updateSpeedEstimate(response, requestDuration);

      // Handle 401 - refresh token and retry
      if (response.status === 401) {
        const refreshedToken = await tokenManager.forceRefreshToken();
        if (refreshedToken) {
          request.headers['Authorization'] = `Bearer ${refreshedToken}`;
          // Retry immediately with new token (don't increment retry count)
          return this.processRequest(request);
        } else {
          // Token refresh failed, remove from queue
          return true; // Mark as "processed" so it gets removed
        }
      }

      // Success - reset retry count and remove from queue
      if (response.ok) {
        request.retryCount = 0; // Reset retry count on success
        return true; // Mark as successful to remove from queue
      }

      // Client errors (4xx except 408) - don't retry, remove from queue
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        return true; // Mark as "processed" so it gets removed
      }

      // Server error (5xx) or timeout (408) - increment retry count and keep in queue
      request.retryCount++;
      request.lastAttemptAt = Date.now();

      if (request.retryCount >= request.maxRetries) {
        // Max retries reached, remove from queue
        console.warn(`Request ${request.id} exceeded max retries, removing from queue`);
        return true; // Mark as "processed" so it gets removed
      }

      // Keep in queue for retry (will be saved via debounced save)
      return false;
    } catch (error) {
      // Network error - increment retry count and keep in queue
      request.retryCount++;
      request.lastAttemptAt = Date.now();

      if (request.retryCount >= request.maxRetries) {
        console.warn(`Request ${request.id} exceeded max retries after error:`, error);
        return true; // Mark as "processed" so it gets removed
      }

      // Keep in queue for retry (will be saved via debounced save)
      return false;
    }
  }

  /**
   * Start processing interval
   */
  private startProcessingInterval() {
    // Process queue every 10 seconds if online
    this.processingInterval = setInterval(() => {
      if (this.isOnline && this.queue.length > 0 && !this.isProcessing) {
        this.processQueue();
      }
    }, 10000);
  }

  /**
   * Load queue from storage
   */
  private async loadQueue() {
    try {
      const saved = await storage.getJSON<QueuedRequest[]>(this.config.persistenceKey, {
        maxRetries: 2,
      });
      
      if (saved && Array.isArray(saved)) {
        // Filter out old requests (older than 24 hours)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.queue = saved.filter(req => req.createdAt > oneDayAgo);
        
        // Sort by priority
        this.queue.sort((a, b) => a.priority - b.priority);
        
        console.log(`📦 Loaded ${this.queue.length} queued requests from storage`);
      }
    } catch (error) {
      console.error('Error loading request queue:', error);
      this.queue = [];
    }
  }

  /**
   * Debounced save queue to storage (prevents excessive writes)
   */
  private debouncedSaveQueue() {
    // Clear existing timeout
    if (this.saveQueueTimeout) {
      clearTimeout(this.saveQueueTimeout);
    }

    // Set new timeout (debounce for 500ms)
    this.saveQueueTimeout = setTimeout(() => {
      this.saveQueue();
      this.saveQueueTimeout = null;
    }, 500);
  }

  /**
   * Save queue to storage (immediate, no debounce)
   */
  private async saveQueue() {
    try {
      await storage.setJSON(this.config.persistenceKey, this.queue, {
        maxRetries: 3,
        priority: 'normal', // Request queue is normal priority
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // Expire after 24 hours
      });
    } catch (error) {
      console.error('Error saving request queue:', error);
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      size: this.queue.length,
      isProcessing: this.isProcessing,
      isOnline: this.isOnline,
      networkSpeed: this.networkSpeed,
      networkSpeedKbps: this.networkSpeedKbps.toFixed(2),
      adaptiveBatchSize: this.getAdaptiveBatchSize(),
      requests: this.queue.map(req => ({
        id: req.id,
        endpoint: req.endpoint,
        priority: req.priority,
        retryCount: req.retryCount,
        createdAt: new Date(req.createdAt).toISOString(),
      })),
    };
  }

  /**
   * Clear queue
   */
  async clearQueue() {
    this.queue = [];
    // Clear debounce timeout and save immediately
    if (this.saveQueueTimeout) {
      clearTimeout(this.saveQueueTimeout);
      this.saveQueueTimeout = null;
    }
    await this.saveQueue();
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    if (this.speedCheckInterval) {
      clearInterval(this.speedCheckInterval);
      this.speedCheckInterval = null;
    }
    if (this.saveQueueTimeout) {
      clearTimeout(this.saveQueueTimeout);
      this.saveQueueTimeout = null;
    }
    if (this.networkListener) {
      this.networkListener(); // Unsubscribe from NetInfo
      this.networkListener = null;
    }
  }
}

// Export singleton instance
export const requestQueue = new RequestQueueManager();


