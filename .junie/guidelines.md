# Linear MCP Integration Server Development Guidelines

This document provides essential information for developers working on the Linear MCP Integration Server project.

## Build/Configuration Instructions

### Environment Setup

1. **Prerequisites**:
   - Node.js (latest LTS version recommended)
   - npm (comes with Node.js)

2. **Environment Variables**:
   - Create a `.env` file in the project root with the following variables:
     ```
     LINEAR_API_KEY=your_api_key_here
     ```
   - Obtain your Linear API key from Linear's settings > API section

3. **Installation**:
   ```bash
   npm install
   ```

### Build Process

The project uses TypeScript and is configured to build to the `./dist` directory:

```bash
# Build TypeScript files
npm run build
```

Key build configuration:
- TypeScript is configured in `tsconfig.json`
- Target: ES2020
- Module: ESNext
- Output directory: `./dist`
- Source directory: `./src`

### Running the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start

# Inspect MCP server
npm run inspect
```

## Testing Information

### Test Configuration

The project uses Jest for testing with TypeScript support via ts-jest:

- Tests are located in `src/__tests__/` directory
- Jest is configured in `jest.config.js` to handle TypeScript and ESM modules

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx jest src/__tests__/specific-file.test.ts

# Run tests with coverage
npx jest --coverage
```

### Writing Tests

1. **Create test files** in the `src/__tests__/` directory with the `.test.ts` extension
2. **Import Jest globals**:
   ```typescript
   import { describe, it, expect } from '@jest/globals';
   ```
3. **Write test cases** using the Jest API:
   ```typescript
   describe('Module or function name', () => {
     it('should do something specific', () => {
       // Test code
       expect(result).toBe(expectedValue);
     });
   });
   ```

### Example Test

Here's a simple test for the utility functions in the server:

```typescript
import { describe, it, expect } from '@jest/globals';

// Import the utility functions to test
function createTimeout(ms: number, message: string) {
  return new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${message}`)), ms)
  );
}

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
```

## Additional Development Information

### Code Style and Linting

The project uses ESLint for code quality and style enforcement:

```bash
# Run linter
npm run lint
```

Key linting configurations:
- ESLint is configured in `.eslintrc.json`
- Extends configurations for TypeScript, React, and accessibility
- Custom rules for unused variables, console usage, and more

### Project Structure

- `src/server.ts`: Main server implementation file
- `src/__tests__/`: Test files
- `dist/`: Compiled JavaScript files (generated)

### Error Handling Practices

The server implements several error handling patterns:

1. **Timeout Protection**: Using the `withTimeout` utility to prevent hanging operations
   ```typescript
   const result = await withTimeout(promise, API_TIMEOUT_MS, 'Operation context');
   ```

2. **Structured Error Logging**: Using the `handleError` utility for consistent error reporting
   ```typescript
   try {
     // Operation
   } catch (error) {
     handleError(error, 'Context message');
     throw error; // Re-throw if needed
   }
   ```

3. **Graceful Shutdown**: Proper cleanup on process termination
   ```typescript
   process.on('SIGINT', shutdown);
   process.on('SIGTERM', shutdown);
   ```

### Debugging

The server includes a debug mode that can be enabled in the code:

```typescript
const DEBUG = true; // Set to false in production
```

Debug logs are written using the `debugLog` utility:

```typescript
debugLog('Message', data);
```

### MCP Tool Implementation Pattern

When adding new tools to the MCP server, follow this pattern:

```typescript
server.tool(
  'tool_name',
  {
    // Zod schema for parameters
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional().describe('Optional parameter')
  },
  async (params) => {
    try {
      // Implementation
      return {
        content: [{
          type: 'text',
          text: 'Response text'
        }]
      };
    } catch (error) {
      handleError(error, 'Failed to execute tool');
      throw error;
    }
  }
);
```

Remember to update the README.md file with documentation for any new tools.
