ALTER TABLE "users"
ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "changelog_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(32) NOT NULL,
	"title" varchar(120) NOT NULL,
	"released_on" date NOT NULL,
	"summary" varchar(600) NOT NULL,
	"groups" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changelog_releases_version_semver_check" CHECK ("version" ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_releases_version_idx" ON "changelog_releases" USING btree ("version");
