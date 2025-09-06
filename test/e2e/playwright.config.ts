import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    [
      path.resolve(__dirname, '../../dist/index.js'),
      {
        // Uses default: 'test-report-for-coding-agents' in project root
        includeScreenshots: true,
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
    trace: 'off',
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
