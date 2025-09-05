# @zenai/playwright-coding-agent-reporter

[![npm version](https://img.shields.io/npm/v/@zenai/playwright-coding-agent-reporter.svg)](https://www.npmjs.com/package/@zenai/playwright-coding-agent-reporter)
[![semantic-release](https://img.shields.io/badge/semantic--release-enabled-brightgreen.svg)](https://github.com/semantic-release/semantic-release)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A specialized Playwright reporter designed for AI/LLM coding agents that provides minimal, structured test failure reporting to maximize context efficiency and actionable insights. Works well with coding agents such as Claude Code, Codex, Aider, Roo Code, and Cursor.

## Features

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
        silent: false, // Show helpful console output (true hides per-test passes, keeps summary)
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
| `silent`               | boolean | `false`          | Suppress per-test pass output; still shows summary    |
| `maxErrorLength`       | number  | `5000`           | Maximum error message length                          |
| `outputFormat`         | string  | `'markdown'`     | Report format (currently only markdown)               |
| `singleReportFile`     | boolean | `true`           | Generate single consolidated error-context.md file    |

### Output Structure

When tests fail, the reporter generates a consolidated report and per-test artifacts:

```
test-results/
├── error-context.md                                  # Consolidated failure report (all failures)
├── .last-run.json                                    # Run metadata (from Playwright)
├── example-Example-Test-Suite-...-element-not-found-chromium/
│   ├── error-context.md                              # Per-test failure report (replaces Playwright’s)
│   └── test-failed-1.png                             # Screenshot for this failure (if enabled)
├── example-Example-Test-Suite-...-assertion-failure-chromium/
│   ├── error-context.md
│   └── test-failed-1.png
└── ...
```

Notes:

- Consolidated `error-context.md` contains a summary and detailed sections for each failure.
- Per-test folders are created by Playwright; this reporter overwrites their `error-context.md` with a simpler, focused report.

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

The reporter prints a per-test line for each test (unless `silent: true`), followed by detailed failure sections and a summary. Example excerpt (see `example_log.txt` for a full run):

```
Running 10 tests using 1 worker

  ✓  1 test/fixtures/example.spec.ts:4:7 › Example Test Suite › successful test - should pass (616ms)
  ✘  2 test/fixtures/example.spec.ts:9:7 › Example Test Suite › failing test - element not found (5456ms)
  ✘  3 test/fixtures/example.spec.ts:20:7 › Example Test Suite › failing test - assertion failure (813ms)
  ✘  4 test/fixtures/example.spec.ts:27:7 › Example Test Suite › failing test with network error (5273ms)
  -  5 test/fixtures/example.spec.ts:37:8 › Example Test Suite › skipped test
  ✘  6 test/fixtures/example.spec.ts:41:7 › Example Test Suite › test with missing element for selector similarity (5503ms)
  ✓  7 ...
  ✓  8 ...
  ✓  9 ...
  ✓ 10 ...

  ## 2) test/fixtures/example.spec.ts:17:7 › Example Test Suite › failing test - element not found (5456ms)

  ### Error
    Error: expect(locator).toBeVisible() failed
    Locator:  locator('#non-existent-element')
    Expected: visible
    Received: <element(s) not found>
    Timeout:  5000ms

  ### Error Location
      15 |     });
      16 |
    > 17 |     await expect(page.locator('#non-existent-element')).toBeVisible();
             |                                                         ^
      18 |   });

  ### 🔍 Page State When Failed
    URL: https://playwright.dev/
    Title: Fast and reliable end-to-end testing for modern web apps | Playwright

  ### 📜 Recent Actions
    2025-09-05T20:41:02.377Z - ✓ DOM ready: https://playwright.dev/
    2025-09-05T20:41:02.393Z - ✓ Page loaded: https://playwright.dev/
    2025-09-05T20:41:02.497Z - ✗ Console error: This is a console error for testing

  ### 🎯 Available Selectors (top 5)
    h3:has-text("Resilient • No flaky tests")
    a:has-text("Skip to main content")
    button:has-text("Node.js")
    button:has-text("SearchK")
    .clean-btn

  📝 Full Error Context: /workspaces/playwright-coding-agent-reporter/test-results/error-context.md

  4 failed
  5 passed
  1 skipped
  10 total
  Finished in 21.5s

  📝 Detailed error report: /workspaces/playwright-coding-agent-reporter/test-results/error-context.md
```

### Integration with AI/LLM Agents

This reporter is optimized for AI coding assistants (Claude Code, Codex, Aider, Roo Code, Cursor, etc.). When tests fail:

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

The default Playwright reporter surfaces the error, but often lacks enough surrounding context for a coding model to understand what actually went wrong and what the page state was at failure time. It’s hard for coding agents to debug with just the error text.

This reporter focuses on actionable context for agents:

- **Failure-first output**: Detailed sections only for failures (quiet mode hides passing tests apart from a summary)
- **Page state snapshot**: URL, title, visible text, nearby/available selectors, recent actions
- **Structured errors**: Consistent formatting with code snippets and stack traces
- **Repro commands**: Ready-to-run commands per failing test
- **Markdown reports**: Single consolidated file plus per-test reports for targeted review

## Contributing

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated releases.

- Prefer squash merges. The pull request title should follow Conventional Commits; individual commit messages do not need to.
- The PR title drives the release notes and version bump.

### Release Process

Releases are fully automated via GitHub Actions:

1. **Merge to main**: Use squash merge; ensure the PR title follows Conventional Commits
2. **Automatic versioning**: semantic-release analyzes the PR title and determines version bump
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
