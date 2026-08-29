import {
  bigint,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 24 }).notNull(),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    bio: varchar("bio", { length: 280 }).notNull().default("Still customizing my corner of the web."),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_username_lower_idx").on(table.username),
    check("users_username_lowercase_check", sql`${table.username} = lower(${table.username})`),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: varchar("content", { length: 5000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("posts_created_at_idx").on(table.createdAt), index("posts_author_id_idx").on(table.authorId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 1000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("comments_post_id_created_at_idx").on(table.postId, table.createdAt)],
);

export const likes = pgTable(
  "likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("likes_user_id_idx").on(table.userId),
  ],
);

export const reposts = pgTable(
  "reposts",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("reposts_user_id_idx").on(table.userId),
  ],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").$type<Record<string, unknown>>().notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("user_sessions_expire_idx").on(table.expire)],
);

export const visitors = pgTable("visitors", {
  id: uuid("id").primaryKey(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const siteMetrics = pgTable("site_metrics", {
  key: varchar("key", { length: 50 }).primaryKey(),
  value: bigint("value", { mode: "number" }).notNull().default(0),
});

export type StoredChangelogGroup = {
  kind: "added" | "changed" | "fixed" | "security";
  label: string;
  items: string[];
};

export const changelogReleases = pgTable(
  "changelog_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: varchar("version", { length: 32 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    releasedOn: date("released_on", { mode: "string" }).notNull(),
    summary: varchar("summary", { length: 600 }).notNull(),
    groups: jsonb("groups").$type<StoredChangelogGroup[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("changelog_releases_version_idx").on(table.version),
    check(
      "changelog_releases_version_semver_check",
      sql`${table.version} ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'`,
    ),
  ],
);

export const browserPlatformEnum = pgEnum("browser_platform", [
  "chrome",
  "firefox",
  "safari",
  "edge",
  "other",
]);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: varchar("p256dh", { length: 256 }).notNull(),
    auth: varchar("auth", { length: 128 }).notNull(),
    platform: browserPlatformEnum("platform").notNull().default("other"),
    userAgent: text("user_agent"),
    ipAddress: inet("ip_address"),
    isActive: boolean("is_active").notNull().default(true),
    failuresCount: smallint("failures_count").notNull().default(0),
    missedNotificationsCount: integer("missed_notifications_count")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  },
  (table) => [
    unique("unique_endpoint").on(table.endpoint),
    index("idx_push_subs_user_id")
      .on(table.userId)
      .where(sql`${table.isActive} = TRUE`),
    index("idx_push_subs_active_delivery").on(table.isActive),
    check(
      "push_subscriptions_missed_notifications_count_check",
      sql`${table.missedNotificationsCount} >= 0`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type BrowserPlatform = (typeof browserPlatformEnum.enumValues)[number];
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
