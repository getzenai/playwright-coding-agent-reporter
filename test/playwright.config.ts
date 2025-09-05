import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './fixtures',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    [
      path.resolve(__dirname, '../dist/index.js'),
      {
        outputDir: 'test-results',
        includeScreenshots: true,
        includeAccessibilityTree: true,
        includeConsoleErrors: true,
        includeNetworkErrors: true,
        includeVideo: false,
        silent: false,
        maxErrorLength: 5000,
        singleReportFile: true,
        verboseErrors: true,
        maxInlineErrors: 5,
        showCodeSnippet: true,
        capturePageState: true,
      },
    ],
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
