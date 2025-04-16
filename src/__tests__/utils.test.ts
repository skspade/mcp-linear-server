import { describe, it, expect } from '@jest/globals';

// Import the utility functions to test
// Note: In a real test, you would import these from the actual module
// For demonstration purposes, we'll redefine them here

// Utility to create a timeout promise
function createTimeout(ms: number, message: string) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${message}`)), ms)
  );
}

// Utility to wrap promises with timeout
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, context: string): Promise<T> {
  try {
    const result = await Promise.race([
      promise,
      createTimeout(timeoutMs, context)
    ]) as T;
    return result;
  } catch (error: any) {
    if (error?.message?.includes('Timeout after')) {
      console.error(`Operation timed out: ${context}`);
    }
    throw error;
  }
}

describe('Utility Functions', () => {
  describe('withTimeout', () => {
    it('should resolve when the promise resolves before timeout', async () => {
      const fastPromise = Promise.resolve('success');
      const result = await withTimeout(fastPromise, 1000, 'Fast operation');
      expect(result).toBe('success');
    });

    it('should reject when the promise takes longer than the timeout', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('too late'), 100));
      await expect(withTimeout(slowPromise, 50, 'Slow operation')).rejects.toThrow('Timeout after 50ms');
    });
  });
});
