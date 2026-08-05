CREATE TABLE "visitors" (
  "id" uuid PRIMARY KEY NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_metrics" (
  "key" varchar(50) PRIMARY KEY NOT NULL,
  "value" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO "site_metrics" ("key", "value")
VALUES ('unique_visitors', 0);
