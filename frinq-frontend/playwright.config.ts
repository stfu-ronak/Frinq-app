import { defineConfig, devices } from "@playwright/test";

// Smoke-only config for the quiz funnel. Points at a local `next dev`
// server — these tests assert pages render and client-only navigation
// works; they never hit backend endpoints (no OTP send/verify, no quiz
// submit), so no live API/DB/Twilio is required to run them.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
