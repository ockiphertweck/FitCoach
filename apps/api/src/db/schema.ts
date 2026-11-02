import {
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

export const garminSync = pgTable("garmin_sync", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("idle"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastError: text("last_error"),
  keyExpiresAt: timestamp("key_expires_at"),
  importedAt: timestamp("imported_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const dailyWellness = pgTable(
  "daily_wellness",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    sleepScore: integer("sleep_score"),
    sleepSeconds: integer("sleep_seconds"),
    deepSleepSeconds: integer("deep_sleep_seconds"),
    remSleepSeconds: integer("rem_sleep_seconds"),
    lightSleepSeconds: integer("light_sleep_seconds"),
    awakeSeconds: integer("awake_seconds"),
    sleepStart: timestamp("sleep_start"),
    sleepEnd: timestamp("sleep_end"),
    hrvLastNight: integer("hrv_last_night"),
    hrvWeeklyAvg: integer("hrv_weekly_avg"),
    hrvStatus: text("hrv_status"),
    bodyBatteryCharged: integer("body_battery_charged"),
    bodyBatteryAtWake: integer("body_battery_at_wake"),
    bodyBatteryCurrent: integer("body_battery_current"),
    stressAvg: integer("stress_avg"),
    restingHeartRate: integer("resting_heart_rate"),
    caloriesTotal: integer("calories_total"),
    caloriesActive: integer("calories_active"),
    caloriesResting: integer("calories_resting"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.date)]
)

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    externalId: text("external_id").notNull(),
    source: text("source").notNull().default("garmin"),
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
    streamData: jsonb("stream_data"),
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
  vo2max: real("vo2max"),
  goals: text("goals"),
  preferences: text("preferences"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull().default("New chat"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const chatHistory = pgTable("chat_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }),
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

export const dailyRecommendations = pgTable(
  "daily_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    inputHash: text("input_hash").notNull(),
    content: text("content").notNull(),
    tokensUsed: integer("tokens_used"),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.date)]
)

export type UserProfile = typeof userProfiles.$inferSelect
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type ApiKey = typeof apiKeys.$inferSelect
export type GarminSync = typeof garminSync.$inferSelect
export type DailyWellness = typeof dailyWellness.$inferSelect
export type NewDailyWellness = typeof dailyWellness.$inferInsert
export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
export type ChatSession = typeof chatSessions.$inferSelect
export type ChatHistoryEntry = typeof chatHistory.$inferSelect
export type WeeklyReport = typeof weeklyReports.$inferSelect
export type DailyRecommendation = typeof dailyRecommendations.$inferSelect
