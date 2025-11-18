class CircularBuffer {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
    this.head = 0; // Write position
    this.tail = 0; // Read position
    this.size = 0; // Current number of elements
    this.isFull = false;
  }

  /**
   * Add element to buffer (O(1))
   */
  push(value) {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.maxSize;
    
    if (this.isFull) {
      // Buffer is full, move tail forward (overwrite oldest)
      this.tail = (this.tail + 1) % this.maxSize;
    } else {
      this.size++;
      if (this.size === this.maxSize) {
        this.isFull = true;
      }
    }
  }

  /**
   * Get all elements as array (for percentile calculation)
   * Returns elements in insertion order
   */
  toArray() {
    if (this.size === 0) return [];
    
    const result = [];
    let current = this.tail;
    const count = this.size;
    
    for (let i = 0; i < count; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.maxSize;
    }
    
    return result;
  }

  /**
   * Get current size
   */
  getSize() {
    return this.size;
  }

  /**
   * Clear buffer
   */
  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.isFull = false;
  }

  /**
   * Get last N elements
   */
  getLast(n) {
    const all = this.toArray();
    return all.slice(-n);
  }
}

module.exports = CircularBuffer;

