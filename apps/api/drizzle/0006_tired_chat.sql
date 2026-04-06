CREATE TABLE "garmin_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_username" text NOT NULL,
	"encrypted_password" text NOT NULL,
	"last_synced" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "garmin_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "vo2max" real;--> statement-breakpoint
ALTER TABLE "garmin_credentials" ADD CONSTRAINT "garmin_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;