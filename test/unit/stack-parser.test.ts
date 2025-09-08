import { describe, it, expect } from 'vitest';
import { parseErrorStack, combineErrors } from '../../src/helpers/stack-parser';

describe('stack-parser', () => {
  describe('parseErrorStack', () => {
    it('should parse error stack with message and stack lines', () => {
      const stack = `Error: Test failed
    at Object.<anonymous> (/path/to/test.spec.ts:10:5)
    at Module._compile (node:internal/modules/cjs/loader:1254:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1308:10)`;

      const result = parseErrorStack(stack);

      expect(result.message).toBe('Error: Test failed');
      expect(result.stackLines).toHaveLength(3);
      expect(result.stackLines[0]).toContain('at Object.<anonymous>');
      expect(result.userCodeLocation).toBe('/path/to/test.spec.ts:10:5');
    });

    it('should handle stack without user code location', () => {
      const stack = `Error: System error
    at node:internal/modules/cjs/loader:1254:14
    at node:internal/modules/cjs/loader:1308:10`;

      const result = parseErrorStack(stack);

      expect(result.message).toBe('Error: System error');
      expect(result.stackLines).toHaveLength(2);
      expect(result.userCodeLocation).toBeUndefined();
    });

    it('should handle multi-line error messages', () => {
      const stack = `Error: Test failed
Expected: true
Received: false
    at Object.<anonymous> (/test.spec.ts:10:5)`;

      const result = parseErrorStack(stack);

      expect(result.message).toBe('Error: Test failed\nExpected: true\nReceived: false');
      expect(result.stackLines).toHaveLength(1);
      expect(result.userCodeLocation).toBe('/test.spec.ts:10:5');
    });

    it('should handle empty stack', () => {
      const result = parseErrorStack('');

      expect(result.message).toBe('');
      expect(result.stackLines).toHaveLength(0);
      expect(result.userCodeLocation).toBeUndefined();
    });
  });

  describe('combineErrors', () => {
    it('should combine multiple error messages', () => {
      const errors = [{ message: 'Error 1' }, { message: 'Error 2' }, { message: 'Error 3' }];

      const result = combineErrors(errors);

      expect(result.message).toContain('Error 1');
      expect(result.message).toContain('Error 2');
      expect(result.message).toContain('Error 3');
      expect(result.message).toContain('---');
    });

    it('should combine stack traces', () => {
      const errors = [
        {
          message: 'Error 1',
          stack: `Error 1
    at test1.spec.ts:10:5
    at common.js:20:10`,
        },
        {
          message: 'Error 2',
          stack: `Error 2
    at test2.spec.ts:15:8
    at common.js:20:10`,
        },
      ];

      const result = combineErrors(errors);

      expect(result.stack).toContain('at test1.spec.ts:10:5');
      expect(result.stack).toContain('at test2.spec.ts:15:8');
      // Should not duplicate common lines
      const matches = result.stack ? result.stack.match(/at common\.js:20:10/g) : [];
      expect(matches?.length).toBe(1);
    });

    it('should combine code snippets', () => {
      const errors = [
        {
          message: 'Error 1',
          snippet: '  > 10 | expect(true).toBe(false)',
        },
        {
          message: 'Error 2',
          snippet: '  > 20 | expect(1).toBe(2)',
        },
      ];

      const result = combineErrors(errors);

      expect(result.snippet).toContain('expect(true).toBe(false)');
      expect(result.snippet).toContain('expect(1).toBe(2)');
      expect(result.snippet).toContain('---');
    });

    it('should handle errors with missing properties', () => {
      const errors = [
        { message: 'Error 1' },
        { message: 'Error 2', stack: 'at test.js:10' },
        { snippet: '> 10 | code' },
        {},
      ];

      const result = combineErrors(errors);

      expect(result.message).toContain('Error 1');
      expect(result.message).toContain('Error 2');
      expect(result.stack).toContain('at test.js:10');
      expect(result.snippet).toContain('> 10 | code');
    });

    it('should handle empty error array', () => {
      const result = combineErrors([]);

      expect(result.message).toBe('Unknown error');
      expect(result.stack).toBeUndefined();
      expect(result.snippet).toBeUndefined();
    });

    it('should handle single error', () => {
      const errors = [
        {
          message: 'Single error',
          stack: 'at test.js:5',
          snippet: '> 5 | code',
        },
      ];

      const result = combineErrors(errors);

      expect(result.message).toBe('Single error');
      expect(result.stack).toBe('at test.js:5');
      expect(result.snippet).toBe('> 5 | code');
    });
  });
});
