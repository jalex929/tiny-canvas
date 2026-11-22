import { defineConfig, devices } from "@playwright/test";

// Runs against the production build: `npm run build` first.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4175/", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4175/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
