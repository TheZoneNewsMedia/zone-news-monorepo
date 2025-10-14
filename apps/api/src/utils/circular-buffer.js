/**
 * Circular Buffer Implementation
 * Memory-efficient data structure for metrics storage
 */

class CircularBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }
    
    /**
     * Add item to buffer
     */
    push(item) {
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.capacity;
        
        if (this.size < this.capacity) {
            this.size++;
        } else {
            // Buffer is full, move head
            this.head = (this.head + 1) % this.capacity;
        }
    }
    
    /**
     * Get recent items
     */
    getRecent(count = this.size) {
        const items = [];
        const actualCount = Math.min(count, this.size);
        
        for (let i = 0; i < actualCount; i++) {
            const index = (this.tail - 1 - i + this.capacity) % this.capacity;
            items.push(this.buffer[index]);
        }
        
        return items.reverse(); // Return in chronological order
    }
    
    /**
     * Get all items
     */
    getAll() {
        return this.getRecent(this.size);
    }
    
    /**
     * Clear buffer
     */
    clear() {
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }
    
    /**
     * Get buffer statistics
     */
    getStats() {
        return {
            capacity: this.capacity,
            size: this.size,
            utilization: (this.size / this.capacity) * 100
        };
    }
}

module.exports = CircularBuffer;