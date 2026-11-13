import { defineConfig, devices } from '@playwright/test';

// Browser tests for flows that only break in a real browser: mobile Safari first, since that is
// where Martin hit the stuck Reject modal and the endless splash on 13 Nov 2026.
// The app is the production build served by `vite preview`; Supabase is mocked per test
// (e2e/mockSupabase.ts), so these run offline and can replay server failures exactly.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
  },
  projects: [
    { name: 'mobile-safari', use: { ...devices['iPhone 15'] } },
    // Same flows on desktop Chromium, so a WebKit-only failure is easy to tell apart.
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
