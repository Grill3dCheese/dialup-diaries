import pino from "pino";
import webPush from "web-push";
import type {
  PushSubscription as WebPushSubscription,
  RequestOptions,
} from "web-push";
import { z } from "zod";
import { isProduction, vapidConfig, type VapidConfig } from "../config/env.js";
import { isAllowedPushEndpoint } from "../utils/push-endpoints.js";
import {
  pushSubscriptionRepository,
  type PushSubscriptionBadgeRow,
  type PushSubscriptionRow,
} from "./push-subscriptions.js";

const blogIdSchema = z.uuid();
const deliveryBatchSize = 100;
const deliveryTtlSeconds = 60 * 60 * 12;
const deliveryTimeoutMs = 10_000;
const titleMaxLength = 120;

const logger = pino({
  name: "web-push",
  level: isProduction ? "info" : "debug",
});

export type PushDeliveryTarget = Pick<
  PushSubscriptionRow,
  "id" | "endpoint" | "p256dh" | "auth" | "missedNotificationsCount"
>;

export type PushFanoutRepository = {
  incrementAllActiveBadges: () => Promise<readonly PushSubscriptionBadgeRow[]>;
  getActiveSubscriptionsBatch: (
    batchSize: number,
    cursor?: string,
  ) => Promise<PushDeliveryTarget[]>;
  deactivateSubscription: (endpoint: string) => Promise<void>;
  incrementFailureCount: (endpoint: string) => Promise<void>;
};

export type SendPushNotification = (
  subscription: WebPushSubscription,
  payload?: string | Buffer | null,
  options?: RequestOptions,
) => Promise<unknown>;

export type PushNotificationServiceOptions = {
  repository?: PushFanoutRepository;
  sendNotification?: SendPushNotification;
  vapid?: VapidConfig | null;
  batchSize?: number;
};

export class PushNotificationService {
  private readonly repository: PushFanoutRepository;
  private readonly sendNotification: SendPushNotification;
  private readonly vapid: VapidConfig | null;
  private readonly batchSize: number;

  constructor(options: PushNotificationServiceOptions = {}) {
    this.repository = options.repository ?? pushSubscriptionRepository;
    this.sendNotification =
      options.sendNotification ?? webPush.sendNotification;
    this.vapid = options.vapid === undefined ? vapidConfig : options.vapid;
    this.batchSize = options.batchSize ?? deliveryBatchSize;

    if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
      throw new TypeError("batchSize must be a positive integer.");
    }

    if (this.vapid && options.sendNotification === undefined) {
      webPush.setVapidDetails(
        this.vapid.subject,
        this.vapid.publicKey,
        this.vapid.privateKey,
      );
    }
  }

  async sendNewBlogNotification(
    blogTitle: string,
    blogId: string,
  ): Promise<void> {
    if (!this.vapid) {
      logger.debug("Skipping web-push fanout because VAPID is not configured");
      return;
    }

    const parsedId = blogIdSchema.safeParse(blogId);
    if (!parsedId.success) {
      throw new TypeError("blogId must be a UUID.");
    }

    const badgeRows = await this.repository.incrementAllActiveBadges();
    const badgeBySubscriptionId = new Map<string, number>(
      badgeRows.map((row): readonly [string, number] => [
        row.id,
        row.missedNotificationsCount,
      ]),
    );

    const title = "New on Dialup Diaries";
    const body = sanitizeNotificationText(blogTitle);
    const requestOptions = this.deliveryOptions();

    for await (const batch of this.activeSubscriptionBatches()) {
      await Promise.all(
        batch.map((subscription) =>
          this.deliver(
            subscription,
            serializePushPayload({
              title,
              body,
              blogId: parsedId.data,
              url: `/posts/${parsedId.data}`,
              badge:
                badgeBySubscriptionId.get(subscription.id) ??
                subscription.missedNotificationsCount,
            }),
            requestOptions,
          ),
        ),
      );
    }
  }

  private deliveryOptions(): RequestOptions {
    const options: RequestOptions = {
      TTL: deliveryTtlSeconds,
      timeout: deliveryTimeoutMs,
      urgency: "normal",
      contentEncoding: "aes128gcm",
    };

    if (this.vapid) {
      options.vapidDetails = {
        subject: this.vapid.subject,
        publicKey: this.vapid.publicKey,
        privateKey: this.vapid.privateKey,
      };
    }

    return options;
  }

  private async *activeSubscriptionBatches(): AsyncGenerator<
    PushDeliveryTarget[]
  > {
    let cursor: string | undefined;

    for (;;) {
      const batch =
        cursor === undefined
          ? await this.repository.getActiveSubscriptionsBatch(this.batchSize)
          : await this.repository.getActiveSubscriptionsBatch(
              this.batchSize,
              cursor,
            );

      if (batch.length === 0) {
        return;
      }

      yield batch;

      const last = batch.at(-1);
      if (!last || batch.length < this.batchSize) {
        return;
      }

      cursor = last.id;
    }
  }

  private async deliver(
    subscription: PushDeliveryTarget,
    payload: string,
    options: RequestOptions,
  ): Promise<void> {
    if (!isAllowedPushEndpoint(subscription.endpoint)) {
      logger.warn(
        { subscriptionId: subscription.id },
        "Deactivating stored push endpoint outside the allowlist",
      );
      await this.safeDeactivate(subscription.endpoint);
      return;
    }

    try {
      await this.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
        options,
      );
    } catch (error) {
      await this.handleDeliveryFailure(subscription, error);
    }
  }

  private async handleDeliveryFailure(
    subscription: PushDeliveryTarget,
    error: unknown,
  ): Promise<void> {
    const statusCode = readPushStatusCode(error);

    logger.warn(
      {
        subscriptionId: subscription.id,
        statusCode,
        err: errorWithoutSecrets(error),
      },
      "Web push delivery failed",
    );

    try {
      if (statusCode === 404 || statusCode === 410) {
        await this.repository.deactivateSubscription(subscription.endpoint);
        return;
      }

      if (statusCode === 400) {
        await this.repository.incrementFailureCount(subscription.endpoint);
      }
    } catch (cleanupError) {
      logger.error(
        { subscriptionId: subscription.id, err: cleanupError },
        "Failed to update push subscription after delivery error",
      );
    }
  }

  private async safeDeactivate(endpoint: string): Promise<void> {
    try {
      await this.repository.deactivateSubscription(endpoint);
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to deactivate a rejected push subscription",
      );
    }
  }
}

export const pushNotificationService = new PushNotificationService();

export type PushNotificationPayload = {
  title: string;
  body: string;
  blogId: string;
  url: string;
  badge: number;
};

export function serializePushPayload(payload: PushNotificationPayload) {
  const title = payload.title;
  const body = payload.body;
  const badge = normalizeBadgeCount(payload.badge);

  return JSON.stringify({
    notification: {
      title,
      body,
    },
    title,
    body,
    blogId: payload.blogId,
    url: payload.url,
    badge,
  });
}

export function normalizeBadgeCount(value: number) {
  if (!Number.isInteger(value) || value < 0) return 0;
  return value;
}

export function sanitizeNotificationText(value: string) {
  let compact = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    compact += code < 32 || code === 127 ? " " : char;
  }
  compact = compact.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return "A new diary entry just dropped.";
  if (compact.length <= titleMaxLength) return compact;
  return `${compact.slice(0, titleMaxLength - 3).trimEnd()}...`;
}

function readPushStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

function errorWithoutSecrets(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { err: error };
  }

  return {
    name: "name" in error ? error.name : undefined,
    message: "message" in error ? error.message : undefined,
    statusCode: "statusCode" in error ? error.statusCode : undefined,
  };
}
