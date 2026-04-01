import { z } from "zod"

// ─── Activity ────────────────────────────────────────────────────────────────

export const SportTypeSchema = z.enum([
  "run",
  "ride",
  "swim",
  "walk",
  "hike",
  "yoga",
  "workout",
  "crossfit",
  "other",
])
export type SportType = z.infer<typeof SportTypeSchema>

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  externalId: z.string(),
  source: z.string().default("strava"),
  name: z.string().nullable(),
  sportType: z.string(),
  startDate: z.coerce.date(),
  durationSeconds: z.number().int().nullable(),
  distanceMeters: z.number().nullable(),
  elevationMeters: z.number().nullable(),
  averageHeartRate: z.number().int().nullable(),
  maxHeartRate: z.number().int().nullable(),
  averagePaceSecondsPerKm: z.number().int().nullable(),
  sufferScore: z.number().int().nullable(),
  perceivedExertion: z.number().int().min(1).max(10).nullable(),
  calories: z.number().int().nullable(),
  rawData: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
})
export type Activity = z.infer<typeof ActivitySchema>

export const ActivityListParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sport: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
export type ActivityListParams = z.infer<typeof ActivityListParamsSchema>

// ─── Training Load ────────────────────────────────────────────────────────────

export const TrainingLoadSchema = z.object({
  atl: z.number(),
  ctl: z.number(),
  tsb: z.number(),
})
export type TrainingLoad = z.infer<typeof TrainingLoadSchema>

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.coerce.date(),
})
export type User = z.infer<typeof UserSchema>

export const SetupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})
export type SetupBody = z.infer<typeof SetupBodySchema>

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
})
export type LoginBody = z.infer<typeof LoginBodySchema>

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const ChatRoleSchema = z.enum(["user", "assistant"])
export type ChatRole = z.infer<typeof ChatRoleSchema>

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  role: ChatRoleSchema,
  content: z.string(),
  tokensUsed: z.number().int().nullable(),
  createdAt: z.coerce.date(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatBodySchema = z.object({
  message: z.string().min(1).max(4000),
})
export type ChatBody = z.infer<typeof ChatBodySchema>

// ─── Weekly Report ────────────────────────────────────────────────────────────

export const WeeklyMetricsSchema = z.object({
  totalDistance: z.number(),
  totalDuration: z.number(),
  avgHR: z.number().nullable(),
  sessions: z.number().int(),
  atl: z.number(),
  ctl: z.number(),
})
export type WeeklyMetrics = z.infer<typeof WeeklyMetricsSchema>

export const WeeklyReportSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  weekStart: z.string(),
  summary: z.string(),
  metrics: WeeklyMetricsSchema,
  generatedAt: z.coerce.date(),
})
export type WeeklyReport = z.infer<typeof WeeklyReportSchema>

// ─── Settings ─────────────────────────────────────────────────────────────────

export const ApiKeyBodySchema = z.object({
  provider: z.string(),
  key: z.string().min(1),
})
export type ApiKeyBody = z.infer<typeof ApiKeyBodySchema>

// ─── Strava ───────────────────────────────────────────────────────────────────

export const StravaStatusSchema = z.object({
  connected: z.boolean(),
  athleteId: z.number().nullable(),
  lastSynced: z.coerce.date().nullable(),
})
export type StravaStatus = z.infer<typeof StravaStatusSchema>

export const StravaSyncResultSchema = z.object({
  synced: z.number().int(),
})
export type StravaSyncResult = z.infer<typeof StravaSyncResultSchema>

// ─── API Responses ────────────────────────────────────────────────────────────

export const PaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
