import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://localhost:4178',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4178',
    reuseExistingServer: false,
  },
});
