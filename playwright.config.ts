import { defineConfig, devices } from '@playwright/test';

const appPort = Number(process.env.CONTROL_E2E_APP_PORT ?? 18080);
const fixturePort = Number(process.env.CONTROL_E2E_FIXTURE_PORT ?? 15000);
const appUrl = `http://localhost:${appPort}`;
const fixtureReadyUrl = `http://[::1]:${fixturePort}`;
const appReadyUrl = `http://[::1]:${appPort}`;

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/artifacts/test-results',
  snapshotPathTemplate: './e2e/snapshots/{testFilePath}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e/artifacts/report', open: 'never' }],
  ],
  use: {
    baseURL: appUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run e2e:fixture',
      env: {
        ...process.env,
        CONTROL_E2E_FIXTURE_PORT: String(fixturePort),
      },
      url: `${fixtureReadyUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run start:e2e -- --host :: --port ${appPort}`,
      url: appReadyUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
