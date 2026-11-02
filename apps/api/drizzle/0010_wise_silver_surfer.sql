CREATE TABLE "daily_wellness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sleep_score" integer,
	"sleep_seconds" integer,
	"deep_sleep_seconds" integer,
	"rem_sleep_seconds" integer,
	"light_sleep_seconds" integer,
	"awake_seconds" integer,
	"sleep_start" timestamp,
	"sleep_end" timestamp,
	"hrv_last_night" integer,
	"hrv_weekly_avg" integer,
	"hrv_status" text,
	"body_battery_charged" integer,
	"body_battery_at_wake" integer,
	"body_battery_current" integer,
	"stress_avg" integer,
	"resting_heart_rate" integer,
	"calories_total" integer,
	"calories_active" integer,
	"calories_resting" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_wellness_user_id_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "garmin_sync" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_synced_at" timestamp,
	"last_error" text,
	"key_expires_at" timestamp,
	"imported_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "strava_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "strava_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "source" SET DEFAULT 'garmin';--> statement-breakpoint
ALTER TABLE "daily_wellness" ADD CONSTRAINT "daily_wellness_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garmin_sync" ADD CONSTRAINT "garmin_sync_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;