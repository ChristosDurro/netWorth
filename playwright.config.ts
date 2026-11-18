import { defineConfig, devices } from '@playwright/test';

/** End-to-end tests run against the production build, exactly as it would be deployed. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5350', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite build && npx vite preview --port 5350 --strictPort',
    url: 'http://localhost:5350',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
