import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../db/index.js";
import { activities, stravaTokens, userProfiles } from "../db/schema.js";
import { env } from "../env.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  computeInsightHash,
  generateActivityInsight,
} from "../services/activity-insight.js";
import { getAnthropicClient } from "../services/anthropic-client.js";
import { encrypt } from "../services/encryption.js";
import {
  getActivities,
  getActivity,
  getActivityStreams,
  getFreshAccessToken,
  stravaActivityToDbFields,
} from "../services/strava-client.js";

async function maybeGenerateInsight(
  userId: string,
  activityId: string,
  log: { error: (obj: unknown, msg: string) => void },
): Promise<void> {
  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
    .limit(1);

  if (!activity) return;

  const newHash = computeInsightHash(activity);
  if (activity.rawDataHash === newHash && activity.aiInsight) return;

  const anthropic = await getAnthropicClient(userId);
  if (!anthropic) return;

  try {
    const insight = await generateActivityInsight(
      anthropic,
      activity,
      undefined,
      userId,
    );
    await db
      .update(activities)
      .set({ aiInsight: insight, rawDataHash: newHash })
      .where(eq(activities.id, activityId));
  } catch (err) {
    log.error({ err }, "Failed to generate activity insight");
  }
}

const STRAVA_SCOPES = "read,activity:read_all";

const stravaRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Public: Strava webhook verification
  fastify.get(
    "/strava/webhook",
    {
      schema: {
        querystring: z.object({
          "hub.mode": z.string().optional(),
          "hub.challenge": z.string().optional(),
          "hub.verify_token": z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      if (!env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
        return reply
          .code(503)
          .send({
            error:
              "Webhooks not configured (STRAVA_WEBHOOK_VERIFY_TOKEN not set)",
          });
      }
      const query = request.query;
      if (
        query["hub.mode"] === "subscribe" &&
        query["hub.verify_token"] === env.STRAVA_WEBHOOK_VERIFY_TOKEN &&
        query["hub.challenge"]
      ) {
        return reply.send({ "hub.challenge": query["hub.challenge"] });
      }
      return reply.code(400).send({ error: "Invalid webhook verification" });
    },
  );

  // Public: Strava webhook event receiver
  fastify.post(
    "/strava/webhook",
    {
      schema: {
        body: z
          .object({
            object_type: z.string(),
            aspect_type: z.string(),
            object_id: z.number(),
            owner_id: z.number(),
          })
          .passthrough(),
      },
    },
    async (request, reply) => {
      if (!env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
        return reply.code(503).send({ error: "Webhooks not configured" });
      }
      // Acknowledge immediately
      reply.code(200).send();

      const { object_type, aspect_type, object_id, owner_id } = request.body;

      if (object_type !== "activity") return;
      if (aspect_type !== "create" && aspect_type !== "update") return;

      // Find user by Strava athlete ID
      const [token] = await db
        .select()
        .from(stravaTokens)
        .where(eq(stravaTokens.athleteId, owner_id))
        .limit(1);

      if (!token) return;

      try {
        const accessToken = await getFreshAccessToken(token.userId, db);
        const stravaActivity = await getActivity(
          accessToken,
          String(object_id),
        );
        const fields = stravaActivityToDbFields(stravaActivity, token.userId);

        const [upserted] = await db
          .insert(activities)
          .values(fields)
          .onConflictDoUpdate({
            target: [
              activities.userId,
              activities.externalId,
              activities.source,
            ],
            set: fields,
          })
          .returning({ id: activities.id });

        if (upserted) {
          maybeGenerateInsight(token.userId, upserted.id, fastify.log).catch(
            () => {},
          );
        }
      } catch (err) {
        fastify.log.error({ err }, "Strava webhook processing failed");
      }
    },
  );

  // Auth required routes
  fastify.register(async (authenticated) => {
    authenticated.addHook("preHandler", authMiddleware);

    authenticated.get(
      "/strava/connect",
      { schema: { response: {} } },
      async (_request, reply) => {
        const params = new URLSearchParams({
          client_id: env.STRAVA_CLIENT_ID,
          redirect_uri: env.STRAVA_REDIRECT_URI,
          response_type: "code",
          scope: STRAVA_SCOPES,
        });
        return reply.redirect(
          `https://www.strava.com/oauth/authorize?${params}`,
        );
      },
    );

    authenticated.get(
      "/strava/callback",
      {
        schema: {
          querystring: z.object({
            code: z.string().optional(),
            error: z.string().optional(),
          }),
        },
      },
      async (request, reply) => {
        const { code, error } = request.query;

        if (error || !code) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?strava=error`);
        }

        const res = await fetch("https://www.strava.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
          }),
        });

        if (!res.ok) {
          return reply.redirect(`${env.FRONTEND_URL}/settings?strava=error`);
        }

        const data = (await res.json()) as {
          access_token: string;
          refresh_token: string;
          expires_at: number;
          athlete: { id: number };
        };

        await db
          .insert(stravaTokens)
          .values({
            userId: request.user.sub,
            accessToken: encrypt(data.access_token),
            refreshToken: encrypt(data.refresh_token),
            expiresAt: new Date(data.expires_at * 1000),
            athleteId: data.athlete.id,
          })
          .onConflictDoUpdate({
            target: stravaTokens.userId,
            set: {
              accessToken: encrypt(data.access_token),
              refreshToken: encrypt(data.refresh_token),
              expiresAt: new Date(data.expires_at * 1000),
              athleteId: data.athlete.id,
              updatedAt: new Date(),
            },
          });

        return reply.redirect(`${env.FRONTEND_URL}/settings?strava=connected`);
      },
    );

    authenticated.post(
      "/strava/sync",
      { schema: { response: { 200: z.object({ synced: z.number() }) } } },
      async (request, reply) => {
        const userId = request.user.sub;

        const [token] = await db
          .select()
          .from(stravaTokens)
          .where(eq(stravaTokens.userId, userId))
          .limit(1);

        if (!token) {
          return reply
            .code(400)
            .send({ error: "Strava not connected" } as never);
        }

        // Always sync last 30 days so upsert backfills calories/RPE on existing activities
        const after = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

        const accessToken = await getFreshAccessToken(userId, db);
        const stravaActivities = await getActivities(accessToken, after);

        // Fetch user's max HR once for zone calculation
        const [profile] = await db
          .select({ maxHeartRate: userProfiles.maxHeartRate })
          .from(userProfiles)
          .where(eq(userProfiles.userId, userId))
          .limit(1);
        const maxHr = profile?.maxHeartRate ?? null;

        let synced = 0;
        const insightPromises: Promise<void>[] = [];

        for (const sa of stravaActivities) {
          // Fetch detail for calories + perceived_exertion (not in list endpoint)
          let detail = sa;
          try {
            detail = await getActivity(accessToken, String(sa.id));
          } catch {
            // non-fatal — fall back to list data
          }
          const fields = stravaActivityToDbFields(detail, userId);

          // Fetch streams and embed in upsert
          let streamData: Record<string, unknown> | null = null;
          try {
            const streams = await getActivityStreams(
              accessToken,
              String(sa.id),
              maxHr,
            );
            if (streams.points.length > 0) {
              streamData = streams as unknown as Record<string, unknown>;
            }
          } catch {
            // streams not available for all activity types
          }

          const [upserted] = await db
            .insert(activities)
            .values({ ...fields, streamData })
            .onConflictDoUpdate({
              target: [
                activities.userId,
                activities.externalId,
                activities.source,
              ],
              set: { ...fields, streamData },
            })
            .returning({ id: activities.id });

          if (upserted) {
            insightPromises.push(
              maybeGenerateInsight(userId, upserted.id, request.log).catch(
                () => {},
              ),
            );
          }
          synced++;
        }

        // Fire-and-forget — don't block the sync response
        Promise.allSettled(insightPromises).catch(() => {});

        return { synced };
      },
    );

    authenticated.get(
      "/strava/status",
      {
        schema: {
          response: {
            200: z.object({
              connected: z.boolean(),
              athleteId: z.number().nullable(),
              lastSynced: z.string().nullable(),
            }),
          },
        },
      },
      async (request) => {
        const [token] = await db
          .select()
          .from(stravaTokens)
          .where(eq(stravaTokens.userId, request.user.sub))
          .limit(1);

        if (!token) {
          return { connected: false, athleteId: null, lastSynced: null };
        }

        const [lastActivity] = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.userId, request.user.sub),
              eq(activities.source, "strava"),
            ),
          )
          .orderBy(desc(activities.startDate))
          .limit(1);

        return {
          connected: true,
          athleteId: token.athleteId,
          lastSynced: lastActivity?.startDate.toISOString() ?? null,
        };
      },
    );

    authenticated.delete(
      "/strava/disconnect",
      { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
      async (request) => {
        await db
          .delete(stravaTokens)
          .where(eq(stravaTokens.userId, request.user.sub));

        return { ok: true };
      },
    );
  });
};

export default stravaRoutes;
