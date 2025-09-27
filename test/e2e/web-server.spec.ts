import { test, expect } from '@playwright/test';

test.describe('Web server tests', () => {
  test('should connect to web server', async ({ page }) => {
    // This test will attempt to navigate to the web server
    await page.goto('/');

    // Basic check that the page loaded
    await expect(page).toHaveURL(/http:\/\/localhost:\d+\//);

    // Check for some content
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('should handle web server timeout', async ({ page }) => {
    // This test simulates a slow server response
    await page.goto('/slow', { timeout: 1000 });

    // This should timeout since we set a short timeout
    await expect(page.locator('#content')).toBeVisible();
  });
});
