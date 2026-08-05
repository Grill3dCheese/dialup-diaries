import { randomUUID } from "node:crypto";
import { parseCookie } from "cookie";
import type { Request, Response } from "express";
import { env, isProduction } from "../config/env.js";
import { pool } from "../db/client.js";
import { createVisitorToken, readVisitorId } from "../utils/visitor-token.js";

const visitorCookieName = "dialup.visitor";
const visitorCookieLifetimeMs = 1000 * 60 * 60 * 24 * 365;

export async function getUniqueVisitorCount(req: Request, res: Response) {
  const cookies = parseCookie(req.get("cookie") ?? "");
  const visitorId = readVisitorId(cookies[visitorCookieName], env.SESSION_SECRET);

  if (visitorId) {
    const state = await readVisitorState(visitorId);
    return state.registered ? state.count : registerVisitor(visitorId);
  }

  const newVisitorId = randomUUID();
  const count = await registerVisitor(newVisitorId);
  res.cookie(visitorCookieName, createVisitorToken(newVisitorId, env.SESSION_SECRET), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: visitorCookieLifetimeMs,
    path: "/",
  });
  return count;
}

async function readVisitorState(visitorId: string) {
  const result = await pool.query<{ value: string; registered: boolean }>(
    `SELECT
       value,
       EXISTS(SELECT 1 FROM visitors WHERE id = $1) AS registered
     FROM site_metrics
     WHERE key = 'unique_visitors'`,
    [visitorId],
  );
  return {
    count: Number(result.rows[0]?.value ?? 0),
    registered: result.rows[0]?.registered ?? false,
  };
}

async function registerVisitor(visitorId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO site_metrics (key, value)
       VALUES ('unique_visitors', 0)
       ON CONFLICT (key) DO NOTHING`,
    );
    const inserted = await client.query(
      `INSERT INTO visitors (id)
       VALUES ($1)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [visitorId],
    );
    const result =
      inserted.rowCount === 1
        ? await client.query<{ value: string }>(
            `UPDATE site_metrics
             SET value = value + 1
             WHERE key = 'unique_visitors'
             RETURNING value`,
          )
        : await client.query<{ value: string }>(
            "SELECT value FROM site_metrics WHERE key = 'unique_visitors'",
          );
    await client.query("COMMIT");
    return Number(result.rows[0]?.value ?? 0);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
