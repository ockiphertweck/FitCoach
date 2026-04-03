import { join } from "node:path"
import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

config({ path: join(process.cwd(), "../../.env"), override: true })
if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), ".env"), override: false })
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is validated at runtime by env.ts
    url: process.env.DATABASE_URL!,
  },
})
