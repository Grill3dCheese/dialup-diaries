import { pool } from "../db/client.js";

export type FeedPost = {
  id: string;
  content: string;
  createdAt: Date;
  eventAt: Date;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorIsOnline: boolean;
  reposterUsername: string | null;
  reposterDisplayName: string | null;
  likeCount: number;
  repostCount: number;
  commentCount: number;
  likedByViewer: boolean;
  repostedByViewer: boolean;
};

type FeedRow = {
  id: string;
  content: string;
  created_at: Date;
  event_at: Date;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_is_online: boolean;
  reposter_username: string | null;
  reposter_display_name: string | null;
  like_count: string;
  repost_count: string;
  comment_count: string;
  liked_by_viewer: boolean;
  reposted_by_viewer: boolean;
};

function mapFeedRow(row: FeedRow): FeedPost {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    eventAt: row.event_at,
    authorId: row.author_id,
    authorUsername: row.author_username,
    authorDisplayName: row.author_display_name,
    authorIsOnline: row.author_is_online,
    reposterUsername: row.reposter_username,
    reposterDisplayName: row.reposter_display_name,
    likeCount: Number(row.like_count),
    repostCount: Number(row.repost_count),
    commentCount: Number(row.comment_count),
    likedByViewer: row.liked_by_viewer,
    repostedByViewer: row.reposted_by_viewer,
  };
}

const postProjection = `
  p.id,
  p.content,
  p.created_at,
  events.event_at,
  author.id AS author_id,
  author.username AS author_username,
  author.display_name AS author_display_name,
  author.last_seen_at >= now() - interval '5 minutes' AS author_is_online,
  reposter.username AS reposter_username,
  reposter.display_name AS reposter_display_name,
  (SELECT count(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
  (SELECT count(*) FROM reposts r WHERE r.post_id = p.id) AS repost_count,
  (SELECT count(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_viewer,
  EXISTS(SELECT 1 FROM reposts r WHERE r.post_id = p.id AND r.user_id = $1) AS reposted_by_viewer
`;

export async function getTimeline(viewerId: string | null, limit = 30) {
  const result = await pool.query<FeedRow>(
    `WITH events AS (
      SELECT p.id AS post_id, p.created_at AS event_at, NULL::uuid AS reposter_id
      FROM posts p
      UNION ALL
      SELECT r.post_id, r.created_at AS event_at, r.user_id AS reposter_id
      FROM reposts r
    )
    SELECT ${postProjection}
    FROM events
    JOIN posts p ON p.id = events.post_id
    JOIN users author ON author.id = p.author_id
    LEFT JOIN users reposter ON reposter.id = events.reposter_id
    ORDER BY events.event_at DESC
    LIMIT $2`,
    [viewerId, limit],
  );

  return result.rows.map(mapFeedRow);
}

export async function getPost(postId: string, viewerId: string | null) {
  const result = await pool.query<FeedRow>(
    `WITH events AS (
      SELECT p.id AS post_id, p.created_at AS event_at, NULL::uuid AS reposter_id
      FROM posts p WHERE p.id = $2
    )
    SELECT ${postProjection}
    FROM events
    JOIN posts p ON p.id = events.post_id
    JOIN users author ON author.id = p.author_id
    LEFT JOIN users reposter ON reposter.id = events.reposter_id`,
    [viewerId, postId],
  );

  const row = result.rows[0];
  return row ? mapFeedRow(row) : null;
}

export async function createPost(authorId: string, content: string) {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO posts (author_id, content) VALUES ($1, $2) RETURNING id",
    [authorId, content],
  );
  return result.rows[0]?.id;
}

export async function deletePost(postId: string, authorId: string) {
  const result = await pool.query("DELETE FROM posts WHERE id = $1 AND author_id = $2", [
    postId,
    authorId,
  ]);
  return result.rowCount === 1;
}

export async function toggleReaction(
  kind: "likes" | "reposts",
  postId: string,
  userId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query(
      `DELETE FROM ${kind} WHERE post_id = $1 AND user_id = $2 RETURNING post_id`,
      [postId, userId],
    );
    const active = removed.rowCount === 0;
    if (active) {
      await client.query(
        `INSERT INTO ${kind} (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [postId, userId],
      );
    }
    const countResult = await client.query<{ count: string }>(
      `SELECT count(*) FROM ${kind} WHERE post_id = $1`,
      [postId],
    );
    await client.query("COMMIT");
    return { active, count: Number(countResult.rows[0]?.count ?? 0) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createComment(postId: string, authorId: string, body: string) {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO comments (post_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [postId, authorId, body],
  );
  return result.rows[0]?.id;
}

export async function getComments(postId: string) {
  const result = await pool.query<{
    id: string;
    body: string;
    created_at: Date;
    username: string;
    display_name: string;
    is_online: boolean;
  }>(
    `SELECT
       c.id,
       c.body,
       c.created_at,
       u.username,
       u.display_name,
       u.last_seen_at >= now() - interval '5 minutes' AS is_online
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    username: row.username,
    displayName: row.display_name,
    isOnline: row.is_online,
  }));
}

export async function getProfile(username: string, viewerId: string | null) {
  const userResult = await pool.query<{
    id: string;
    username: string;
    display_name: string;
    bio: string;
    created_at: Date;
    is_online: boolean;
  }>(
    `SELECT
       id,
       username,
       display_name,
       bio,
       created_at,
       last_seen_at >= now() - interval '5 minutes' AS is_online
     FROM users WHERE username = lower($1)`,
    [username],
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const postResult = await pool.query<FeedRow>(
    `WITH events AS (
      SELECT p.id AS post_id, p.created_at AS event_at, NULL::uuid AS reposter_id
      FROM posts p WHERE p.author_id = $2
    )
    SELECT ${postProjection}
    FROM events
    JOIN posts p ON p.id = events.post_id
    JOIN users author ON author.id = p.author_id
    LEFT JOIN users reposter ON reposter.id = events.reposter_id
    ORDER BY events.event_at DESC
    LIMIT 50`,
    [viewerId, user.id],
  );

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      bio: user.bio,
      createdAt: user.created_at,
      isOnline: user.is_online,
    },
    posts: postResult.rows.map(mapFeedRow),
  };
}

export async function updateProfile(
  userId: string,
  input: { displayName: string; bio: string },
) {
  await pool.query("UPDATE users SET display_name = $1, bio = $2 WHERE id = $3", [
    input.displayName,
    input.bio,
    userId,
  ]);
}
