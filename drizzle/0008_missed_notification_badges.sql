ALTER TABLE "push_subscriptions" ADD COLUMN "missed_notifications_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_missed_notifications_count_check" CHECK ("missed_notifications_count" >= 0);
