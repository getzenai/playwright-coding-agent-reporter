# @zenai/playwright-coding-agent-reporter

[![npm version](https://img.shields.io/npm/v/@zenai/playwright-coding-agent-reporter.svg)](https://www.npmjs.com/package/@zenai/playwright-coding-agent-reporter)
[![semantic-release](https://img.shields.io/badge/semantic--release-enabled-brightgreen.svg)](https://github.com/semantic-release/semantic-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A specialized Playwright reporter designed for AI/LLM coding agents that provides minimal, structured test failure reporting to maximize context efficiency and actionable insights.

## Features

- 🤫 **Silent Success Mode**: No output for passing tests - only failures matter
- 🎯 **Error-Focused**: Captures complete failure context including exact line numbers, stack traces, and page state
- 📸 **Rich Context**: Includes console errors, network failures, and screenshots
- 💚 **Smart Selector Suggestions**: Uses Levenshtein distance to suggest similar selectors when elements aren't found
- 📝 **Markdown Reports**: Clean, structured markdown output for easy parsing by LLMs
- ⚡ **Performance Optimized**: Minimal overhead, async file operations
- 🔧 **Highly Configurable**: Customize what data to capture and report

## Installation

```bash
npm install --save-dev @zenai/playwright-coding-agent-reporter
```

## Usage

### Basic Configuration

Add the reporter to your Playwright configuration:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    [
      '@zenai/playwright-coding-agent-reporter',
      {
        outputDir: 'test-results',
        includeScreenshots: true,
        includeVideo: false, // Off by default for efficiency
        silent: false, // Show helpful console output
        singleReportFile: true, // All errors in one file
      },
    ],
  ],
  use: {
    video: 'off', // Turn off video by default
    screenshot: 'only-on-failure',
  },
});
```

### Configuration Options

| Option                 | Type    | Default          | Description                                           |
| ---------------------- | ------- | ---------------- | ----------------------------------------------------- |
| `outputDir`            | string  | `'test-results'` | Directory for report output                           |
| `includeScreenshots`   | boolean | `true`           | Capture screenshots on failure                        |
| `includeConsoleErrors` | boolean | `true`           | Capture console errors and warnings                   |
| `includeNetworkErrors` | boolean | `true`           | Capture network request failures                      |
| `includeVideo`         | boolean | `false`          | Include video capture (off by default for efficiency) |
| `silent`               | boolean | `true`           | Suppress console output for passing tests             |
| `maxErrorLength`       | number  | `5000`           | Maximum error message length                          |
| `outputFormat`         | string  | `'markdown'`     | Report format (currently only markdown)               |
| `singleReportFile`     | boolean | `true`           | Generate single consolidated error-context.md file    |

### Output Structure

When tests fail, the reporter generates a single consolidated report:

```
test-results/
├── error-context.md              # Consolidated error report with all failures
├── failure-1-test_name.png       # Screenshot for first failure
├── failure-2-test_name.png       # Screenshot for second failure
└── ...                           # Additional screenshots as needed
```

The `error-context.md` file contains:

- Test summary statistics
- All test failures in one place
- Error messages and stack traces
- Console/network errors
- Smart selector suggestions when elements not found
- Screenshots embedded inline
- Reproduction commands for each test

### Report Contents

Each failure report includes:

- **Test Location**: Exact file path and line number
- **Error Details**: Complete error message and stack trace
- **Page Context**: Current URL, page title, available selectors
- **Console Output**: Captured errors and warnings
- **Network Errors**: Failed requests
- **Screenshots**: Visual state at failure
- **Reproduction Command**: Ready-to-run command to reproduce

### Console Output Example

```
Running 6 tests using 1 worker

  ✓  1 test/fixtures/example.spec.ts:4:7 › Example Test Suite › successful test - should pass (422ms)
  ✘  2 test/fixtures/example.spec.ts:9:7 › Example Test Suite › failing test - element not found (5330ms)
  ✘  3 test/fixtures/example.spec.ts:20:7 › Example Test Suite › failing test - assertion failure (475ms)
  ✘  4 test/fixtures/example.spec.ts:27:7 › Example Test Suite › failing test with network error (5368ms)
  -  5 test/fixtures/example.spec.ts:37:8 › Example Test Suite › skipped test
  ✘  6 test/fixtures/example.spec.ts:41:7 › Example Test Suite › test with missing element for selector similarity (5430ms)

  2) test/fixtures/example.spec.ts:17:7 › Example Test Suite › failing test - element not found (5330ms)

      Error:
        Error: expect(locator).toBeVisible() failed

        Locator:  locator('#non-existent-element')
        Expected: visible
        Received: <element(s) not found>
        Timeout:  5000ms

      🔍 Page State When Failed:
        URL: https://playwright.dev/
        Title: Fast and reliable end-to-end testing for modern web apps | Playwright

        📜 Recent Actions:
          2025-09-05T17:35:12.417Z - ✓ DOM ready: https://playwright.dev/
          2025-09-05T17:35:12.432Z - ✓ Page loaded: https://playwright.dev/
          2025-09-05T17:35:12.451Z - ✗ Console error: This is a console error for testing

        💚 Did you mean one of these?
          #__docusaurus
          #__docusaurus_skipToContent_fallback
          #theme-svg-external-link

        🎯 Available Selectors (sorted by relevance):
          button.navbar__toggle
          button.clean-btn
          button:has-text("SearchK")
          a:has-text("Skip to main content")
          h1:has-text("Playwright enables reliable end-to-end testing for")
          ... and 45 more

      Reproduction Command:
        npx playwright test "/workspaces/playwright-coding-agent-reporter/test/fixtures/example.spec.ts" -g "failing test - element not found"

  4 failed
  1 passed
  1 skipped
  6 total
  Finished in 20.1s

  📝 Detailed error report: /workspaces/playwright-coding-agent-reporter/test-results/error-context.md
```

### Integration with AI/LLM Agents

This reporter is optimized for AI coding assistants. When tests fail:

1. **Single File Context**: The AI reads one `error-context.md` file containing all failures
2. **Structured Information**: Each failure includes exact line numbers, error messages, and stack traces
3. **Visual Context**: Screenshots and smart selector suggestions provide debugging insights
4. **Immediate Debugging**: Console and network errors are captured inline
5. **Quick Reproduction**: Ready-to-run commands for each failing test

The consolidated format minimizes token usage while maximizing debugging information.

### Example Test with Enhanced Context

```typescript
import { test, expect } from '@playwright/test';

test('user can complete checkout', async ({ page }) => {
  // The reporter will capture all of this context on failure
  await page.goto('/shop');

  // Console errors are automatically captured
  await page.evaluate(() => {
    console.error('Payment processing failed');
  });

  // Network failures are tracked
  await page.route('**/api/checkout', (route) => route.abort());

  // Screenshots and available selectors captured on failure
  await expect(page.locator('.checkout-success')).toBeVisible();
});
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm run test:example
```

### Watch Mode

```bash
npm run watch
```

## Why Use This Reporter?

Traditional Playwright reporters output extensive information for all tests, making it difficult for AI agents to:

- Identify what actually failed
- Extract actionable error information
- Minimize token usage
- Navigate to exact failure locations

This reporter solves these problems by:

- Only reporting failures (silent success)
- Providing structured, consistent output
- Including complete debugging context
- Generating reproduction commands
- Using markdown for easy parsing

## Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning and changelog generation.

### Commit Message Format

Each commit message should follow this format:

```
<type>(<scope>): <subject>
```

**Types:**

- `feat`: New feature (triggers minor version bump)
- `fix`: Bug fix (triggers patch version bump)
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, etc)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes
- `ci`: CI/CD changes

**Breaking Changes:**

- Add `BREAKING CHANGE:` in the commit body or footer
- Or add `!` after the type/scope: `feat!: breaking change`
- This triggers a major version bump

**Examples:**

```bash
# Minor version bump (0.1.0 -> 0.2.0)
git commit -m "feat: add support for custom reporters"

# Patch version bump (0.1.0 -> 0.1.1)
git commit -m "fix: correct screenshot path handling"

# Major version bump (0.1.0 -> 1.0.0)
git commit -m "feat!: change reporter API interface"

# With scope
git commit -m "feat(reporter): add JSON output format"

# With breaking change in body
git commit -m "feat: update configuration schema" -m "BREAKING CHANGE: config options renamed"
```

### Release Process

Releases are fully automated via GitHub Actions:

1. **Merge to main**: When PRs are merged to main with conventional commits
2. **Automatic versioning**: semantic-release analyzes commits and determines version bump
3. **NPM publish**: Package is automatically published to NPM
4. **GitHub Release**: Creates GitHub release with changelog
5. **Git tags**: Creates appropriate version tags

### Setup Requirements

To enable automated publishing:

1. **NPM Token**: Add `NPM_TOKEN` secret to your GitHub repository
   - Get token from [npmjs.com](https://www.npmjs.com/) → Account Settings → Access Tokens
   - Create "Automation" token with publish permissions
   - Add to GitHub: Settings → Secrets → Actions → New repository secret

2. **GitHub Token**: `GITHUB_TOKEN` is automatically provided by GitHub Actions

3. **Branch Protection** (optional but recommended):
   - Protect `main` branch
   - Require PR reviews
   - Ensure commit messages follow conventions

## License

MIT
