import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/client.js";

const blogId = "11111111-1111-4111-8111-111111111111";
const origin = "https://dialup.example";

describe("service worker asset", () => {
  it("serves the worker from the site root without caching it", async () => {
    const response = await request(createApp()).get("/service-worker.js");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/javascript/);
    expect(response.headers["cache-control"]).toMatch(/no-store/);
    expect(response.headers["service-worker-allowed"]).toBe("/");
    expect(response.text).toContain("showNotification");
    expect(response.text).toContain("notificationclick");
    expect(response.text).toContain("setAppBadge");
    expect(response.text).toContain("parseInt(data.badge, 10)");
    expect(response.text).toContain("let badgeCount = 1");
  });
});

describe("service worker push badge handling", () => {
  it("sets the app badge from the payload integer and shows the banner", async () => {
    const worker = loadWorker();

    worker.dispatchPush({
      notification: {
        title: "New on Dialup Diaries",
        body: "Hello from the superhighway",
      },
      title: "New on Dialup Diaries",
      body: "Hello from the superhighway",
      badge: 4,
      blogId,
      url: `/posts/${blogId}`,
    });
    await worker.flush();

    expect(worker.setAppBadge).toHaveBeenCalledWith(4);
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    expect(worker.showNotification.mock.calls[0]?.[0]).toBe(
      "New on Dialup Diaries",
    );
    expect(worker.showNotification.mock.calls[0]?.[1]).toMatchObject({
      body: "Hello from the superhighway",
      badge: "/art/skull-white.webp",
      data: {
        blogId,
        url: `/posts/${blogId}`,
        badgeCount: 4,
      },
    });
  });

  it("falls back to badge 1 and still shows the banner when JSON is corrupt", async () => {
    const worker = loadWorker();

    worker.dispatchPush(
      {
        json() {
          throw new SyntaxError("Unexpected token");
        },
        text() {
          throw new SyntaxError("Unexpected token");
        },
      },
      { raw: true },
    );
    await worker.flush();

    expect(worker.setAppBadge).toHaveBeenCalledWith(1);
    expect(worker.showNotification.mock.calls[0]?.[0]).toBe(
      "New on Dialup Diaries",
    );
    expect(worker.showNotification.mock.calls[0]?.[1]).toMatchObject({
      body: "A new diary entry just dropped.",
    });
  });

  it("skips badging when the App Badging API is missing and still shows the banner", async () => {
    const worker = loadWorker({ hasBadgeApi: false });

    worker.dispatchPush({
      notification: { title: "New on Dialup Diaries", body: "Still ringing" },
      badge: 7,
      blogId,
      url: `/posts/${blogId}`,
    });
    await worker.flush();

    expect(worker.setAppBadge).not.toHaveBeenCalled();
    expect(worker.showNotification.mock.calls[0]?.[0]).toBe(
      "New on Dialup Diaries",
    );
    expect(worker.showNotification.mock.calls[0]?.[1]).toMatchObject({
      body: "Still ringing",
    });
  });

  it("keeps notificationclick focus and navigate behavior", async () => {
    const worker = loadWorker();
    const close = vi.fn();
    const focus = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn().mockResolvedValue(undefined);
    worker.self.clients.matchAll = vi
      .fn()
      .mockResolvedValue([{ url: `${origin}/`, focus, navigate }]);

    worker.dispatchNotificationClick({
      close,
      data: { url: `/posts/${blogId}`, blogId },
    });
    await worker.flush();

    expect(close).toHaveBeenCalledTimes(1);
    expect(worker.clearAppBadge).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(`${origin}/posts/${blogId}`);
    expect(worker.self.clients.openWindow).not.toHaveBeenCalled();
  });
});

afterAll(async () => {
  await pool.end();
});

type ShownNotificationOptions = {
  body: string;
  badge: string;
  data: {
    blogId: string | null;
    url: string;
    badgeCount: number;
  };
};

function loadWorker(options?: { hasBadgeApi?: boolean }) {
  const waitUntilPromises: Promise<unknown>[] = [];
  const setAppBadge = vi.fn().mockResolvedValue(undefined);
  const clearAppBadge = vi.fn().mockResolvedValue(undefined);
  const showNotification = vi
    .fn<(title: string, options: ShownNotificationOptions) => Promise<void>>()
    .mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const listeners = new Map<string, (event: unknown) => void>();
  const navigator: Record<string, unknown> = {};
  if (options?.hasBadgeApi !== false) {
    navigator.setAppBadge = setAppBadge;
    navigator.clearAppBadge = clearAppBadge;
  }

  const self = {
    addEventListener(type: string, handler: (event: unknown) => void) {
      listeners.set(type, handler);
    },
    navigator,
    registration: { showNotification },
    location: { origin },
    clients: {
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow,
    },
    skipWaiting: vi.fn(),
  };

  vm.runInNewContext(
    readFileSync(path.resolve("public/service-worker.js"), "utf8"),
    {
      self,
      console: { error: vi.fn() },
      URL,
      Number,
      Math,
      parseInt,
      JSON,
      Date,
      Boolean,
    },
    { filename: "service-worker.js" },
  );

  function waitUntil(promise: Promise<unknown>) {
    waitUntilPromises.push(Promise.resolve(promise));
  }

  return {
    self,
    setAppBadge,
    clearAppBadge,
    showNotification,
    dispatchPush(data: unknown, options?: { raw?: boolean }) {
      const handler = listeners.get("push");
      const eventData = options?.raw
        ? data
        : {
            json: () => data,
            text: () => JSON.stringify(data),
          };
      handler?.({ data: eventData, waitUntil });
    },
    dispatchNotificationClick(notification: {
      close: () => void;
      data: unknown;
    }) {
      const handler = listeners.get("notificationclick");
      handler?.({ notification, waitUntil });
    },
    async flush() {
      await Promise.all(waitUntilPromises);
    },
  };
}
