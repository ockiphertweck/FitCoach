import type { FastifyPluginAsync, FastifyRequest } from "fastify"
import { jwtVerify } from "jose"
import { env } from "../env.js"

export interface JWTPayload {
  sub: string
  email: string
}

declare module "fastify" {
  interface FastifyRequest {
    user: JWTPayload
  }
}

export const authMiddleware = async (request: FastifyRequest): Promise<void> => {
  const token = request.cookies?.fitcoach_token

  if (!token) {
    throw request.server.httpErrors.unauthorized("Authentication required")
  }

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    if (!payload.sub || !payload.email) {
      throw new Error("Invalid token payload")
    }

    request.user = {
      sub: payload.sub as string,
      email: payload.email as string,
    }
  } catch {
    throw request.server.httpErrors.unauthorized("Invalid or expired token")
  }
}

export const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest("user", null)
}
