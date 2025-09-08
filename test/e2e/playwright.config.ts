import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 4,

  // Reduce timeouts for faster test runs
  timeout: 5000, // 5 seconds per test (default is 30000)
  expect: {
    timeout: 2000, // 2 seconds for expect assertions (default is 5000)
  },

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
    actionTimeout: 3000, // 3 seconds for actions like click, fill (default is no timeout)
    navigationTimeout: 3000, // 3 seconds for page navigation (default is 30000)
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
