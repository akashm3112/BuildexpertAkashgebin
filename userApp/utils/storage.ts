
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StorageRetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface StorageMetadata {
  key: string;
  size: number;
  lastAccessed: number;
  createdAt: number;
  expiresAt?: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
}

export interface StorageStats {
  totalSize: number;
  totalKeys: number;
  usagePercentage: number;
  largestKeys: Array<{ key: string; size: number }>;
  oldestKeys: Array<{ key: string; age: number }>;
}

const DEFAULT_OPTIONS: Required<StorageRetryOptions> = {
  maxRetries: 3,
  retryDelay: 100, // Initial delay in ms
  exponentialBackoff: true,
  onRetry: () => {},
};

// Storage configuration
const STORAGE_CONFIG = {
  MAX_SIZE_MB: 5, // Maximum storage size in MB (AsyncStorage typically has ~6MB limit)
  WARNING_THRESHOLD: 0.8, // Warn when 80% full
  CLEANUP_THRESHOLD: 0.9, // Auto-cleanup when 90% full
  METADATA_KEY: '__storage_metadata__',
  CLEANUP_INTERVAL_MS: 24 * 60 * 60 * 1000, // Cleanup every 24 hours
  MAX_AGE_DAYS: {
    critical: Infinity, // Never expire
    high: 30, // 30 days
    normal: 7, // 7 days
    low: 1, // 1 day
  },
};

// Keys that should never be cleaned up
const PROTECTED_KEYS = [
  'user',
  'accessToken',
  'refreshToken',
  'accessTokenExpiresAt',
  'refreshTokenExpiresAt',
  'selectedLanguage',
  STORAGE_CONFIG.METADATA_KEY,
];

/**
 * Calculate delay for retry with exponential backoff
 */
const calculateRetryDelay = (
  attempt: number,
  baseDelay: number,
  exponentialBackoff: boolean
): number => {
  if (!exponentialBackoff) {
    return baseDelay;
  }
  return Math.min(baseDelay * Math.pow(2, attempt), 2000); // Max 2 seconds
};

/**
 * Retry wrapper for AsyncStorage operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: StorageRetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Call retry callback
      opts.onRetry(attempt + 1, lastError);

      // Wait before retrying
      const delay = calculateRetryDelay(attempt, opts.retryDelay, opts.exponentialBackoff);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError || new Error('Storage operation failed after retries');
}

/**
 * Storage Manager - Handles monitoring, cleanup, and size management
 */
class StorageManager {
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private metadataCache: Map<string, StorageMetadata> = new Map();
  private lastCleanupTime: number = 0;

  /**
   * Initialize storage manager
   */
  async initialize() {
    // Load metadata
    await this.loadMetadata();
    
    // Run initial cleanup check
    await this.checkAndCleanup();
    
    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  /**
   * Calculate size of a string in bytes
   */
  private calculateSize(value: string): number {
    // UTF-16 encoding: 2 bytes per character (approximate)
    return value.length * 2;
  }

  /**
   * Get storage metadata
   */
  private async loadMetadata(): Promise<void> {
    try {
      const metadataStr = await AsyncStorage.getItem(STORAGE_CONFIG.METADATA_KEY);
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr) as Record<string, StorageMetadata>;
        this.metadataCache = new Map(Object.entries(metadata));
      }
    } catch (error) {
      console.warn('Failed to load storage metadata:', error);
      this.metadataCache = new Map();
    }
  }

  /**
   * Save storage metadata
   */
  private async saveMetadata(): Promise<void> {
    try {
      const metadataObj = Object.fromEntries(this.metadataCache);
      await AsyncStorage.setItem(STORAGE_CONFIG.METADATA_KEY, JSON.stringify(metadataObj));
    } catch (error) {
      console.warn('Failed to save storage metadata:', error);
    }
  }

  /**
   * Update metadata for a key
   */
  private async updateMetadata(
    key: string,
    size: number,
    priority: StorageMetadata['priority'] = 'normal',
    expiresAt?: number
  ): Promise<void> {
    const now = Date.now();
    const existing = this.metadataCache.get(key);
    
    this.metadataCache.set(key, {
      key,
      size,
      lastAccessed: now,
      createdAt: existing?.createdAt || now,
      expiresAt,
      priority,
    });

    // Debounce metadata saves (save every 5 seconds max)
    if (now - this.lastCleanupTime > 5000) {
      await this.saveMetadata();
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const stats: StorageStats = {
        totalSize: 0,
        totalKeys: allKeys.length,
        usagePercentage: 0,
        largestKeys: [],
        oldestKeys: [],
      };

      const keySizes: Array<{ key: string; size: number }> = [];
      const keyAges: Array<{ key: string; age: number }> = [];

      // Get all items to calculate sizes
      const items = await AsyncStorage.multiGet(allKeys);
      
      for (const [key, value] of items) {
        if (key === STORAGE_CONFIG.METADATA_KEY) continue;
        
        const size = value ? this.calculateSize(value) : 0;
        stats.totalSize += size;
        
        keySizes.push({ key, size });
        
        const metadata = this.metadataCache.get(key);
        if (metadata) {
          const age = Date.now() - metadata.createdAt;
          keyAges.push({ key, age });
        }
      }

      // Sort and get top 10 largest/oldest
      stats.largestKeys = keySizes
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);
      
      stats.oldestKeys = keyAges
        .sort((a, b) => b.age - a.age)
        .slice(0, 10);

      // Calculate usage percentage
      const maxSizeBytes = STORAGE_CONFIG.MAX_SIZE_MB * 1024 * 1024;
      stats.usagePercentage = (stats.totalSize / maxSizeBytes) * 100;

      return stats;
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        totalSize: 0,
        totalKeys: 0,
        usagePercentage: 0,
        largestKeys: [],
        oldestKeys: [],
      };
    }
  }

  /**
   * Check if storage needs cleanup
   */
  private async checkAndCleanup(): Promise<void> {
    try {
      const stats = await this.getStorageStats();
      
      // Check if we're over the cleanup threshold
      if (stats.usagePercentage >= STORAGE_CONFIG.CLEANUP_THRESHOLD * 100) {
        console.warn(`⚠️ Storage is ${stats.usagePercentage.toFixed(2)}% full, starting cleanup...`);
        await this.performCleanup(true); // Aggressive cleanup
      } else if (stats.usagePercentage >= STORAGE_CONFIG.WARNING_THRESHOLD * 100) {
        console.warn(`⚠️ Storage is ${stats.usagePercentage.toFixed(2)}% full, performing light cleanup...`);
        await this.performCleanup(false); // Light cleanup
      } else {
        // Always clean up expired items
        await this.cleanupExpiredItems();
      }
    } catch (error) {
      console.error('Error during storage cleanup check:', error);
    }
  }

  /**
   * Clean up expired items
   */
  private async cleanupExpiredItems(): Promise<void> {
    try {
      const now = Date.now();
      const keysToRemove: string[] = [];

      for (const [key, metadata] of this.metadataCache.entries()) {
        // Skip protected keys
        if (PROTECTED_KEYS.includes(key)) continue;

        // Check if expired
        if (metadata.expiresAt && metadata.expiresAt < now) {
          keysToRemove.push(key);
          continue;
        }

        // Check if exceeded max age
        const age = now - metadata.createdAt;
        const maxAge = STORAGE_CONFIG.MAX_AGE_DAYS[metadata.priority] * 24 * 60 * 60 * 1000;
        if (maxAge !== Infinity && age > maxAge) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        keysToRemove.forEach(key => this.metadataCache.delete(key));
        await this.saveMetadata();
        console.log(`🧹 Cleaned up ${keysToRemove.length} expired/old items`);
      }
    } catch (error) {
      console.error('Error cleaning up expired items:', error);
    }
  }

  /**
   * Perform cleanup based on priority and age
   */
  private async performCleanup(aggressive: boolean): Promise<void> {
    try {
      // First, clean up expired items
      await this.cleanupExpiredItems();

      const stats = await this.getStorageStats();
      
      // If still over threshold, remove low priority items
      if (stats.usagePercentage >= STORAGE_CONFIG.CLEANUP_THRESHOLD * 100 || aggressive) {
        const keysToRemove: string[] = [];
        const now = Date.now();

        // Sort by priority and age (low priority + old = first to remove)
        const sortedEntries = Array.from(this.metadataCache.entries())
          .filter(([key]) => !PROTECTED_KEYS.includes(key))
          .sort((a, b) => {
            const priorityOrder = { low: 0, normal: 1, high: 2, critical: 3 };
            const priorityDiff = priorityOrder[a[1].priority] - priorityOrder[b[1].priority];
            if (priorityDiff !== 0) return priorityDiff;
            
            // If same priority, older items first
            return a[1].createdAt - b[1].createdAt;
          });

        // Remove low priority items first
        for (const [key, metadata] of sortedEntries) {
          if (metadata.priority === 'low') {
            keysToRemove.push(key);
          } else if (aggressive && metadata.priority === 'normal') {
            // In aggressive mode, also remove old normal priority items
            const age = now - metadata.createdAt;
            if (age > 3 * 24 * 60 * 60 * 1000) { // Older than 3 days
              keysToRemove.push(key);
            }
          }

          // Stop if we've freed enough space
          const estimatedFreed = keysToRemove.reduce((sum, k) => {
            const meta = this.metadataCache.get(k);
            return sum + (meta?.size || 0);
          }, 0);
          
          const estimatedUsage = ((stats.totalSize - estimatedFreed) / (STORAGE_CONFIG.MAX_SIZE_MB * 1024 * 1024)) * 100;
          if (estimatedUsage < STORAGE_CONFIG.CLEANUP_THRESHOLD * 100) {
            break;
          }
        }

        if (keysToRemove.length > 0) {
          await AsyncStorage.multiRemove(keysToRemove);
          keysToRemove.forEach(key => this.metadataCache.delete(key));
          await this.saveMetadata();
          console.log(`🧹 Cleaned up ${keysToRemove.length} low priority items`);
        }
      }
    } catch (error) {
      console.error('Error performing cleanup:', error);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.checkAndCleanup();
    }, STORAGE_CONFIG.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get metadata for a key
   */
  getMetadata(key: string): StorageMetadata | undefined {
    return this.metadataCache.get(key);
  }
}

// Global storage manager instance
const storageManager = new StorageManager();

/**
 * Storage utility class with retry mechanism
 */
export class Storage {
  /**
   * Set item with retry and metadata tracking
   */
  static async setItem(
    key: string,
    value: string,
    options?: StorageRetryOptions & {
      priority?: StorageMetadata['priority'];
      expiresAt?: number;
    }
  ): Promise<void> {
    return withRetry(
      async () => {
        // Check storage before writing
        const stats = await storageManager.getStorageStats();
        if (stats.usagePercentage >= STORAGE_CONFIG.CLEANUP_THRESHOLD * 100) {
          await storageManager['performCleanup'](true);
        }

        await AsyncStorage.setItem(key, value);
        
        // Update metadata
        const size = storageManager['calculateSize'](value);
        await storageManager['updateMetadata'](
          key,
          size,
          options?.priority || 'normal',
          options?.expiresAt
        );
      },
      options
    );
  }

  /**
   * Get item with retry and access tracking
   */
  static async getItem(
    key: string,
    options?: StorageRetryOptions
  ): Promise<string | null> {
    return withRetry(
      async () => {
        const value = await AsyncStorage.getItem(key);
        
        // Update last accessed time
        if (value) {
          const metadata = storageManager.getMetadata(key);
          if (metadata) {
            const size = storageManager['calculateSize'](value);
            await storageManager['updateMetadata'](
              key,
              size,
              metadata.priority,
              metadata.expiresAt
            );
          }
        }
        
        return value;
      },
      options
    );
  }

  /**
   * Remove item with retry and metadata cleanup
   */
  static async removeItem(
    key: string,
    options?: StorageRetryOptions
  ): Promise<void> {
    return withRetry(
      async () => {
        await AsyncStorage.removeItem(key);
        
        // Remove from metadata
        storageManager['metadataCache'].delete(key);
        await storageManager['saveMetadata']();
      },
      options
    );
  }

  /**
   * Multi-set with retry
   */
  static async multiSet(
    keyValuePairs: [string, string][],
    options?: StorageRetryOptions
  ): Promise<void> {
    return withRetry(
      async () => {
        await AsyncStorage.multiSet(keyValuePairs);
      },
      options
    );
  }

  /**
   * Multi-get with retry
   */
  static async multiGet(
    keys: string[],
    options?: StorageRetryOptions
  ): Promise<[string, string | null][]> {
    return withRetry(
      async () => {
        const result = await AsyncStorage.multiGet(keys);
        return result as [string, string | null][];
      },
      options
    );
  }

  /**
   * Multi-remove with retry
   */
  static async multiRemove(
    keys: string[],
    options?: StorageRetryOptions
  ): Promise<void> {
    return withRetry(
      async () => {
        await AsyncStorage.multiRemove(keys);
      },
      options
    );
  }

  /**
   * Get all keys with retry
   */
  static async getAllKeys(
    options?: StorageRetryOptions
  ): Promise<string[]> {
    return withRetry(
      async () => {
        const result = await AsyncStorage.getAllKeys();
        return [...result]; // Convert readonly array to mutable array
      },
      options
    );
  }

  /**
   * Clear all storage with retry
   */
  static async clear(options?: StorageRetryOptions): Promise<void> {
    return withRetry(
      async () => {
        await AsyncStorage.clear();
      },
      options
    );
  }

  /**
   * Set JSON object with retry and metadata tracking
   */
  static async setJSON<T>(
    key: string,
    value: T,
    options?: StorageRetryOptions & {
      priority?: StorageMetadata['priority'];
      expiresAt?: number;
    }
  ): Promise<void> {
    return this.setItem(key, JSON.stringify(value), options);
  }

  /**
   * Get storage statistics
   */
  static async getStorageStats(): Promise<StorageStats> {
    return storageManager.getStorageStats();
  }

  /**
   * Manually trigger cleanup
   */
  static async cleanup(aggressive: boolean = false): Promise<void> {
    await storageManager['performCleanup'](aggressive);
  }

  /**
   * Initialize storage manager (call this on app startup)
   */
  static async initialize(): Promise<void> {
    await storageManager.initialize();
  }

  /**
   * Get JSON object with retry
   */
  static async getJSON<T>(
    key: string,
    options?: StorageRetryOptions
  ): Promise<T | null> {
    try {
      const item = await this.getItem(key, options);
      if (item === null) {
        return null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      // If JSON parse fails, it's a data corruption issue
      // Remove the corrupted item
      try {
        await this.removeItem(key, { maxRetries: 1 });
      } catch {
        // Ignore removal errors
      }
      throw new Error(`Failed to parse stored JSON for key "${key}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance for convenience
export const storage = Storage;

// Initialize storage manager on import (will be called when app starts)
// Note: This is safe to call multiple times
storage.initialize().catch(error => {
  console.error('Failed to initialize storage manager:', error);
});

