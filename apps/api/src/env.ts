import "dotenv/config"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    DB_PASSWORD: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    API_KEY_ENCRYPTION_KEY: z.string().length(32),
    STRAVA_CLIENT_ID: z.string().min(1),
    STRAVA_CLIENT_SECRET: z.string().min(1),
    STRAVA_REDIRECT_URI: z.string().url(),
    STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
    CLAUDE_API_KEY: z.string().optional(),
    POSTHOG_API_KEY: z.string().optional(),
    POSTHOG_HOST: z.string().url().default("https://eu.i.posthog.com"),
    FRONTEND_URL: z.string().url().default("http://localhost:3001"),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
