import { defineConfig, devices } from '@playwright/test';
import { BACKEND_ORIGIN, FRONT_PORT, FRONT_URL } from './e2e/support/env.js';

// E2E runs against a LOCAL stack only: the backend on a throwaway Mongo (Docker, port 27018, database
// `booking_e2e`) and the Vite dev server. Both servers are started here on dedicated ports and are
// never reused. See e2e/support/env.js for the safety rules and start-backend.mjs for the backend launch.
//
// Prerequisite: `docker run -d --name booking-e2e-mongo -p 27018:27017 mongo` (or any Mongo on :27018).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: FRONT_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/support/start-backend.mjs',
      url: `${BACKEND_ORIGIN}/api/catalog`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite --port ${FRONT_PORT} --strictPort`,
      url: FRONT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
