import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { NextConfig } from "next"

// Load JWT_SECRET from the monorepo root .env if not already set.
// Next.js only reads .env files from its own app directory; in a monorepo
// the root .env is not loaded automatically.
if (!process.env.JWT_SECRET) {
  try {
    const rootEnv = readFileSync(join(__dirname, "../../.env"), "utf-8")
    const m = rootEnv.match(/^JWT_SECRET\s*=\s*([^\r\n]+)/m)
    if (m) process.env.JWT_SECRET = m[1].trim().replace(/^["']|["']$/g, "")
  } catch {
    // .env not present — JWT_SECRET must be supplied via the environment
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_POSTHOG_KEY: process.env.POSTHOG_API_KEY ?? "",
    NEXT_PUBLIC_POSTHOG_HOST: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
  },
}

export default nextConfig
