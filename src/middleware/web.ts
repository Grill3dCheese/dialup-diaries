import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { findSafeUserById, touchUserPresence } from "../services/auth.js";

const presenceTouchIntervalMs = 60_000;

export async function webLocals(req: Request, res: Response, next: NextFunction) {
  req.currentUser = req.session.userId ? await findSafeUserById(req.session.userId) : null;
  if (req.session.userId && !req.currentUser) {
    delete req.session.userId;
  }
  const now = Date.now();
  if (
    req.currentUser &&
    (!req.session.presenceTouchedAt ||
      now - req.session.presenceTouchedAt >= presenceTouchIntervalMs)
  ) {
    await touchUserPresence(req.currentUser.id);
    req.currentUser.lastSeenAt = new Date(now);
    req.session.presenceTouchedAt = now;
  }

  req.session.csrfToken ??= randomBytes(32).toString("base64url");
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.currentUser = req.currentUser;
  res.locals.path = req.path;
  res.locals.flash = req.session.flash ?? null;
  delete req.session.flash;
  res.locals.year = new Date().getFullYear();
  res.locals.initials = (name: string) =>
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  res.locals.formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  next();
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const supplied =
    req.get("x-csrf-token") ??
    (typeof req.body === "object" && req.body !== null && "_csrf" in req.body
      ? String((req.body as Record<string, unknown>)._csrf)
      : "");
  const expected = req.session.csrfToken ?? "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  if (
    suppliedBuffer.length === expectedBuffer.length &&
    suppliedBuffer.length > 0 &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    next();
    return;
  }

  if (req.accepts(["html", "json"]) === "json") {
    res.status(403).json({ error: "Your session expired. Refresh and try again." });
    return;
  }
  res.status(403).render("errors/error", {
    title: "Session expired",
    status: 403,
    message: "Refresh this page and try that again.",
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.currentUser) {
    next();
    return;
  }
  if (req.accepts(["html", "json"]) === "json") {
    res.status(401).json({ error: "Sign in to do that." });
    return;
  }
  req.session.flash = { kind: "error", message: "Sign in to do that." };
  res.redirect(303, "/login");
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    requireAuth(req, res, next);
    return;
  }
  if (req.currentUser.isAdmin) {
    next();
    return;
  }
  res.status(403).render("errors/error", {
    title: "Not allowed",
    status: 403,
    message: "Only the webmaster can edit the archives.",
  });
}
