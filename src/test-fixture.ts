import { test as base, expect } from '@playwright/test';
import { PageStateCapture } from './page-helper';

// Track action history
class ActionTracker {
  private actions: string[] = [];

  add(action: string) {
    this.actions.push(`${new Date().toISOString()} - ${action}`);
    // Keep last 20 actions
    if (this.actions.length > 20) {
      this.actions.shift();
    }
  }

  get() {
    return this.actions;
  }

  clear() {
    this.actions = [];
  }
}

// Extend the base test with our fixtures
export const test = base.extend<{
  actionTracker: ActionTracker;
  autoCapture: void;
}>({
  actionTracker: async ({}, use) => {
    const tracker = new ActionTracker();
    await use(tracker);
  },

  autoCapture: [
    async ({ page, actionTracker }, use, testInfo) => {
      // Track navigation
      page.on('load', () => {
        actionTracker.add(`✓ Page loaded: ${page.url()}`);
      });

      page.on('domcontentloaded', () => {
        actionTracker.add(`✓ DOM ready: ${page.url()}`);
      });

      // Track console errors
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          actionTracker.add(`✗ Console error: ${msg.text()}`);
        }
      });

      // Track network failures
      page.on('requestfailed', (request) => {
        actionTracker.add(`✗ Network failed: ${request.method()} ${request.url()}`);
      });

      // Override page methods to track actions
      const originalGoto = page.goto.bind(page);
      page.goto = async (url, options) => {
        actionTracker.add(`→ Navigating to: ${url}`);
        return originalGoto(url, options);
      };

      const originalClick = page.click.bind(page);
      page.click = async (selector, options) => {
        actionTracker.add(`→ Clicking: ${selector}`);
        try {
          const result = await originalClick(selector, options);
          actionTracker.add(`✓ Clicked: ${selector}`);
          return result;
        } catch (error) {
          actionTracker.add(`✗ Failed to click: ${selector}`);
          throw error;
        }
      };

      const originalFill = page.fill.bind(page);
      page.fill = async (selector, value, options) => {
        actionTracker.add(`→ Filling ${selector} with "${value.substring(0, 20)}..."`);
        try {
          const result = await originalFill(selector, value, options);
          actionTracker.add(`✓ Filled: ${selector}`);
          return result;
        } catch (error) {
          actionTracker.add(`✗ Failed to fill: ${selector}`);
          throw error;
        }
      };

      // Use the fixture
      await use();

      // After test, capture state if failed
      if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
        try {
          // Capture page state
          const pageState = await PageStateCapture.capturePageState(page);

          // Create a comprehensive error context report for this specific test
          const errorContextReport = `# Error Context: ${testInfo.title}

## Test Location
${testInfo.file}:${testInfo.line || 0}

## Error
${testInfo.errors.map((e) => e.message || e.toString()).join('\n\n')}

## Page State
**URL:** ${pageState.url}
**Title:** ${pageState.title || 'unknown'}

### Available Selectors
${pageState.availableSelectors.length > 0 ? pageState.availableSelectors.join('\n') : 'No selectors captured'}

### Visible Text
${pageState.visibleText || 'No text captured'}

### Action History
${actionTracker.get().join('\n')}

### HTML Context
${pageState.htmlSnippet ? pageState.htmlSnippet.substring(0, 2000) : 'No HTML captured'}
`;

          // Attach comprehensive error context as markdown
          await testInfo.attach('test-error-context.md', {
            body: errorContextReport,
            contentType: 'text/markdown',
          });

          // Also attach as JSON for the reporter
          await testInfo.attach('page-state', {
            body: JSON.stringify(
              {
                ...pageState,
                actionHistory: actionTracker.get(),
              },
              null,
              2
            ),
            contentType: 'application/json',
          });

          // Also attach individual pieces for the reporter
          if (pageState.url) {
            await testInfo.attach('page-url', { body: pageState.url });
          }
          if (pageState.title) {
            await testInfo.attach('page-title', { body: pageState.title });
          }
          if (pageState.visibleText) {
            await testInfo.attach('visible-text', { body: pageState.visibleText });
          }
          if (pageState.availableSelectors.length > 0) {
            await testInfo.attach('available-selectors', {
              body: JSON.stringify(pageState.availableSelectors),
            });
          }
          if (pageState.htmlSnippet) {
            await testInfo.attach('html-snippet', { body: pageState.htmlSnippet });
          }

          // Attach action history
          await testInfo.attach('action-history', {
            body: actionTracker.get().join('\n'),
          });
        } catch (error) {
          console.error('Failed to capture page state:', error);
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
