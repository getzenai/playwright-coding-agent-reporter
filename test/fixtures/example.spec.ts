import { test, expect } from '../../src/test-fixture';

test.describe('Example Test Suite', () => {
  test('successful test - should pass', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await expect(page).toHaveTitle(/Playwright/);
  });

  test('failing test - element not found', async ({ page }) => {
    await page.goto('https://playwright.dev');

    await page.evaluate(() => {
      console.error('This is a console error for testing');
      console.warn('This is a console warning');
    });

    await expect(page.locator('#non-existent-element')).toBeVisible();
  });

  test('failing test - assertion failure', async ({ page }) => {
    await page.goto('https://example.com');

    const title = await page.title();
    expect(title).toBe('Wrong Title');
  });

  test('failing test with network error', async ({ page }) => {
    page.on('pageerror', (error) => {
      console.log('Page error:', error);
    });

    await page.goto('https://thissitedoesnotexist12345.com').catch(() => {});

    await expect(page.locator('h1')).toHaveText('This will fail');
  });

  test.skip('skipped test', async ({ page }) => {
    await page.goto('https://playwright.dev');
  });

  test('test with accessibility tree capture', async ({ page }) => {
    await page.goto('https://playwright.dev');

    const accessibilityTree = await page.accessibility.snapshot();

    await expect(page.locator('.this-does-not-exist')).toBeVisible();
  });
});
