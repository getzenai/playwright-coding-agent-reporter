import { test, expect } from '../../src/test-fixture';

test.describe('Timeout Scenarios', () => {
  test.describe.configure({ timeout: 5000 }); // Short timeout for demo purposes

  test('Basic timeout - element not found', async ({ page }) => {
    await page.goto('data:text/html,<h1>Test Page</h1>');

    // This will timeout waiting for non-existent element
    await expect(page.locator('#does-not-exist')).toBeVisible({ timeout: 2000 });
  });

  test('Timeout with no navigation (about:blank)', async ({ page }) => {
    // Don't navigate - stay on about:blank to test URL capture
    await expect(page.locator('#missing-element')).toBeVisible({ timeout: 2000 });
  });

  test('Timeout after partial page actions', async ({ page }) => {
    await page.goto('data:text/html,<form><input id="field1"><input id="field2"></form>');

    // Some successful actions
    await page.fill('#field1', 'test value');
    await page.evaluate(() => console.log('Form interaction started'));

    // Then timeout on missing element - should show action history
    await expect(page.locator('#submit-success')).toBeVisible({ timeout: 2000 });
  });

  test('Timeout with hidden elements', async ({ page }) => {
    const hiddenContent = `
      <html>
        <body>
          <div style="display: none" id="hidden-container">
            <button id="hidden-button">Click me</button>
          </div>
          <div id="visible-content">Visible text</div>
        </body>
      </html>
    `;

    await page.goto(`data:text/html,${encodeURIComponent(hiddenContent)}`);

    // Try to interact with hidden element - reporter should indicate it's hidden
    await expect(page.locator('#hidden-button')).toBeVisible({ timeout: 2000 });
  });

  test('Timeout with console errors', async ({ page }) => {
    await page.goto('data:text/html,<h1>Error Test</h1>');

    // Generate console errors
    await page.evaluate(() => {
      console.error('Critical error: Database connection failed');
      console.warn('Warning: Deprecated API usage');
    });

    // Timeout with console context
    await expect(page.locator('.success-message')).toBeVisible({ timeout: 2000 });
  });

  test('Timeout during slow operation with retry pattern', async ({ page }) => {
    await page.goto('data:text/html,<input id="email">');

    // Simulate retry pattern from real issue
    const fillWithRetry = async (selector: string, value: string, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          await page.fill(selector, value);
          const inputValue = await page.inputValue(selector);
          if (inputValue === value) return;
        } catch (error) {
          if (i === retries - 1) throw error;
          await page.waitForTimeout(500);
        }
      }
    };

    // This will timeout during retries
    await fillWithRetry('#non-existent-field', 'test@example.com');
  });
});
