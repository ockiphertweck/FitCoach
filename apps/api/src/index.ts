import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import sensible from "@fastify/sensible"
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod"
import Fastify from "fastify"
import { env } from "./env.js"
import { authPlugin } from "./middleware/auth.js"
import activitiesRoutes from "./routes/activities.js"
import aiRoutes from "./routes/ai.js"
import authRoutes from "./routes/auth.js"
import settingsRoutes from "./routes/settings.js"
import stravaRoutes from "./routes/strava.js"

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
})

// Type provider
fastify.setValidatorCompiler(validatorCompiler)
fastify.setSerializerCompiler(serializerCompiler)

// Plugins
await fastify.register(sensible)
await fastify.register(cookie)
await fastify.register(cors, {
  origin: env.FRONTEND_URL,
  credentials: true,
})
await fastify.register(authPlugin)

// Routes
await fastify.register(authRoutes)
await fastify.register(activitiesRoutes)
await fastify.register(stravaRoutes)
await fastify.register(aiRoutes)
await fastify.register(settingsRoutes)

// Health check
fastify.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }))

// Start
try {
  await fastify.listen({ port: env.PORT, host: "0.0.0.0" })
  fastify.log.info(`FitCoach API running on port ${env.PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
