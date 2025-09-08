import { test, expect } from '../../src/test-fixture';

test.describe('Reporter Core Features', () => {
  test('successful test - baseline', async ({ page }) => {
    await page.goto('data:text/html,<h1>Test Page</h1>');
    await expect(page.locator('h1')).toHaveText('Test Page');
  });

  test('element not found - selector suggestions', async ({ page }) => {
    await page.goto('data:text/html,<button id="submit-btn">Submit</button>');

    // Reporter should suggest similar selectors
    await expect(page.locator('#submit-button')).toBeVisible();
  });

  test('assertion failure with context', async ({ page }) => {
    await page.goto('data:text/html,<h1>Actual Title</h1>');

    const title = await page.locator('h1').textContent();
    expect(title).toBe('Expected Title');
  });

  test('console errors and warnings capture', async ({ page }) => {
    await page.goto('data:text/html,<div>Console Test</div>');

    await page.evaluate(() => {
      console.error('Critical: Database connection failed');
      console.warn('Warning: Using deprecated API');
    });

    await expect(page.locator('#non-existent')).toBeVisible();
  });

  test('form interaction tracking', async ({ page }) => {
    const formHTML = `
      <form>
        <input id="username" placeholder="Username">
        <input id="password" type="password" placeholder="Password">
        <button type="submit">Login</button>
      </form>
    `;
    await page.goto(`data:text/html,${encodeURIComponent(formHTML)}`);

    // Fill form - actions should be tracked
    await page.fill('#username', 'testuser');
    await page.fill('#password', 'testpass123');

    // Fail on missing success element
    await expect(page.locator('.login-success')).toBeVisible();
  });

  test('network error simulation', async ({ page }) => {
    // Block resources to simulate network issues
    await page.route('**/*.css', (route) => route.abort());
    await page.route('**/*.js', (route) => route.abort());

    await page.goto('https://example.com').catch(() => {});

    // Will fail with network context
    await expect(page.locator('#loaded-content')).toBeVisible();
  });

  test('multiple failures in single test', async ({ page }) => {
    await page.goto('data:text/html,<p>Test Content</p>');

    // Multiple assertions that will fail
    await expect(page).toHaveTitle('Wrong Title');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('p')).toHaveText('Wrong Text');
  });

  test('javascript error capture', async ({ page }) => {
    await page.goto('data:text/html,<div>JS Error Test</div>');

    // Throw JS error
    await page.evaluate(() => {
      throw new Error('Intentional JavaScript error');
    });

    await expect(page.locator('#after-error')).toBeVisible();
  });

  test('viewport and screenshot context', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile viewport
    await page.goto('data:text/html,<h1>Mobile View</h1><p>Content below fold</p>');

    await page.evaluate(() => window.scrollTo(0, 100));

    // Fail with mobile viewport context
    await expect(page.locator('.desktop-only')).toBeVisible();
  });

  test.skip('skipped test example', async ({ page }) => {
    await page.goto('data:text/html,<div>Skipped</div>');
  });
});
