import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const chromiumPath =
  process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173/lotto/",
    headless: true,
    launchOptions: { executablePath: chromiumPath, args: ["--no-sandbox"] },
  },
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/lotto/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
