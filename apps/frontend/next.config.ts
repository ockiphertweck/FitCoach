import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_POSTHOG_KEY: process.env.POSTHOG_API_KEY ?? "",
    NEXT_PUBLIC_POSTHOG_HOST: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
  },
}

export default nextConfig
