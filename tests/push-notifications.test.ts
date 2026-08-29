import { afterAll, describe, expect, it, vi } from "vitest";
import type { VapidConfig } from "../src/config/env.js";
import { pool } from "../src/db/client.js";
import {
  PushNotificationService,
  normalizeBadgeCount,
  sanitizeNotificationText,
  serializePushPayload,
  type PushDeliveryTarget,
  type SendPushNotification,
} from "../src/services/pushNotificationService.js";

const blogId = "11111111-1111-4111-8111-111111111111";
const vapid: VapidConfig = {
  subject: "mailto:webmaster@example.com",
  publicKey: "B".repeat(87),
  privateKey: "x".repeat(43),
};

describe("PushNotificationService", () => {
  it("streams active subscriptions in batches and maps each to sendNotification", async () => {
    const first = target("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 3);
    const second = target("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1);
    const { repository, sendNotification, service } = createService({
      batches: [[first], [second], []],
    });

    await service.sendNewBlogNotification(
      "Hello from the superhighway",
      blogId,
    );

    expect(repository.getActiveSubscriptionsBatch.mock.calls).toEqual([
      [1],
      [1, first.id],
      [1, second.id],
    ]);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(repository.incrementAllActiveBadges).toHaveBeenCalledTimes(1);
    expect(
      repository.incrementAllActiveBadges.mock.invocationCallOrder[0],
    ).toBeLessThan(
      repository.getActiveSubscriptionsBatch.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: first.endpoint,
        keys: { p256dh: first.p256dh, auth: first.auth },
      },
      expect.stringContaining(blogId),
      expect.objectContaining({ contentEncoding: "aes128gcm" }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: second.endpoint }),
      expect.stringContaining("Hello from the superhighway"),
      expect.any(Object),
    );
    const firstPayload = JSON.parse(
      String(sendNotification.mock.calls[0]?.[1]),
    ) as { badge: number; notification: { title: string; body: string } };
    const secondPayload = JSON.parse(
      String(sendNotification.mock.calls[1]?.[1]),
    ) as { badge: number };
    expect(firstPayload.badge).toBe(first.missedNotificationsCount);
    expect(firstPayload.notification).toEqual({
      title: "New on Dialup Diaries",
      body: "Hello from the superhighway",
    });
    expect(secondPayload.badge).toBe(second.missedNotificationsCount);
  });

  it("uses the incremented badge from the database step for each subscription row", async () => {
    const first = target("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 1);
    const second = target("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1);
    const { sendNotification, service } = createService({
      batches: [[first, second]],
      batchSize: 2,
      badgeRows: [
        {
          id: first.id,
          userId: null,
          endpoint: first.endpoint,
          missedNotificationsCount: 4,
          isActive: true,
        },
        {
          id: second.id,
          userId: null,
          endpoint: second.endpoint,
          missedNotificationsCount: 9,
          isActive: true,
        },
      ],
    });

    await service.sendNewBlogNotification(
      "Hello from the superhighway",
      blogId,
    );

    const firstPayload = JSON.parse(
      String(sendNotification.mock.calls[0]?.[1]),
    ) as {
      badge: number;
      blogId: string;
      url: string;
      notification: { title: string; body: string };
    };
    const secondPayload = JSON.parse(
      String(sendNotification.mock.calls[1]?.[1]),
    ) as { badge: number };

    expect(firstPayload.badge).toBe(4);
    expect(firstPayload.blogId).toBe(blogId);
    expect(firstPayload.url).toBe(`/posts/${blogId}`);
    expect(firstPayload.notification).toEqual({
      title: "New on Dialup Diaries",
      body: "Hello from the superhighway",
    });
    expect(secondPayload.badge).toBe(9);
  });

  it("deactivates subscriptions when the push service returns 410 or 404", async () => {
    const gone = target("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    const missing = target("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const { repository, sendNotification, service } = createService({
      batches: [[gone, missing]],
      batchSize: 2,
    });
    sendNotification
      .mockRejectedValueOnce(statusError(410))
      .mockRejectedValueOnce(statusError(404));

    await service.sendNewBlogNotification("Expired browsers", blogId);

    expect(repository.deactivateSubscription).toHaveBeenCalledWith(
      gone.endpoint,
    );
    expect(repository.deactivateSubscription).toHaveBeenCalledWith(
      missing.endpoint,
    );
    expect(repository.incrementFailureCount).not.toHaveBeenCalled();
  });

  it("increments the failure count for malformed-subscription responses", async () => {
    const bad = target("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    const { repository, sendNotification, service } = createService({
      batches: [[bad]],
    });
    sendNotification.mockRejectedValueOnce(statusError(400));

    await service.sendNewBlogNotification("Bad endpoint keys", blogId);

    expect(repository.incrementFailureCount).toHaveBeenCalledWith(bad.endpoint);
    expect(repository.deactivateSubscription).not.toHaveBeenCalled();
  });

  it("does not deactivate everyone when VAPID authentication fails", async () => {
    const sub = target("ffffffff-ffff-4fff-8fff-ffffffffffff");
    const { repository, sendNotification, service } = createService({
      batches: [[sub]],
    });
    sendNotification.mockRejectedValueOnce(statusError(403));

    await service.sendNewBlogNotification("Config problem", blogId);

    expect(repository.deactivateSubscription).not.toHaveBeenCalled();
    expect(repository.incrementFailureCount).not.toHaveBeenCalled();
  });

  it("skips fanout when VAPID is not configured", async () => {
    const { repository, sendNotification, service } = createService({
      batches: [[]],
      vapid: null,
    });
    await service.sendNewBlogNotification("Nobody is listening", blogId);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(repository.incrementAllActiveBadges).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID blog id before touching subscriptions", async () => {
    const { repository, service } = createService({ batches: [[]] });
    await expect(
      service.sendNewBlogNotification("Nope", "not-a-uuid"),
    ).rejects.toThrow(/blogId must be a UUID/);
    expect(repository.incrementAllActiveBadges).not.toHaveBeenCalled();
    expect(repository.getActiveSubscriptionsBatch).not.toHaveBeenCalled();
  });
});

describe("notification copy", () => {
  it("strips control characters and truncates long titles", () => {
    expect(sanitizeNotificationText("  hello\nweb  ")).toBe("hello web");
    expect(sanitizeNotificationText("x".repeat(130)).endsWith("...")).toBe(
      true,
    );
    expect(sanitizeNotificationText("\u0000")).toBe(
      "A new diary entry just dropped.",
    );
  });

  it("serializes a non-negative integer badge onto the push payload", () => {
    expect(normalizeBadgeCount(-1)).toBe(0);
    expect(normalizeBadgeCount(1.5)).toBe(0);
    expect(normalizeBadgeCount(4)).toBe(4);
    expect(
      JSON.parse(
        serializePushPayload({
          title: "New on Dialup Diaries",
          body: "Hello",
          blogId,
          url: `/posts/${blogId}`,
          badge: 4,
        }),
      ),
    ).toMatchObject({
      badge: 4,
      blogId,
      title: "New on Dialup Diaries",
      body: "Hello",
      notification: { title: "New on Dialup Diaries", body: "Hello" },
    });
  });
});

afterAll(async () => {
  await pool.end();
});

function createService(options: {
  batches: PushDeliveryTarget[][];
  batchSize?: number;
  vapid?: VapidConfig | null;
  badgeRows?: readonly {
    id: string;
    userId: string | null;
    endpoint: string;
    missedNotificationsCount: number;
    isActive: boolean;
  }[];
}) {
  const queue = [...options.batches];
  const repository = {
    incrementAllActiveBadges: vi
      .fn()
      .mockResolvedValue(options.badgeRows ?? []),
    getActiveSubscriptionsBatch: vi
      .fn()
      .mockImplementation(() => Promise.resolve(queue.shift() ?? [])),
    deactivateSubscription: vi.fn().mockResolvedValue(undefined),
    incrementFailureCount: vi.fn().mockResolvedValue(undefined),
  };
  const sendNotification = vi
    .fn<SendPushNotification>()
    .mockResolvedValue({ statusCode: 201 });
  const service = new PushNotificationService({
    repository,
    sendNotification,
    vapid: options.vapid === undefined ? vapid : options.vapid,
    batchSize: options.batchSize ?? 1,
  });

  return { repository, sendNotification, service };
}

function target(id: string, missedNotificationsCount = 1): PushDeliveryTarget {
  return {
    id,
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: "p256dh-key-value-at-least-8",
    auth: "auth-secret-value",
    missedNotificationsCount,
  };
}

function statusError(statusCode: number) {
  return Object.assign(new Error("push failed"), { statusCode });
}
