import { config } from "dotenv"
import { join } from "node:path"
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
    url: process.env.DATABASE_URL!,
  },
})
