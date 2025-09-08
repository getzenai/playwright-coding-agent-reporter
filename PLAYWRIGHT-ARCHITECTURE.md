# Playwright Reporter Architecture

This document describes Playwright's reporter architecture and how it handles test errors, particularly timeout errors. This understanding is crucial for building custom reporters that match or exceed Playwright's built-in capabilities.

## Core Architecture

### Reporter Interface

Playwright reporters implement the `Reporter` interface with lifecycle methods:

- `onBegin(suite)` - Called when test run starts
- `onTestBegin(test, result)` - Called when a test starts
- `onTestEnd(test, result)` - Called when a test ends
- `onEnd(result)` - Called when test run ends
- `onError(error)` - Called on global errors

### Key Data Structures

#### TestResult

Contains test execution results:

```typescript
// Source: https://github.com/microsoft/playwright/blob/main/packages/playwright/types/testReporter.d.ts#L584
interface TestResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  errors: TestError[]; // Array of ALL errors that occurred
  stdout: Buffer[];
  stderr: Buffer[];
  attachments: Attachment[];
  duration: number;
  retry: number;
}
```

#### TestError

Represents an error that occurred during test execution:

```typescript
// Source: https://github.com/microsoft/playwright/blob/main/packages/playwright/types/testReporter.d.ts#L547
interface TestError {
  message?: string; // Error message
  stack?: string; // Full stack trace
  value?: string; // Alternative error value
  snippet?: string; // Code snippet where error occurred
  location?: Location; // File location of error
  cause?: TestError; // Error chaining - reference to the cause error
}
```

## Error Handling

### Multiple Errors per Test

**Critical insight**: A single test can have multiple errors in `result.errors[]`:

1. **Primary error**: The main failure reason (e.g., "Test timeout of 5000ms exceeded")
2. **Secondary errors**: Additional context (e.g., the actual operation that was running when timeout occurred)

Example for a timeout:

- Error 0: "Test timeout of 5000ms exceeded"
- Error 1: "page.waitForTimeout: Target page, context or browser has been closed" with full stack trace

### Error Processing Flow

1. **Error Capture**: When a test fails, Playwright captures all relevant errors
2. **Error Formatting**: The reporter's `formatError` function processes each error:

   ```typescript
   formatError(error: TestError) {
     // 1. Extract message
     // 2. Parse stack trace
     // 3. Add code snippet if available
     // 4. Determine error location
     // 5. Handle nested error causes
   }
   ```

3. **Stack Trace Parsing**: `parseErrorStack` function:
   - Splits stack into message and stack lines
   - Filters out node_modules frames
   - Extracts first user code location
   - Returns: `{ message, stackLines, location }`

## Timeout Error Generation

### TimeoutManager

Manages test execution timeouts:
[Source: https://github.com/microsoft/playwright/blob/main/packages/playwright/src/worker/timeoutManager.ts]

1. **Timeout Creation**:

   ```typescript
   // Source: https://github.com/microsoft/playwright/blob/main/packages/playwright/src/worker/timeoutManager.ts#L159-L207
   _createTimeoutError(running) {
     const timeout = running.slot.timeout;
     const message = `Test timeout of ${timeout}ms exceeded.`;
     const error = new TimeoutManagerError(message);
     error.stack = message + location;
     return error;
   }
   ```

2. **Timeout Types**:
   - Test timeout: "Test timeout of Xms exceeded"
   - Hook timeout: "beforeEach/afterEach hook timeout"
   - Fixture timeout: "Fixture setup/teardown timeout"
   - Worker timeout: "Worker teardown timeout"

3. **Operation Context**: When a timeout occurs, Playwright also captures the error from the operation that was running, providing dual context.

## How Line Reporter Shows Detailed Errors

The line reporter excels at showing timeout errors because it:

1. **Processes ALL errors**: Iterates through `result.errors[]` array
2. **Shows operation context**: Displays what was happening when timeout occurred
3. **Includes code snippets**: Shows the exact line of code that was executing
4. **Provides stack traces**: Full call stack for debugging

Example output structure:

```
Test timeout of 5000ms exceeded.

Error: page.waitForTimeout: Target page, context or browser has been closed
  at doSlowOperation (test.spec.ts:74:22)
  at test.spec.ts:80:5

Code snippet:
  73 |   // Retry with wait
> 74 |   await page.waitForTimeout(1000);
  75 | }
```

## Key Functions in Playwright's Reporters

[Source: https://github.com/microsoft/playwright/blob/main/packages/playwright/src/reporters/base.ts]

### formatFailure

[Line ~350]

- Generates complete failure report for a test
- Processes all test results and errors
- Handles attachments and retry attempts
- Calls `formatResultFailure` for each result

### formatResultFailure

[Line ~470]

- Processes `result.errors` array
- Formats each error using `formatError`
- Handles special cases (unexpected pass, interruption)

### formatError

[Line ~500]

- Core error formatting logic
- Parses stack traces via `parseErrorStack`
- Adds code snippets
- Handles error causes recursively
- Returns formatted error with location

### parseErrorStack

[Source: https://github.com/microsoft/playwright/blob/main/packages/playwright/src/utils/stackTrace.ts]

- Splits error stack into components
- Filters internal frames
- Identifies user code locations
- Returns structured error data

## Source Code References

### Core Type Definitions

- [TestReporter Types](https://github.com/microsoft/playwright/blob/main/packages/playwright/types/testReporter.d.ts) - All reporter interfaces
- [TestResult Interface](https://github.com/microsoft/playwright/blob/main/packages/playwright/types/testReporter.d.ts#L584)
- [TestError Interface](https://github.com/microsoft/playwright/blob/main/packages/playwright/types/testReporter.d.ts#L547)

### Reporter Implementation

- [Base Reporter](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/reporters/base.ts) - Core reporter utilities
- [Line Reporter](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/reporters/line.ts) - Reference implementation
- [List Reporter](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/reporters/list.ts) - Alternative formatter

### Error Handling

- [TimeoutManager](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/worker/timeoutManager.ts) - Timeout error generation
- [Stack Trace Utils](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/utils/stackTrace.ts) - Stack parsing utilities
- [Error Formatting](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/reporters/base.ts#L500) - formatError function

### Additional Resources

- [Reporter API Documentation](https://playwright.dev/docs/api/class-reporter)
- [Custom Reporter Guide](https://playwright.dev/docs/test-reporters#custom-reporters)
- [Test Result API](https://playwright.dev/docs/api/class-testresult)
