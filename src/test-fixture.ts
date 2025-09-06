import { test as base, expect } from '@playwright/test';
import { PageStateCapture } from './page-helper';

const MAX_ACTION_HISTORY = 20;
const MAX_FILL_VALUE_DISPLAY = 20;
const MAX_HTML_CONTEXT = 2000;

class ActionTracker {
  private actions: string[] = [];

  add(action: string) {
    this.actions.push(`${new Date().toISOString()} - ${action}`);
    if (this.actions.length > MAX_ACTION_HISTORY) {
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

export const test = base.extend<{
  actionTracker: ActionTracker;
  consoleErrors: string[];
  networkErrors: string[];
  autoCapture: void;
}>({
  actionTracker: async ({}, use) => {
    const tracker = new ActionTracker();
    await use(tracker);
  },

  consoleErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
  },

  networkErrors: async ({}, use) => {
    const errors: string[] = [];
    await use(errors);
  },

  autoCapture: [
    async ({ page, actionTracker, consoleErrors, networkErrors }, use, testInfo) => {
      page.on('load', () => {
        actionTracker.add(`✓ Page loaded: ${page.url()}`);
      });

      page.on('domcontentloaded', () => {
        actionTracker.add(`✓ DOM ready: ${page.url()}`);
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const errorText = msg.text();
          actionTracker.add(`✗ Console error: ${errorText}`);
          consoleErrors.push(`[${new Date().toISOString()}] ${errorText}`);
        } else if (msg.type() === 'warning') {
          const warningText = msg.text();
          consoleErrors.push(`[WARNING] ${warningText}`);
        }
      });

      page.on('requestfailed', (request) => {
        const errorText = `${request.method()} ${request.url()} - ${request.failure()?.errorText || 'Failed'}`;
        actionTracker.add(`✗ Network failed: ${errorText}`);
        networkErrors.push(errorText);
      });

      // Also capture page errors (JavaScript errors)
      page.on('pageerror', (error) => {
        const errorText = error.message || error.toString();
        actionTracker.add(`✗ Page error: ${errorText}`);
        consoleErrors.push(`[PAGE ERROR] ${errorText}`);
      });

      let lastPageState: any = null;

      const originalGoto = page.goto.bind(page);
      page.goto = async (url, options) => {
        actionTracker.add(`→ Navigating to: ${url}`);
        const result = await originalGoto(url, options);
        // Capture page state after navigation
        try {
          await page.waitForLoadState('domcontentloaded');
          lastPageState = await PageStateCapture.capturePageState(page);
        } catch (e) {
          // Silently continue if page state capture fails
        }
        return result;
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
        actionTracker.add(
          `→ Filling ${selector} with "${value.substring(0, MAX_FILL_VALUE_DISPLAY)}..."`
        );
        try {
          const result = await originalFill(selector, value, options);
          actionTracker.add(`✓ Filled: ${selector}`);
          return result;
        } catch (error) {
          actionTracker.add(`✗ Failed to fill: ${selector}`);
          throw error;
        }
      };

      await use();

      if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
        try {
          // Use the last captured page state if available, otherwise try to capture now
          let pageState = lastPageState;
          if (!pageState || pageState.availableSelectors.length === 0) {
            pageState = await PageStateCapture.capturePageState(page);
          }

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
${pageState.htmlSnippet ? pageState.htmlSnippet.substring(0, MAX_HTML_CONTEXT) : 'No HTML captured'}
`;

          await testInfo.attach('test-error-context.md', {
            body: errorContextReport,
            contentType: 'text/markdown',
          });

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

          if (pageState.url) {
            await testInfo.attach('page-url', { body: pageState.url });
          }
          if (pageState.title) {
            await testInfo.attach('page-title', { body: pageState.title });
          }
          if (pageState.visibleText) {
            // Condense visible text for console output
            const condensedText = pageState.visibleText
              .split('\n')
              .map((line: string) => line.trim())
              .filter((line: string) => line.length > 0)
              .slice(0, 50) // Limit to first 50 lines
              .join(' | ');
            await testInfo.attach('visible-text', { body: condensedText });
          }
          if (pageState.availableSelectors.length > 0) {
            await testInfo.attach('available-selectors', {
              body: JSON.stringify(pageState.availableSelectors),
            });
          }
          if (pageState.htmlSnippet) {
            await testInfo.attach('html-snippet', { body: pageState.htmlSnippet });
          }

          await testInfo.attach('action-history', {
            body: actionTracker.get().join('\n'),
          });

          // Attach console errors if any
          if (consoleErrors.length > 0) {
            await testInfo.attach('console-errors', {
              body: JSON.stringify(consoleErrors),
              contentType: 'application/json',
            });
          }

          // Attach network errors if any
          if (networkErrors.length > 0) {
            await testInfo.attach('network-errors', {
              body: JSON.stringify(networkErrors),
              contentType: 'application/json',
            });
          }
        } catch (error) {
          // Failed to capture page state
        }
      }
    },
    { auto: true },
  ],
});

export { expect };
