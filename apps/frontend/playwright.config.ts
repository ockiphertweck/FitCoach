import { readFileSync } from "node:fs"
import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"

// Load JWT_SECRET from root .env so test fixtures can sign matching tokens
try {
  const envFile = readFileSync(join(__dirname, "../../.env"), "utf-8")
  for (const line of envFile.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*([^\r\n]+)/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
} catch {
  // .env not present (CI may inject env vars directly)
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    port: 3001,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
