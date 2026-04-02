import {
  bigint,
  date,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: text("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.provider)]
)

export const stravaTokens = pgTable(
  "strava_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    athleteId: bigint("athlete_id", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId)]
)

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    externalId: text("external_id").notNull(),
    source: text("source").notNull().default("strava"),
    name: text("name"),
    sportType: text("sport_type").notNull(),
    startDate: timestamp("start_date").notNull(),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: real("distance_meters"),
    elevationMeters: real("elevation_meters"),
    averageHeartRate: integer("average_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    averagePaceSecondsPerKm: integer("average_pace_seconds_per_km"),
    sufferScore: integer("suffer_score"),
    perceivedExertion: integer("perceived_exertion"),
    calories: integer("calories"),
    rawData: jsonb("raw_data"),
    rawDataHash: text("raw_data_hash"),
    aiInsight: text("ai_insight"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.externalId, table.source)]
)

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  sex: text("sex"),
  weightKg: real("weight_kg"),
  heightCm: real("height_cm"),
  maxHeartRate: integer("max_heart_rate"),
  ftpWatts: integer("ftp_watts"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const chatHistory = pgTable("chat_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    weekStart: date("week_start").notNull(),
    summary: text("summary").notNull(),
    metrics: jsonb("metrics").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.weekStart)]
)

export type UserProfile = typeof userProfiles.$inferSelect
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type ApiKey = typeof apiKeys.$inferSelect
export type StravaToken = typeof stravaTokens.$inferSelect
export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
export type ChatHistoryEntry = typeof chatHistory.$inferSelect
export type WeeklyReport = typeof weeklyReports.$inferSelect
