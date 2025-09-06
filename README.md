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
        outputDir: 'test-report-for-coding-agents',
        includeScreenshots: true, // Include screenshots in reports when available
        silent: false, // Show helpful console output
        singleReportFile: true, // All errors in one file
      },
    ],
  ],
  use: {
    // IMPORTANT: Configure Playwright to take screenshots on failure
    screenshot: 'only-on-failure', // This tells Playwright WHEN to take screenshots
    video: 'off', // Turn off video by default for efficiency
  },
});
```

#### Screenshot Configuration

**Important:** Screenshot capture is controlled at two levels:

1. **Playwright Level** (`use.screenshot`): Controls WHEN screenshots are taken
   - `'off'` - No screenshots
   - `'on'` - Always take screenshots
   - `'only-on-failure'` - Only on test failure (recommended)

2. **Reporter Level** (`includeScreenshots`): Controls whether captured screenshots are included in reports
   - `true` - Include screenshots in error reports when they exist (default)
   - `false` - Don't include screenshots in reports, even if Playwright captured them

For optimal debugging, use:

- `screenshot: 'only-on-failure'` in Playwright config (to capture screenshots)
- `includeScreenshots: true` in reporter config (to include them in reports)

### Configuration Options

| Option                 | Type    | Default                           | Description                                                                             |
| ---------------------- | ------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `outputDir`            | string  | `'test-report-for-coding-agents'` | Directory for report output                                                             |
| `includeScreenshots`   | boolean | `true`                            | Include screenshots in error reports when available (see note below)                    |
| `includeConsoleErrors` | boolean | `true`                            | Capture console errors and warnings                                                     |
| `includeNetworkErrors` | boolean | `true`                            | Capture network request failures                                                        |
| `includeVideo`         | boolean | `false`                           | Include video references in reports when available (Playwright must have video enabled) |
| `silent`               | boolean | `false`                           | Suppress per-test pass output; still shows summary                                      |
| `maxErrorLength`       | number  | `5000`                            | Maximum error message length                                                            |
| `singleReportFile`     | boolean | `true`                            | Generate single consolidated error-context.md file                                      |
| `capturePageState`     | boolean | `true`                            | Capture page state on failure (URL, title, available selectors, visible text)           |
| `verboseErrors`        | boolean | `true`                            | Include detailed error information                                                      |
| `maxInlineErrors`      | number  | `5`                               | Maximum number of errors to show in console output                                      |
| `showCodeSnippet`      | boolean | `true`                            | Show code snippet at error location                                                     |

### Output Structure

When tests fail, the reporter generates a consolidated report and per-test artifacts:

```
test-report-for-coding-agents/
├── all-failures.md  # Consolidated failure report (all failures)
├── basic-reporter-features-failing-test-element-not-found-7/
│   ├── report.md  # Detailed error report for this test
│   └── screenshot.png  # Screenshot at failure (if enabled)
├── basic-reporter-features-failing-test-assertion-failure-6/
│   ├── report.md  # Detailed error report for this test
│   └── screenshot.png  # Screenshot at failure (if enabled)
├── timeout-handling-timeout-waiting-for-element-shows-enhanced-context-7/
│   ├── report.md  # Detailed error report with timeout context
│   └── screenshot.png  # Screenshot at timeout
└── ...
```

Notes:

- `all-failures.md` - Consolidated report containing all test failures with summaries and links to individual reports
- `report.md` - Per-test detailed error report with full context, stack traces, and debugging information
- `screenshot.png` - Visual state captured at the moment of failure (when screenshots are enabled)
- Folder names are generated from suite and test names with test index suffix for uniqueness

### Report Contents

Each failure report includes:

- **Test Location**: Exact file path and line number
- **Error Details**: Complete error message and stack trace with enhanced timeout context
- **Page Context**: Current URL, page title, screenshot reference
- **Available Selectors**: Sorted by relevance when element not found
- **Action History**: Recent test actions before failure
- **Console Output**: Captured JavaScript errors and warnings
- **Network Errors**: Failed network requests
- **Screenshots**: Visual state at failure with direct links
- **HTML Context**: Relevant HTML around failed selectors
- **Quick Links**: Navigation to individual test folders (in consolidated report)

### Console Output Example

The reporter prints a per-test line for each test (unless `silent: true`), followed by detailed failure sections and a summary:

```
Running 25 tests using 4 workers

  ✓   4 test/e2e/reporter-demo.spec.ts:4:7 › Basic Reporter Features › successful test - should pass (584ms)
  -   5 test/e2e/reporter-demo.spec.ts:37:8 › Basic Reporter Features › skipped test
  ✘   6 test/e2e/reporter-demo.spec.ts:20:7 › Basic Reporter Features › failing test - assertion failure (957ms)
  ✘   7 test/e2e/reporter-demo.spec.ts:9:7 › Basic Reporter Features › failing test - element not found (5605ms)
  ✘   9 test/e2e/reporter-demo.spec.ts:41:7 › Basic Reporter Features › test with missing element for selector similarity (5327ms)
  ...

  ## 7) test/e2e/reporter-demo.spec.ts:17:7 › Basic Reporter Features › failing test - element not found (5605ms)

  ### Error
  Error: expect(locator).toBeVisible() failed

  Locator:  locator('#non-existent-element')
  Expected: visible
  Received: <element(s) not found>
  Timeout:  5000ms

  Call log:
    - Expect "toBeVisible" with timeout 5000ms
    - waiting for locator('#non-existent-element')

  ⏱️ Timeout Context:
  - Was waiting for: locator('#non-existent-element')
  - Duration before timeout: 5605ms
  - Page URL at timeout: https://playwright.dev/
  - Last action before timeout: 2025-09-06T10:10:56.247Z - ✗ Console error: This is a console error for testing

  ### Error Location
      15 |     });
      16 |
    > 17 |     await expect(page.locator('#non-existent-element')).toBeVisible();
           |                                                         ^
      18 |   });

  ### 🔍 Page State When Failed
  **URL:** https://playwright.dev/
  **Title:** Fast and reliable end-to-end testing for modern web apps | Playwright
  **Screenshot:** Saved to screenshot.png

  ### 📜 Recent Actions
    2025-09-06T10:10:55.921Z - → Navigating to: https://playwright.dev
    2025-09-06T10:10:56.192Z - ✓ DOM ready: https://playwright.dev/
    2025-09-06T10:10:56.210Z - ✓ Page loaded: https://playwright.dev/
    2025-09-06T10:10:56.247Z - ✗ Console error: This is a console error for testing

  ### 🎯 Available Selectors (sorted by relevance)
    h3:has-text("Resilient • No flaky tests")
    a:has-text("Skip to main content")
    button:has-text("Node.js")
    button:has-text("Search⌘K")
    .clean-btn
    .github-btn
    [aria-label="76k+ stargazers on GitHub"]
    [href="/community/welcome"]
    ... and 42 more selectors

  ### 📄 Visible Text (first 500 chars)
    Skip to main content | Playwright | Docs | API | Node.js | Community | Search | ⌘ | K |
    Playwright enables reliable end-to-end testing for modern web apps. | GET STARTED | Star | 76k+ |
    Any browser • Any platform • One API | Cross-browser. Playwright supports all modern rendering
    engines including Chromium, WebKit, and Firefox...

  📝 **Full Error Context:** test-report-for-coding-agents/basic-reporter-features-failing-test-element-not-found-9/report.md

  ... and 18 more failures. See test-report-for-coding-agents/all-failures.md for complete details.

  23 failed
  1 passed
  1 skipped
  25 total
  Finished in 39.0s

  📝 Detailed error report: test-report-for-coding-agents/all-failures.md
```

### Integration with AI/LLM Agents

This reporter is optimized for AI coding assistants (Claude Code, Codex, Aider, Roo Code, Cursor, etc.). When tests fail:

1. **Single File Context**: The AI reads one `all-failures.md` file containing all failures
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
# Run unit tests (Vitest - no browser required)
npm run test:unit

# Run E2E demo tests (Playwright - demonstrates reporter output)
npm run test:example

# Run all tests
npm test          # Runs unit tests only (used in CI)
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
