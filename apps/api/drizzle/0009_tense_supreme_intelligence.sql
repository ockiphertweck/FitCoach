CREATE TABLE "daily_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"input_hash" text NOT NULL,
	"content" text NOT NULL,
	"tokens_used" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_recommendations_user_id_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "daily_recommendations" ADD CONSTRAINT "daily_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;