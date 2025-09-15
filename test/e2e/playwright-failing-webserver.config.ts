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
        outputDir: 'test-report-failing-webserver',
        includeScreenshots: true,
        capturePageState: true,
        maxInlineErrors: 3,
        singleReportFile: true,
        silent: false,
      },
    ],
  ],

  // Web server configuration that will fail
  webServer: {
    command: 'node failing-server.js',
    port: 3456,
    cwd: __dirname,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000, // Will timeout waiting for the server
  },

  use: {
    baseURL: 'http://localhost:3456',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});