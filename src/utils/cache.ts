// Simple in-memory cache implementation
interface CacheEntry<T> {
    value: T;
    timestamp: number;
    expiresAt: number;
}

export class SimpleCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor(cleanupIntervalMs: number = 10 * 60 * 1000) { // Default: 10 minutes
        // Set up periodic cache cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, cleanupIntervalMs);

        // Ensure cleanup on process exit
        process.on('beforeExit', () => {
            clearInterval(this.cleanupInterval);
        });
    }

    // Get an item from cache
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if entry has expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.value as T;
    }

    // Set an item in cache with TTL
    set<T>(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void { // Default: 5 minutes
        const now = Date.now();
        this.cache.set(key, {
            value,
            timestamp: now,
            expiresAt: now + ttlMs
        });
    }

    // Remove an item from cache
    delete(key: string): void {
        this.cache.delete(key);
    }

    // Clear all cache entries
    clear(): void {
        this.cache.clear();
    }

    // Clean up expired entries
    cleanup(): void {
        const now = Date.now();
        let expiredCount = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                expiredCount++;
            }
        }
    }

    // Get cache stats
    getStats(): { size: number, oldestEntry: number | null, newestEntry: number | null } {
        let oldestTimestamp: number | null = null;
        let newestTimestamp: number | null = null;

        for (const entry of this.cache.values()) {
            if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
            }

            if (newestTimestamp === null || entry.timestamp > newestTimestamp) {
                newestTimestamp = entry.timestamp;
            }
        }

        return {
            size: this.cache.size,
            oldestEntry: oldestTimestamp,
            newestEntry: newestTimestamp
        };
    }
}