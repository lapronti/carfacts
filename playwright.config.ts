import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
 testDir:'./tests/e2e',
 fullyParallel:false,
 forbidOnly:!!process.env.CI,
 retries:0,
 workers:1,
 reporter:process.env.CI?'github':'list',
 timeout:30000,
 use:{
  baseURL:'http://127.0.0.1:4179',
  trace:'off',
  screenshot:'off',
  video:'off',
  ...devices['Desktop Chrome']
 },
 webServer:{
  command:'node tests/fixtures/static-server.cjs',
  url:'http://127.0.0.1:4179/',
  reuseExistingServer:!process.env.CI,
  timeout:15000
 }
});
