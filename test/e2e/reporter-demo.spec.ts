import { test, expect } from '../../src/test-fixture';

test.describe('Basic Reporter Features', () => {
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

  test('test with missing element for selector similarity', async ({ page }) => {
    await page.goto('https://playwright.dev');

    await expect(page.locator('.this-does-not-exist')).toBeVisible();
  });
});

test.describe('Timeout Handling', () => {
  test('timeout waiting for element - shows enhanced context', async ({ page }) => {
    // This test demonstrates the enhanced timeout error messages
    // The reporter will show what was being waited for and duration
    await page.goto('https://example.com');

    // This will timeout after 3 seconds
    await expect(page.locator('#will-never-appear')).toBeVisible({ timeout: 3000 });
  });

  test('timeout with multiple waits', async ({ page }) => {
    await page.goto('https://playwright.dev');

    // First wait succeeds
    await expect(page.locator('h1')).toBeVisible();

    // Second wait times out - shows action history before timeout
    await expect(page.locator('#non-existent-modal')).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Form Interactions', () => {
  test('form interaction with rich action history', async ({ page }) => {
    // Demonstrates fill() and click() action tracking
    await page.goto('https://playwright.dev');

    // Search interaction (will fail but shows action history)
    await page.fill('[placeholder="Search"]', 'test automation');
    await page.keyboard.press('Enter');

    // This will fail, but the reporter will show the fill action
    await expect(page.locator('.search-results-success')).toBeVisible();
  });

  test('multiple form fields', async ({ page }) => {
    // Shows multiple fill operations in action history
    await page.goto('https://github.com/login');

    await page.fill('#login_field', 'testuser@example.com');
    await page.fill('#password', 'testpassword123');
    await page.click('[name="commit"]');

    // Will fail but shows complete form interaction history
    await expect(page.locator('.logged-in-indicator')).toBeVisible({ timeout: 2000 });
  });
});

test.describe('JavaScript Errors', () => {
  test('page javascript error - captured in console', async ({ page }) => {
    // Demonstrates pageerror event capture
    await page.goto('https://example.com');

    // Intentionally throw a JS error
    await page.evaluate(() => {
      throw new Error('Intentional JavaScript error for testing');
    });

    // Continue with test that will fail
    await expect(page.locator('#after-error')).toBeVisible();
  });

  test('console errors and warnings', async ({ page }) => {
    await page.goto('https://example.com');

    // Generate various console messages
    await page.evaluate(() => {
      console.error('Critical error: Database connection failed');
      console.warn('Warning: Deprecated API usage');
      console.error('Another error: Invalid user input');
    });

    // Test will fail and show all console errors
    await expect(page.locator('.no-errors')).toBeVisible();
  });
});

test.describe('Multiple Failures', () => {
  test('multiple assertion failures - tests maxInlineErrors', async ({ page }) => {
    // This test has multiple failures to demonstrate truncation
    await page.goto('https://example.com');

    // All of these will fail
    await expect(page).toHaveTitle('Wrong Title 1');
    await expect(page.locator('h1')).toHaveText('Wrong Heading');
    await expect(page.locator('p')).toHaveText('Wrong Paragraph');
    await expect(page.locator('#missing1')).toBeVisible();
    await expect(page.locator('#missing2')).toBeVisible();
    await expect(page.locator('#missing3')).toBeVisible();
    await expect(page.locator('#missing4')).toBeVisible();
    await expect(page.locator('#missing5')).toBeVisible();
  });
});

test.describe('Complex Navigation', () => {
  test('multi-page navigation with history', async ({ page }) => {
    // Shows navigation tracking across multiple pages
    await page.goto('https://playwright.dev');

    // Navigate through multiple pages
    await page.click('text=Get started');
    await page.waitForLoadState('domcontentloaded');

    await page.click('text=Installation');
    await page.waitForLoadState('domcontentloaded');

    // This will fail but shows full navigation history
    await expect(page.locator('#installation-complete-indicator')).toBeVisible();
  });

  test('navigation with back/forward', async ({ page }) => {
    await page.goto('https://example.com');
    await page.goto('https://playwright.dev');

    // Go back
    await page.goBack();
    await expect(page).toHaveURL('https://example.com');

    // Go forward
    await page.goForward();

    // Will fail but shows navigation history
    await expect(page.locator('#nav-test-element')).toBeVisible();
  });
});

test.describe('Network Errors', () => {
  test('blocked network request', async ({ page }) => {
    // Block specific requests to demonstrate network error capture
    await page.route('**/*.css', (route) => route.abort());
    await page.route('**/*.js', (route) => route.abort());

    // Navigate to a page that will try to load CSS/JS
    await page.goto('https://playwright.dev');

    // Will fail and show network errors in the action history
    await expect(page.locator('.hero__title')).toHaveText('Incorrect Text');
  });

  test('failed resource loading', async ({ page }) => {
    // Block CSS/JS resources
    await page.route('**/*.css', (route) => route.abort());
    await page.route('**/*.js', (route) => route.abort());

    await page.goto('https://playwright.dev');

    // Page will load but without styles/scripts - network errors captured
    await expect(page.locator('.properly-styled-element')).toBeVisible();
  });
});

test.describe('Long Error Messages', () => {
  test('very long error message - tests truncation', async ({ page }) => {
    await page.goto('https://example.com');

    // Create a very long string for comparison
    const longString = 'This is a very long string that repeats. '.repeat(200);
    const actualText = await page.locator('body').textContent();

    // This will produce a very long error message
    expect(actualText).toBe(longString);
  });

  test('long selector names', async ({ page }) => {
    await page.goto('https://example.com');

    // Use a very long, complex selector that doesn't exist
    const longSelector =
      '[data-test-id="very-long-selector-name-that-does-not-exist-' +
      'and-will-cause-a-failure-to-demonstrate-selector-truncation-in-reports-' +
      'with-even-more-text-to-make-it-longer"]';

    await expect(page.locator(longSelector)).toBeVisible();
  });
});

test.describe('Screenshot and Visual Context', () => {
  test('failure with specific viewport', async ({ page }) => {
    // Set specific viewport to test screenshot context
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('https://playwright.dev');

    // Scroll to middle of page before failure
    await page.evaluate(() => window.scrollTo(0, 500));

    // Will fail and capture screenshot at scroll position
    await expect(page.locator('#scrolled-element')).toBeVisible();
  });

  test('mobile viewport failure', async ({ page }) => {
    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('https://example.com');

    // Will fail with mobile screenshot
    await expect(page.locator('.desktop-only-element')).toBeVisible();
  });
});

test.describe('Mixed Failure Types', () => {
  test('combination of errors - console, network, and assertion', async ({ page }) => {
    // This test combines multiple failure types

    // Setup network blocking
    await page.route('**/analytics/**', (route) => route.abort());

    await page.goto('https://example.com');

    // Trigger console error
    await page.evaluate(() => {
      console.error('Application error: Failed to initialize');
    });

    // Cause network error by trying to load blocked resource
    await page.evaluate(() => {
      fetch('/analytics/track').catch(() => {});
    });

    // Finally, assertion failure
    await expect(page.locator('#success-message')).toBeVisible();
  });
});

test.describe('Selector Similarity Features', () => {
  test('similar selector suggestions - button', async ({ page }) => {
    await page.goto('https://playwright.dev');

    // Try to click a button with slightly wrong text
    // Reporter should suggest similar buttons
    await expect(page.locator('button:has-text("Get Startedd")')).toBeVisible();
  });

  test('similar selector suggestions - id', async ({ page }) => {
    await page.goto('https://example.com');

    // Wrong ID that's similar to existing ones
    await expect(page.locator('#moree-informations')).toBeVisible();
  });

  test('similar selector suggestions - class', async ({ page }) => {
    await page.goto('https://playwright.dev');

    // Class name that's close but not exact
    await expect(page.locator('.nav-linkk')).toBeVisible();
  });
});
