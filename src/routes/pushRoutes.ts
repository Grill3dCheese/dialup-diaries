import { isIP } from "node:net";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { pushSubscriptionRepository } from "../services/push-subscriptions.js";
import {
  firstError,
  parsePushReadBody,
  parsePushSubscribeBody,
  parsePushUnsubscribeBody,
} from "../utils/validation.js";

export const pushRouter = Router();

const userAgentMaxLength = 512;

const pushLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many notification requests. Take a short break and try again.",
  },
});

pushRouter.post(
  "/api/notifications/subscribe",
  pushLimiter,
  async (req, res) => {
    const parsed = parsePushSubscribeBody(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: firstError(parsed.error) });
    }

    await pushSubscriptionRepository.saveSubscription(
      req.currentUser?.id ?? null,
      {
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
      },
      {
        platform: parsed.data.platform,
        userAgent: requestUserAgent(req),
        ipAddress: requestIp(req),
      },
    );

    return res.status(200).json({ ok: true });
  },
);

pushRouter.post(
  "/api/notifications/unsubscribe",
  pushLimiter,
  async (req, res) => {
    const parsed = parsePushUnsubscribeBody(req.body);
    if (!parsed.success) {
      return res.status(422).json({ error: firstError(parsed.error) });
    }

    await pushSubscriptionRepository.deactivateSubscription(
      parsed.data.endpoint,
    );
    return res.status(200).json({ ok: true });
  },
);

pushRouter.post("/api/notifications/read", pushLimiter, async (req, res) => {
  const parsed = parsePushReadBody(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: firstError(parsed.error) });
  }

  const endpoint = parsed.data.endpoint;
  const userId = req.currentUser?.id ?? null;

  if (!userId && !endpoint) {
    return res.status(422).json({
      error: "Include this device's push endpoint to clear its badge.",
    });
  }

  if (userId) {
    await pushSubscriptionRepository.clearBadgeForUser(userId);
  }
  if (endpoint) {
    await pushSubscriptionRepository.clearBadgeForEndpoint(endpoint);
  }
  return res.status(200).json({ ok: true });
});

function requestUserAgent(req: Request) {
  const header = req.get("user-agent")?.trim();
  if (!header) return null;
  return header.slice(0, userAgentMaxLength);
}

function requestIp(req: Request) {
  const raw = req.ip?.trim();
  if (!raw) return null;
  const ip = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  return isIP(ip) === 0 ? null : ip;
}
