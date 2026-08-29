ALTER TABLE "posts" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "repost_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "posts" SET
  "like_count" = (SELECT count(*)::int FROM "likes" WHERE "likes"."post_id" = "posts"."id"),
  "repost_count" = (SELECT count(*)::int FROM "reposts" WHERE "reposts"."post_id" = "posts"."id"),
  "comment_count" = (SELECT count(*)::int FROM "comments" WHERE "comments"."post_id" = "posts"."id");
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_like_count_nonnegative" CHECK ("like_count" >= 0);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_repost_count_nonnegative" CHECK ("repost_count" >= 0);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_comment_count_nonnegative" CHECK ("comment_count" >= 0);
