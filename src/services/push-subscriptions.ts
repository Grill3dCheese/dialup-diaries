import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  pushSubscriptions,
  type BrowserPlatform,
  type PushSubscription,
} from "../db/schema.js";

export type { BrowserPlatform };

export type WebPushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type DeviceMeta = {
  platform: BrowserPlatform;
  userAgent: string | null;
  ipAddress: string | null;
};

export type PushSubscriptionRow = PushSubscription;

export type PushSubscriptionBadgeRow = Pick<
  PushSubscription,
  "id" | "userId" | "endpoint" | "missedNotificationsCount" | "isActive"
>;

const deactivationFailureThreshold = 3;

const badgeWriteTransaction = {
  isolationLevel: "read committed",
  accessMode: "read write",
} as const;

export class PushSubscriptionRepository {
  async saveSubscription(
    userId: string | null,
    subscription: WebPushSubscriptionPayload,
    meta: DeviceMeta,
  ): Promise<void> {
    const values = {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      platform: meta.platform,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      isActive: true,
      failuresCount: 0,
    };

    await db
      .insert(pushSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: values.userId,
          p256dh: values.p256dh,
          auth: values.auth,
          platform: values.platform,
          userAgent: values.userAgent,
          ipAddress: values.ipAddress,
          isActive: true,
          failuresCount: 0,
        },
      });
  }

  async getActiveSubscriptionsBatch(
    batchSize: number,
    cursor?: string,
  ): Promise<PushSubscriptionRow[]> {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new TypeError("batchSize must be a positive integer.");
    }

    const activeOnly = eq(pushSubscriptions.isActive, true);
    const whereClause =
      cursor === undefined
        ? activeOnly
        : and(activeOnly, gt(pushSubscriptions.id, cursor));

    return db
      .select()
      .from(pushSubscriptions)
      .where(whereClause)
      .orderBy(asc(pushSubscriptions.id))
      .limit(batchSize);
  }

  async incrementAllActiveBadges(): Promise<PushSubscriptionBadgeRow[]> {
    return db.transaction(async (tx) => {
      return tx
        .update(pushSubscriptions)
        .set({
          missedNotificationsCount: sql`${pushSubscriptions.missedNotificationsCount} + 1`,
        })
        .where(eq(pushSubscriptions.isActive, true))
        .returning({
          id: pushSubscriptions.id,
          userId: pushSubscriptions.userId,
          endpoint: pushSubscriptions.endpoint,
          missedNotificationsCount: pushSubscriptions.missedNotificationsCount,
          isActive: pushSubscriptions.isActive,
        });
    }, badgeWriteTransaction);
  }

  async clearBadgeForUser(userId: string): Promise<void> {
    await this.clearMissedNotificationBadges({ userId });
  }

  async clearBadgeForEndpoint(endpoint: string): Promise<void> {
    await this.clearMissedNotificationBadges({ endpoint });
  }

  async clearMissedNotificationBadges(identity: {
    userId?: string | null;
    endpoint?: string;
  }): Promise<void> {
    const userId = identity.userId ?? null;
    const endpoint = identity.endpoint;

    if (!userId && !endpoint) {
      return;
    }

    await db.transaction(async (tx) => {
      if (userId) {
        await tx
          .update(pushSubscriptions)
          .set({ missedNotificationsCount: 0 })
          .where(eq(pushSubscriptions.userId, userId));
      }

      if (endpoint) {
        await tx
          .update(pushSubscriptions)
          .set({ missedNotificationsCount: 0 })
          .where(eq(pushSubscriptions.endpoint, endpoint));
      }
    }, badgeWriteTransaction);
  }

  async incrementFailureCount(endpoint: string): Promise<void> {
    await db
      .update(pushSubscriptions)
      .set({
        failuresCount: sql`${pushSubscriptions.failuresCount} + 1`,
        isActive: sql`CASE WHEN ${pushSubscriptions.failuresCount} + 1 >= ${deactivationFailureThreshold} THEN FALSE ELSE ${pushSubscriptions.isActive} END`,
      })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deactivateSubscription(endpoint: string): Promise<void> {
    await db
      .update(pushSubscriptions)
      .set({ isActive: false })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  }
}

export const pushSubscriptionRepository = new PushSubscriptionRepository();
