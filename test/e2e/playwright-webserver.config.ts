import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  reporter: [
    [
      path.resolve(__dirname, '../../dist/index.js'),
      {
        outputDir: 'test-report-webserver',
        includeScreenshots: true,
        capturePageState: true,
        maxInlineErrors: 3,
        singleReportFile: true,
        silent: false,
      },
    ],
  ],

  // Web server configuration
  webServer: {
    command: 'node test-server.js',
    port: 3456,
    cwd: __dirname,
    reuseExistingServer: false,
    stdout: 'pipe', // This ensures stdout is captured
    stderr: 'pipe', // This ensures stderr is captured
    timeout: 10000, // 10 seconds to start
  },

  use: {
    baseURL: 'http://localhost:3456',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Short timeouts to trigger errors for testing
    actionTimeout: 3000,
    navigationTimeout: 3000,
  },

  timeout: 5000, // 5 seconds per test
  expect: {
    timeout: 2000, // 2 seconds for assertions
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
