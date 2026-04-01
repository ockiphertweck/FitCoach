import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import bcrypt from "bcryptjs"
import { eq } from "drizzle-orm"
import { SignJWT } from "jose"
import { z } from "zod"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"
import { env } from "../env.js"
import { authMiddleware } from "../middleware/auth.js"

const COOKIE_NAME = "fitcoach_token"
const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

async function signJwt(userId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET)
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret)
}

const authRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Public: lets the frontend know whether first-run setup is needed
  fastify.get(
    "/auth/status",
    { schema: { response: { 200: z.object({ setup: z.boolean() }) } } },
    async () => {
      const existing = await db.select().from(users).limit(1)
      return { setup: existing.length > 0 }
    }
  )

  fastify.post(
    "/auth/setup",
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }),
        response: {
          200: z.object({ id: z.string(), email: z.string() }),
          409: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body

      const existing = await db.select().from(users).limit(1)
      if (existing.length > 0) {
        return reply.code(409).send({ error: "User already exists. FitCoach is single-user." })
      }

      const passwordHash = await bcrypt.hash(password, 12)
      const [user] = await db.insert(users).values({ email, passwordHash }).returning()

      const token = await signJwt(user.id, user.email)
      reply.setCookie(COOKIE_NAME, token, COOKIE_OPTS)

      return { id: user.id, email: user.email }
    }
  )

  fastify.post(
    "/auth/login",
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string(),
        }),
        response: {
          200: z.object({ id: z.string(), email: z.string() }),
          401: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.code(401).send({ error: "Invalid email or password" })
      }

      const token = await signJwt(user.id, user.email)
      reply.setCookie(COOKIE_NAME, token, COOKIE_OPTS)

      return { id: user.id, email: user.email }
    }
  )

  fastify.post(
    "/auth/logout",
    { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
    async (_request, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: "/" })
      return { ok: true }
    }
  )

  fastify.get(
    "/auth/me",
    {
      preHandler: authMiddleware,
      schema: {
        response: {
          200: z.object({ id: z.string(), email: z.string(), createdAt: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1)

      if (!user) {
        return reply.code(404).send({ error: "User not found" })
      }

      return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() }
    }
  )
}

export default authRoutes
