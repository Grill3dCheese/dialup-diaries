CREATE TYPE "public"."browser_platform" AS ENUM('chrome', 'firefox', 'safari', 'edge', 'other');
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" varchar(256) NOT NULL,
	"auth" varchar(128) NOT NULL,
	"platform" "browser_platform" DEFAULT 'other' NOT NULL,
	"user_agent" text,
	"ip_address" inet,
	"is_active" boolean DEFAULT true NOT NULL,
	"failures_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	CONSTRAINT "unique_endpoint" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_push_subs_user_id" ON "push_subscriptions" USING btree ("user_id") WHERE "push_subscriptions"."is_active" = TRUE;
--> statement-breakpoint
CREATE INDEX "idx_push_subs_active_delivery" ON "push_subscriptions" USING btree ("is_active") INCLUDE ("endpoint", "p256dh", "auth");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION update_push_subscriptions_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER update_push_subscriptions_modtime_trigger
    BEFORE UPDATE ON "push_subscriptions"
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscriptions_modtime();
