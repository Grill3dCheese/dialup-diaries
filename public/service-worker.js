/* Dialup Diaries web-push service worker. Keep this file unbundled and defensive. */
"use strict";

const DEFAULT_TITLE = "New on Dialup Diaries";
const DEFAULT_BODY = "A new diary entry just dropped.";
const NOTIFICATION_ICON = "/art/skull-white.webp";
const POST_PATH =
  /^\/posts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let badgeCount = 1;
  try {
    const data = event.data.json();
    if (data && data.badge) {
      badgeCount = parseInt(data.badge, 10);
    }
  } catch (_error) {
    // Corrupted JSON: keep the fallback badge and continue to the banner.
  }

  if (!Number.isInteger(badgeCount) || badgeCount < 1) {
    badgeCount = 1;
  } else if (badgeCount > 9999) {
    badgeCount = 9999;
  }

  try {
    if (self.navigator && "setAppBadge" in self.navigator) {
      event.waitUntil(
        self.navigator.setAppBadge(badgeCount).catch((err) => {
          console.error("Badge block error:", err);
        }),
      );
    }
  } catch (err) {
    console.error("Badge block error:", err);
  }

  event.waitUntil(handlePush(event, badgeCount));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openBlogFromNotification(event.notification));
});

async function handlePush(event, badgeCount) {
  const payload = parsePushPayload(event);
  const title = clipText(payload.title, 120) || DEFAULT_TITLE;
  const body = clipText(payload.body, 180) || DEFAULT_BODY;
  const blogId = asUuid(payload.blogId);
  const url = resolvePostUrl(payload.url, blogId);
  const resolvedBadge =
    Number.isInteger(badgeCount) && badgeCount > 0
      ? Math.min(badgeCount, 9999)
      : payload.badgeCount;

  try {
    await self.registration.showNotification(title, {
      body,
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      lang: "en",
      tag: blogId ? `blog-${blogId}` : "blog-new",
      renotify: Boolean(blogId),
      timestamp: Date.now(),
      data: {
        url,
        blogId,
        badgeCount: resolvedBadge,
        receivedAt: Date.now(),
        source: "dialup-diaries-push",
      },
    });
  } catch {
    // A failed banner is better than an unhandled rejection that kills the worker.
  }
}

function parsePushPayload(event) {
  const empty = {
    title: DEFAULT_TITLE,
    body: DEFAULT_BODY,
    url: "/",
    blogId: null,
    badgeCount: 1,
  };
  if (!event || !event.data) return empty;

  let parsed = readPushJson(event.data);
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return empty;
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return empty;
  }

  const nested =
    parsed.notification !== null &&
    typeof parsed.notification === "object" &&
    !Array.isArray(parsed.notification)
      ? parsed.notification
      : null;

  return {
    title: asText(
      nested ? (nested.title ?? parsed.title) : parsed.title,
      DEFAULT_TITLE,
    ),
    body: asText(
      nested ? (nested.body ?? parsed.body) : parsed.body,
      DEFAULT_BODY,
    ),
    url: asText(parsed.url, ""),
    blogId: asUuid(parsed.blogId),
    badgeCount: asBadgeCount(parsed.badge ?? parsed.badgeCount),
  };
}

function readPushJson(data) {
  try {
    return data.json();
  } catch {
    try {
      return JSON.parse(data.text());
    } catch {
      return null;
    }
  }
}

function resolvePostUrl(rawUrl, blogId) {
  const origin = self.location.origin;
  const fromId = blogId ? `/posts/${blogId}` : "/";
  if (
    typeof rawUrl !== "string" ||
    rawUrl.length === 0 ||
    rawUrl.length > 2048
  ) {
    return fromId;
  }

  let resolved;
  try {
    resolved = new URL(rawUrl, origin);
  } catch {
    return fromId;
  }

  if (resolved.origin !== origin) return fromId;
  if (resolved.username !== "" || resolved.password !== "") return fromId;
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:")
    return fromId;
  if (!POST_PATH.test(resolved.pathname)) return fromId;
  return resolved.pathname;
}

async function openBlogFromNotification(notification) {
  await applyAppBadge(0);
  const data =
    notification &&
    typeof notification.data === "object" &&
    notification.data !== null
      ? notification.data
      : {};
  const target = new URL(
    resolvePostUrl(data.url, asUuid(data.blogId)),
    self.location.origin,
  );

  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of windows) {
    let clientUrl;
    try {
      clientUrl = new URL(client.url);
    } catch {
      continue;
    }
    if (clientUrl.origin !== self.location.origin) continue;

    if ("focus" in client) {
      try {
        await client.focus();
      } catch {
        // Keep walking the client list if this window cannot take focus.
      }
    }
    if ("navigate" in client) {
      try {
        await client.navigate(target.href);
        return;
      } catch {
        // Fall through to openWindow when navigate is refused.
      }
    }
  }

  if (self.clients.openWindow) {
    await self.clients.openWindow(target.href);
  }
}

function asUuid(value) {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function asBadgeCount(value) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, 9999);
}

async function applyAppBadge(count) {
  const navigatorRef = self.navigator;
  if (!navigatorRef) return;

  try {
    if (count > 0 && typeof navigatorRef.setAppBadge === "function") {
      await navigatorRef.setAppBadge(count);
      return;
    }
    if (typeof navigatorRef.clearAppBadge === "function") {
      await navigatorRef.clearAppBadge();
    }
  } catch {
    // Badging is optional; the notification banner is the fallback.
  }
}

function asText(value, fallback) {
  if (typeof value !== "string") return fallback;
  return clipText(value, 240) || fallback;
}

function clipText(value, maxLength) {
  if (typeof value !== "string") return "";
  let compact = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    compact += code < 32 || code === 127 ? " " : char;
  }
  compact = compact.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}
