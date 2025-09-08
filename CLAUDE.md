# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Commands

### Build & Development

- `npm run build` - Compile TypeScript to JavaScript (required before testing)
- `npm run watch` - Watch mode for development
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without applying changes
- `npm run lint` - Run ESLint on source and test files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run fix` - Run both format and lint:fix

### Testing

- `npm run test:example` - Run example tests with the custom reporter (MUST use this to see reporter outputs)
- `npm run test:e2e` - Same as test:example, runs Playwright tests with custom reporter
- `npm run test:unit` - Run unit tests with Vitest
- `npm run test:unit:watch` - Run unit tests in watch mode
- `npm run test` - Run unit tests only (used in CI)

**Important**: Always build before testing the reporter: `npm run build && npm run test:example`

## Architecture Overview

This is a Playwright custom reporter designed for AI/LLM coding agents. The reporter captures comprehensive failure context to help AI agents debug test failures effectively.

### Directory Structure

```
src/
├── formatters/
│   ├── base.ts         # Base formatter with common error extraction logic
│   ├── console.ts      # Terminal output formatter with color support
│   └── markdown.ts     # Markdown report formatter for AI consumption
├── helpers/
│   ├── page-state-capture.ts  # Page state extraction utilities
│   ├── stack-parser.ts        # Error stack parsing and combination
│   └── url-formatter.ts       # URL truncation and formatting
├── reporter.ts         # Main CodingAgentReporter class
├── test-fixture.ts     # Extended Playwright test fixture
├── types.ts           # TypeScript type definitions
└── index.ts           # Package entry point

test/
├── e2e/
│   ├── playwright.config.ts    # E2E test configuration with reduced timeouts
│   ├── reporter-demo.spec.ts   # Demo tests showcasing reporter features
│   └── timeout-scenarios.spec.ts # Timeout-specific test scenarios
└── unit/                       # Unit tests
```

### Key Components

1. **Reporter Core** (`src/reporter.ts`)
   - Main `CodingAgentReporter` class implementing Playwright's Reporter interface
   - Manages test lifecycle events and failure collection
   - Generates both console output and markdown reports
   - Creates per-test directories with detailed reports

2. **Formatters** (`src/formatters/`)
   - **BaseFormatter** (`base.ts`) - Common functionality for error data extraction
     - Processes multiple errors from Playwright's result.errors array
     - Combines error messages, stacks, and snippets via `combineErrors()`
     - Strips ANSI codes and formats timeout contexts
   - **ConsoleFormatter** (`console.ts`) - Terminal output with color support
   - **MarkdownFormatter** (`markdown.ts`) - Structured markdown reports

3. **Helpers** (`src/helpers/`)
   - **PageStateCapture** (`page-state-capture.ts`) - Extracts page context on failures
     - Captures available selectors, visible text, console errors
     - Implements Levenshtein distance for selector similarity suggestions
   - **StackParser** (`stack-parser.ts`) - Parses and combines multiple error stacks
     - `parseErrorStack()` - Extracts message, stack lines, and user code location
     - `combineErrors()` - Merges multiple errors into comprehensive output
   - **UrlFormatter** (`url-formatter.ts`) - Truncates long URLs (especially data URLs)

4. **Test Fixture** (`src/test-fixture.ts`)
   - Extended Playwright test fixture with automatic page state capture
   - Tracks console errors, network failures, and action history

### Report Generation Flow

1. Test fails → `onTestEnd()` captures failure via `captureFailure()`
2. `BaseFormatter.extractErrorData()` processes all errors from result.errors
3. `combineErrors()` merges multiple error messages, stacks, and snippets
4. Page state extracted including URL, selectors, console logs
5. Reports generated:
   - Consolidated `all-failures.md` with all failures
   - Per-test `report.md` in individual test directories
   - Console output with inline errors (unless silent mode)

### Error Processing

The reporter processes ALL errors from Playwright's `result.errors` array:

- Combines multiple error messages with separators
- Merges stack traces preserving unique lines
- Includes all code snippets from different errors
- Enhances timeout errors with additional context (duration, page state, last action)

### Test Configuration

Test timeouts in `test/e2e/playwright.config.ts` (reduced for faster runs):

- `timeout: 5000` - 5 seconds per test
- `expect.timeout: 2000` - 2 seconds for assertions
- `actionTimeout: 3000` - 3 seconds for actions
- `navigationTimeout: 3000` - 3 seconds for navigation

Reporter options:

- `outputDir` - Where to write reports (default: 'test-report-for-coding-agents')
- `includeScreenshots` - Include screenshot references
- `singleReportFile` - Generate consolidated all-failures.md
- `silent` - Suppress per-test console output
- `capturePageState` - Capture page context on failures
- `maxErrorLength` - Maximum error message length
- `verboseErrors` - Include detailed error information

### Report Output Structure

Each test failure report includes these sections:

1. **Error** - Main error message with call log
2. **Stack Trace** - Full stack with code location
3. **Page State When Failed** - URL, title, screenshot
4. **Action History** - Sequential test actions
5. **Available Selectors** - Elements on page (for debugging)
6. **Similar Selectors** - Suggestions for typos (using Levenshtein distance)
7. **Visible Text** - Page text content
8. **Console Errors** - Browser console output
9. **Network Errors** - Failed requests
10. **Browser Logs** - stdout from browser
11. **Server Logs** - stderr output

### Demo Tests

- `reporter-demo.spec.ts` - Demonstrates various failure scenarios
- `timeout-scenarios.spec.ts` - Tests timeout error reporting
- `simple-test.spec.ts` - Basic failing test for quick verification

### Publishing

This package uses semantic-release for automated NPM publishing:

- Commits to main trigger automatic releases
- Version determined by conventional commit messages (feat:, fix:, etc.)
- NPM_TOKEN required in GitHub secrets for publishing

### Reference Implementation

Playwright's official reporters source code can be found at:
https://github.com/microsoft/playwright/tree/main/packages/playwright/src/reporters

Key files for reference:

- `base.ts` - Base reporter with error formatting utilities
- `line.ts` - Line reporter implementation
- Error stack trace parsing and formatting methods
