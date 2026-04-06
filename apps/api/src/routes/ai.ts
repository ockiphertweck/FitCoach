import { and, asc, desc, eq, gte, lte } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { PostHog } from "posthog-node"
import { z } from "zod"
import { db } from "../db/index.js"
import { activities, chatHistory, chatSessions, userProfiles, weeklyReports } from "../db/schema.js"
import { env } from "../env.js"
import { authMiddleware } from "../middleware/auth.js"
import { buildChatMessages, buildChatSystemPrompt } from "../prompts/chat.js"
import { buildRecommendationPrompt } from "../prompts/recommendation.js"
import { SYSTEM_PROMPT } from "../prompts/system.js"
import { buildWeeklyReportPrompt } from "../prompts/weekly-report.js"
import { computeInsightHash, generateActivityInsight } from "../services/activity-insight.js"
import { requireAnthropicClient } from "../services/anthropic-client.js"
import { calculateTrainingLoad } from "../services/atl-ctl.js"

let posthog: PostHog | null = null

if (env.POSTHOG_API_KEY) {
  posthog = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}

const notFound = z.object({ error: z.string() })

const aiRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", authMiddleware)

  // ─── Chat Sessions ────────────────────────────────────────────────────────

  fastify.get(
    "/ai/chat/sessions",
    {
      schema: {
        response: {
          200: z.object({
            sessions: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                createdAt: z.coerce.date(),
                updatedAt: z.coerce.date(),
              })
            ),
          }),
        },
      },
    },
    async (request) => {
      const sessions = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.userId, request.user.sub))
        .orderBy(desc(chatSessions.updatedAt))
      return { sessions }
    }
  )

  fastify.post(
    "/ai/chat/sessions",
    {
      schema: {
        response: {
          200: z.object({
            id: z.string(),
            title: z.string(),
            createdAt: z.coerce.date(),
            updatedAt: z.coerce.date(),
          }),
        },
      },
    },
    async (request) => {
      const [session] = await db
        .insert(chatSessions)
        .values({ userId: request.user.sub, title: "New chat" })
        .returning()
      return session
    }
  )

  fastify.patch(
    "/ai/chat/sessions/:sessionId",
    {
      schema: {
        params: z.object({ sessionId: z.string().uuid() }),
        body: z.object({ title: z.string().min(1).max(200) }),
        response: { 200: z.object({ ok: z.boolean() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params
      const userId = request.user.sub
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1)
      if (!session) return reply.code(404).send({ error: "Session not found" })
      await db
        .update(chatSessions)
        .set({ title: request.body.title, updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId))
      return { ok: true }
    }
  )

  fastify.delete(
    "/ai/chat/sessions/:sessionId",
    {
      schema: {
        params: z.object({ sessionId: z.string().uuid() }),
        response: { 200: z.object({ ok: z.boolean() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params
      const userId = request.user.sub
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1)
      if (!session) return reply.code(404).send({ error: "Session not found" })
      await db.delete(chatSessions).where(eq(chatSessions.id, sessionId))
      return { ok: true }
    }
  )

  // ─── Recommendation ───────────────────────────────────────────────────────

  fastify.post(
    "/ai/recommendation",
    { schema: { body: z.object({}).optional() } },
    async (request, reply) => {
      const userId = request.user.sub
      const anthropic = await requireAnthropicClient(userId)
      fastify.log.info({ userId }, "recommendation: building prompt")
      const userMessage = await buildRecommendationPrompt(userId, db)

      const origin = request.headers.origin ?? env.FRONTEND_URL
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      })

      let inputTokens = 0
      let outputTokens = 0

      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        })

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text
            reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens
          }
          if (event.type === "message_start" && event.message.usage) {
            inputTokens = event.message.usage.input_tokens
          }
        }

        reply.raw.write("data: [DONE]\n\n")
      } finally {
        reply.raw.end()
      }

      posthog?.capture({
        distinctId: userId,
        event: "ai_recommendation",
        properties: { inputTokens, outputTokens, model: "claude-sonnet-4-6" },
      })
    }
  )

  // ─── Chat ─────────────────────────────────────────────────────────────────

  fastify.post(
    "/ai/chat",
    {
      schema: {
        body: z.object({ message: z.string().min(1).max(4000), sessionId: z.string().uuid() }),
        response: { 404: notFound },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { message, sessionId } = request.body
      fastify.log.info(
        { userId, sessionId, messageLength: message.length },
        "chat: building prompt"
      )

      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1)
      if (!session) return reply.code(404).send({ error: "Session not found" })

      const anthropic = await requireAnthropicClient(userId)

      const history = await db
        .select()
        .from(chatHistory)
        .where(and(eq(chatHistory.userId, userId), eq(chatHistory.sessionId, sessionId)))
        .orderBy(desc(chatHistory.createdAt))
        .limit(20)

      const [systemPrompt, messages] = await Promise.all([
        buildChatSystemPrompt(userId, db),
        Promise.resolve(
          buildChatMessages(
            [...history].reverse().map((m) => ({ role: m.role, content: m.content }))
          )
        ),
      ])

      messages.push({ role: "user", content: message })

      const origin = request.headers.origin ?? env.FRONTEND_URL
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      })

      let fullResponse = ""
      let inputTokens = 0
      let outputTokens = 0

      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        })

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text
            fullResponse += text
            reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens
          }
          if (event.type === "message_start" && event.message.usage) {
            inputTokens = event.message.usage.input_tokens
          }
        }

        reply.raw.write("data: [DONE]\n\n")
      } finally {
        reply.raw.end()
      }

      const isFirstMessage = history.length === 0

      db.insert(chatHistory)
        .values([
          { userId, sessionId, role: "user", content: message },
          {
            userId,
            sessionId,
            role: "assistant",
            content: fullResponse,
            tokensUsed: inputTokens + outputTokens,
          },
        ])
        .then(async () => {
          const updates: Record<string, unknown> = { updatedAt: new Date() }
          if (isFirstMessage) {
            try {
              const titleRes = await anthropic.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 20,
                messages: [
                  {
                    role: "user",
                    content: `User asked: "${message.slice(0, 300)}"\n\nReply in 3–5 words max with a short chat title. No punctuation. No quotes. Examples: "Zone 2 training plan", "Race week recovery", "Improve FTP cycling"`,
                  },
                ],
              })
              const generated =
                titleRes.content[0]?.type === "text" ? titleRes.content[0].text.trim() : null
              if (generated) updates.title = generated.slice(0, 80)
            } catch {
              updates.title = message.slice(0, 60).trim()
            }
          }
          await db.update(chatSessions).set(updates).where(eq(chatSessions.id, sessionId))
        })
        .catch((err) => fastify.log.error(err, "Failed to save chat to history"))

      posthog?.capture({
        distinctId: userId,
        event: "ai_chat",
        properties: { inputTokens, outputTokens, model: "claude-sonnet-4-6" },
      })
    }
  )

  fastify.get(
    "/ai/chat/history",
    {
      schema: {
        querystring: z.object({ sessionId: z.string().uuid() }),
        response: {},
      },
    },
    async (request) => {
      const { sessionId } = request.query
      const messages = await db
        .select()
        .from(chatHistory)
        .where(and(eq(chatHistory.userId, request.user.sub), eq(chatHistory.sessionId, sessionId)))
        .orderBy(asc(chatHistory.createdAt))
        .limit(100)

      return { messages }
    }
  )

  fastify.delete(
    "/ai/chat/sessions/:sessionId/history",
    {
      schema: {
        params: z.object({ sessionId: z.string().uuid() }),
        response: { 200: z.object({ ok: z.boolean() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const { sessionId } = request.params
      const userId = request.user.sub
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
        .limit(1)
      if (!session) return reply.code(404).send({ error: "Session not found" })
      await db
        .delete(chatHistory)
        .where(and(eq(chatHistory.userId, userId), eq(chatHistory.sessionId, sessionId)))
      await db
        .update(chatSessions)
        .set({ title: "New chat", updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId))
      return { ok: true }
    }
  )

  // ─── Activity Insight ─────────────────────────────────────────────────────

  fastify.post(
    "/ai/activity-insight",
    {
      schema: {
        body: z.object({ activityId: z.string().uuid() }),
        response: { 200: z.object({ insight: z.string() }), 404: notFound },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { activityId } = request.body
      const anthropic = await requireAnthropicClient(userId)

      const [[activity], profileRows] = await Promise.all([
        db
          .select()
          .from(activities)
          .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
          .limit(1),
        db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
      ])

      if (!activity) return reply.code(404).send({ error: "Activity not found" })

      const profile = profileRows[0] ?? null
      fastify.log.info(
        {
          userId,
          activityId,
          hasProfile: !!profile,
          hasMaxHR: !!profile?.maxHeartRate,
          hasFTP: !!profile?.ftpWatts,
        },
        "activity-insight: generating"
      )
      const newHash = computeInsightHash(activity)
      const insight = await generateActivityInsight(anthropic, activity, profile)

      await db
        .update(activities)
        .set({ aiInsight: insight, rawDataHash: newHash })
        .where(eq(activities.id, activityId))

      return { insight }
    }
  )

  // ─── Weekly Report ────────────────────────────────────────────────────────

  fastify.post("/ai/weekly-report", { schema: {} }, async (request, _reply) => {
    const userId = request.user.sub
    const anthropic = await requireAnthropicClient(userId)

    const now = new Date()
    const daysToMonday = now.getDay() === 0 ? 6 : now.getDay() - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysToMonday)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const [weekActivities, allActivities, profileRows] = await Promise.all([
      db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            gte(activities.startDate, weekStart),
            lte(activities.startDate, weekEnd)
          )
        )
        .orderBy(asc(activities.startDate)),
      db.select().from(activities).where(eq(activities.userId, userId)),
      db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1),
    ])

    const totalDistance = weekActivities.reduce((s, a) => s + (a.distanceMeters ?? 0), 0)
    const totalDuration = weekActivities.reduce((s, a) => s + (a.durationSeconds ?? 0), 0)
    const hrValues = weekActivities.map((a) => a.averageHeartRate).filter(Boolean) as number[]
    const avgHR =
      hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null

    const load = calculateTrainingLoad(allActivities)
    const profile = profileRows[0] ?? null

    const metrics = {
      totalDistance,
      totalDuration,
      avgHR,
      sessions: weekActivities.length,
      atl: load.atl,
      ctl: load.ctl,
    }

    const prompt = buildWeeklyReportPrompt({
      weekStart,
      weekActivities,
      totalDistance,
      totalDuration,
      avgHR,
      atl: load.atl,
      ctl: load.ctl,
      tsb: load.tsb,
      profile,
    })

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    })

    const summary =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "Unable to generate summary."

    const weekStartStr = weekStart.toISOString().slice(0, 10)

    const [report] = await db
      .insert(weeklyReports)
      .values({ userId, weekStart: weekStartStr, summary, metrics })
      .onConflictDoUpdate({
        target: [weeklyReports.userId, weeklyReports.weekStart],
        set: { summary, metrics, generatedAt: new Date() },
      })
      .returning()

    return report
  })
}

export default aiRoutes
