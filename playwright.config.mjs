import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  globalTeardown: './tests/ui-teardown.mjs',
  use: { baseURL: 'http://127.0.0.1:3219', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/preview-server.mjs',
    url: 'http://127.0.0.1:3219',
    reuseExistingServer: false,
    timeout: 20000,
  },
});
