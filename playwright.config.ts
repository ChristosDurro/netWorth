import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the pre-rendered production build, served under
 * /netWorth/ exactly like the GitHub Pages project site.
 */
const BASE = 'http://localhost:5350/netWorth/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL: BASE, trace: 'retain-on-failure', serviceWorkers: 'block' },
  webServer: {
    command: 'node scripts/build-pages.mjs && npx vite preview --base /netWorth/ --port 5350 --strictPort',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
