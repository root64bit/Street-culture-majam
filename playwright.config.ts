import { defineConfig, devices } from '@playwright/test';
import { assertIsolatedTestEnvironment } from './tests/helpers/test-environment';

if (!assertIsolatedTestEnvironment(process.env)) {
  throw new Error(
    'Browser suites require the isolated test runner environment; shared/local/production databases are forbidden.'
  );
}
if (
  process.env.PLAYWRIGHT_TEST_BASE_URL &&
  !['http://127.0.0.1:3031', 'http://localhost:3031'].includes(process.env.PLAYWRIGHT_TEST_BASE_URL)
) {
  throw new Error(
    'Browser tests may target only the isolated local test application on port 3031.'
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3031',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
    ? undefined
    : {
        command: 'node scripts/sprint1-test-environment.mjs serve',
        url: 'http://127.0.0.1:3031',
        reuseExistingServer: false,
        timeout: 60 * 1000,
      },
});
