function quickselect(arr, k, left = 0, right = arr.length - 1) {
  if (left === right) return arr[left];
  
  const pivotIndex = partition(arr, left, right);
  
  if (k === pivotIndex) {
    return arr[k];
  } else if (k < pivotIndex) {
    return quickselect(arr, k, left, pivotIndex - 1);
  } else {
    return quickselect(arr, k, pivotIndex + 1, right);
  }
}

function partition(arr, left, right) {
  const pivot = arr[right];
  let i = left;
  
  for (let j = left; j < right; j++) {
    if (arr[j] <= pivot) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      i++;
    }
  }
  
  [arr[i], arr[right]] = [arr[right], arr[i]];
  return i;
}

/**
 * Calculate approximate percentiles using quickselect
 * Much faster than sorting entire array: O(n) vs O(n log n)
 */
function calculatePercentiles(values, percentiles = [0.5, 0.95, 0.99]) {
  if (values.length === 0) {
    return {
      average: 0,
      percentiles: percentiles.reduce((acc, p) => {
        acc[`p${Math.round(p * 100)}`] = 0;
        return acc;
      }, {})
    };
  }

  // Calculate average (O(n))
  const sum = values.reduce((a, b) => a + b, 0);
  const average = sum / values.length;

  // For small arrays, just sort (faster than quickselect overhead)
  if (values.length < 100) {
    const sorted = [...values].sort((a, b) => a - b);
    const result = { average };
    percentiles.forEach(p => {
      const index = Math.floor(sorted.length * p);
      result[`p${Math.round(p * 100)}`] = sorted[index] || 0;
    });
    return result;
  }

  // For larger arrays, use quickselect for each percentile
  // Create a copy to avoid mutating original
  const copy = [...values];
  const result = { average };

  percentiles.forEach(p => {
    const k = Math.floor(copy.length * p);
    // Reset copy for each percentile (quickselect mutates)
    const workingCopy = [...values];
    result[`p${Math.round(p * 100)}`] = quickselect(workingCopy, k);
  });

  return result;
}

/**
 * Incremental percentile calculation using running statistics
 * Updates percentiles without recalculating from scratch
 * Uses exponential moving average for approximate percentiles
 */
class IncrementalPercentiles {
  constructor() {
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
    
    // Buckets for approximate percentiles (histogram approach)
    this.buckets = new Array(100).fill(0); // 100 buckets
    this.bucketSize = 100; // Each bucket represents 100ms range
  }

  /**
   * Add a value (O(1))
   */
  add(value) {
    this.count++;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);
    
    // Add to appropriate bucket
    const bucketIndex = Math.min(
      Math.floor(value / this.bucketSize),
      this.buckets.length - 1
    );
    this.buckets[bucketIndex]++;
  }

  /**
   * Get approximate percentiles from histogram
   */
  getPercentiles() {
    if (this.count === 0) {
      return {
        average: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0
      };
    }

    const average = this.sum / this.count;
    
    // Calculate percentiles from histogram
    const p50 = this.getPercentileFromHistogram(0.5);
    const p95 = this.getPercentileFromHistogram(0.95);
    const p99 = this.getPercentileFromHistogram(0.99);

    return {
      average,
      p50,
      p95,
      p99,
      min: this.min === Infinity ? 0 : this.min,
      max: this.max === -Infinity ? 0 : this.max
    };
  }

  /**
   * Get percentile from histogram buckets
   */
  getPercentileFromHistogram(percentile) {
    const targetCount = Math.floor(this.count * percentile);
    let currentCount = 0;
    
    for (let i = 0; i < this.buckets.length; i++) {
      currentCount += this.buckets[i];
      if (currentCount >= targetCount) {
        // Return midpoint of bucket
        return (i + 0.5) * this.bucketSize;
      }
    }
    
    // Fallback to max
    return this.max;
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this.buckets.fill(0);
  }
}

module.exports = {
  calculatePercentiles,
  IncrementalPercentiles
};

