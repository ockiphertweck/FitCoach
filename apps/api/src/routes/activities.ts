import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { z } from "zod"
import { db } from "../db/index.js"
import { activities, userProfiles } from "../db/schema.js"
import { authMiddleware } from "../middleware/auth.js"
import { calculateTrainingLoad } from "../services/atl-ctl.js"
import { getActivityStreams, getFreshAccessToken } from "../services/strava-client.js"

const activitiesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", authMiddleware)

  fastify.get(
    "/activities",
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(500).default(20),
          offset: z.coerce.number().int().min(0).default(0),
          sport: z.string().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
        }),
      },
    },
    async (request) => {
      const { limit, offset, sport, from, to } = request.query
      const userId = request.user.sub

      const conditions = [eq(activities.userId, userId)]

      if (sport) conditions.push(eq(activities.sportType, sport))
      if (from) conditions.push(gte(activities.startDate, new Date(from)))
      if (to) conditions.push(lte(activities.startDate, new Date(to)))

      const where = and(...conditions)

      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(activities)
          .where(where)
          .orderBy(desc(activities.startDate))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(activities).where(where),
      ])

      return { items, total, limit, offset }
    }
  )

  fastify.get(
    "/activities/stats",
    {
      schema: {
        response: { 200: z.object({ atl: z.number(), ctl: z.number(), tsb: z.number() }) },
      },
    },
    async (request) => {
      const userId = request.user.sub
      const fortyTwoDaysAgo = new Date()
      fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42)

      const allActivities = await db
        .select()
        .from(activities)
        .where(and(eq(activities.userId, userId), gte(activities.startDate, fortyTwoDaysAgo)))
        .orderBy(asc(activities.startDate))

      return calculateTrainingLoad(allActivities)
    }
  )

  fastify.get(
    "/activities/:id",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
      },
    },
    async (request, reply) => {
      const [activity] = await db
        .select()
        .from(activities)
        .where(and(eq(activities.id, request.params.id), eq(activities.userId, request.user.sub)))
        .limit(1)

      if (!activity) {
        return reply.code(404).send({ error: "Activity not found" })
      }

      return activity
    }
  )

  const streamPoint = z.object({
    distanceKm: z.number(),
    heartrate: z.number().nullable(),
    speedKmh: z.number().nullable(),
    altitudeM: z.number().nullable(),
  })

  const hrZonesSchema = z.object({
    zone1: z.number(),
    zone2: z.number(),
    zone3: z.number(),
    zone4: z.number(),
    zone5: z.number(),
  })

  fastify.get(
    "/activities/:id/streams",
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            points: z.array(streamPoint),
            hrZones: hrZonesSchema.nullable(),
            maxHrUsed: z.number().nullable(),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub

      const [activity] = await db
        .select()
        .from(activities)
        .where(and(eq(activities.id, request.params.id), eq(activities.userId, userId)))
        .limit(1)

      if (!activity) return reply.code(404).send({ error: "Activity not found" })
      if (activity.source !== "strava") {
        return reply.code(404).send({ error: "Streams only available for Strava activities" })
      }

      // Return stored stream data if available (populated during sync)
      if (activity.streamData) {
        return activity.streamData
      }

      // Fall back to live Strava fetch
      const [profile] = await db
        .select({ maxHeartRate: userProfiles.maxHeartRate })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1)

      const token = await getFreshAccessToken(userId, db)
      return await getActivityStreams(token, activity.externalId, profile?.maxHeartRate ?? null)
    }
  )
}

export default activitiesRoutes
