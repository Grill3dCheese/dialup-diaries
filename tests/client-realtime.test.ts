import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectBrowserPlatform,
  isIosUserAgent,
  resetAppBadgeContext,
  urlBase64ToUint8Array,
} from "../src/client/push-subscription.js";
import {
  halloweenArtForPostId,
  initialsFromName,
  isBlogPostPayload,
  isBatchCounterUpdatesPayload,
  isCounterUpdatePayload,
  isGuestbookEntryPayload,
  applyBatchCounterUpdates,
  applyCounterUpdate,
  applyGuestbookEntry,
  noteLocalCounterDelta,
  resetLocalCounterDeltas,
} from "../src/client/socket-feed.js";

const samplePost = {
  id: "11111111-1111-4111-8111-111111111111",
  content: "Just signed on from the information superhighway.",
  createdAt: "2026-08-15T20:00:00.000Z",
  authorId: "22222222-2222-4222-8222-222222222222",
  authorUsername: "webmaster",
  authorDisplayName: "Webmaster",
};

describe("live blog payload guards", () => {
  it("accepts a well-formed BLOG_POST_CREATED payload", () => {
    expect(isBlogPostPayload(samplePost)).toBe(true);
  });

  it("rejects spoofed usernames, empty bodies, and malformed ids", () => {
    expect(
      isBlogPostPayload({ ...samplePost, authorUsername: "web master" }),
    ).toBe(false);
    expect(isBlogPostPayload({ ...samplePost, authorUsername: "../etc" })).toBe(
      false,
    );
    expect(isBlogPostPayload({ ...samplePost, content: "" })).toBe(false);
    expect(isBlogPostPayload({ ...samplePost, id: "not-a-uuid" })).toBe(false);
    expect(isBlogPostPayload({ ...samplePost, createdAt: "tonight" })).toBe(
      false,
    );
  });

  it("keeps halloween art selection stable for a given post id", () => {
    const art = halloweenArtForPostId(samplePost.id);
    expect([
      "pumpkin",
      "skull",
      "skull-white",
      "ghost",
      "tombstone",
      "witch-hat",
      "cauldron",
      "bats",
    ]).toContain(art);
    expect(halloweenArtForPostId(samplePost.id)).toBe(art);
  });

  it("builds two-letter initials from a display name", () => {
    expect(initialsFromName("Maya Chen")).toBe("MC");
    expect(initialsFromName("webmaster")).toBe("W");
  });
});

describe("live counter and guestbook payload guards", () => {
  const sampleCounter = {
    targetId: samplePost.id,
    type: "like" as const,
    newCount: 4,
  };
  const sampleBatchItem = {
    targetId: samplePost.id,
    likesDelta: 2,
    retweetsDelta: 0,
    repliesDelta: 0,
  };
  const sampleBatch = [sampleBatchItem];
  const sampleEntry = {
    entryId: "33333333-3333-4333-8333-333333333333",
    postId: samplePost.id,
    authorName: "Sunny Park",
    authorUsername: "sunny",
    message: "Leaving a sparkle in the guestbook.",
    createdAt: "2026-08-29T21:00:00.000Z",
  };

  afterEach(() => {
    resetLocalCounterDeltas();
  });

  it("accepts well-formed absolute, batched, and guestbook payloads", () => {
    expect(isCounterUpdatePayload(sampleCounter)).toBe(true);
    expect(isCounterUpdatePayload({ ...sampleCounter, type: "retweet" })).toBe(
      true,
    );
    expect(isCounterUpdatePayload({ ...sampleCounter, type: "reply" })).toBe(
      true,
    );
    expect(isBatchCounterUpdatesPayload(sampleBatch)).toBe(true);
    expect(
      isBatchCounterUpdatesPayload([
        {
          targetId: samplePost.id,
          likesDelta: -1,
          retweetsDelta: 4,
          repliesDelta: 1,
        },
      ]),
    ).toBe(true);
    expect(isGuestbookEntryPayload(sampleEntry)).toBe(true);
  });

  it("rejects fractional counts, unknown types, and spoofed guestbook fields", () => {
    expect(isCounterUpdatePayload({ ...sampleCounter, newCount: 1.5 })).toBe(
      false,
    );
    expect(isCounterUpdatePayload({ ...sampleCounter, newCount: -1 })).toBe(
      false,
    );
    expect(isCounterUpdatePayload({ ...sampleCounter, type: "repost" })).toBe(
      false,
    );
    expect(isCounterUpdatePayload({ ...sampleCounter, targetId: "nope" })).toBe(
      false,
    );
    expect(
      isBatchCounterUpdatesPayload([{ ...sampleBatchItem, likesDelta: 1.25 }]),
    ).toBe(false);
    expect(isBatchCounterUpdatesPayload(sampleBatchItem)).toBe(false);
    expect(
      isGuestbookEntryPayload({ ...sampleEntry, authorUsername: "bad name" }),
    ).toBe(false);
    expect(isGuestbookEntryPayload({ ...sampleEntry, message: "" })).toBe(
      false,
    );
    expect(isGuestbookEntryPayload({ ...sampleEntry, entryId: "nope" })).toBe(
      false,
    );
  });

  it("writes the absolute count onto matching counter nodes and pulses on increase", () => {
    const { count, classList, setAttribute, root } = fakeCounterNode("2");

    expect(applyCounterUpdate(sampleCounter, root)).toBe(true);
    expect(count.textContent).toBe("4");
    expect(setAttribute).toHaveBeenCalledWith("aria-label", "4 likes");
    expect(classList.add).toHaveBeenCalledWith(
      "is-live-tick",
      "is-live-tick--like",
    );
  });

  it("does not apply a live tick when the displayed count is already current", () => {
    const { classList, root } = fakeCounterNode("4");

    expect(applyCounterUpdate(sampleCounter, root)).toBe(true);
    expect(classList.add).not.toHaveBeenCalled();
  });

  it("applies batched deltas in one pass and pulses only when the count changes", () => {
    const { count, classList, root } = fakeCounterNode("4");

    expect(applyBatchCounterUpdates(sampleBatch, root)).toBe(true);
    expect(count.textContent).toBe("6");
    expect(classList.add).toHaveBeenCalledWith(
      "is-live-tick",
      "is-live-tick--like",
    );
  });

  it("nets out the acting client's own like so the 2-second batch cannot double-count", () => {
    const { count, classList, root } = fakeCounterNode("5");
    noteLocalCounterDelta(samplePost.id, "like", 1);

    expect(
      applyBatchCounterUpdates(
        [
          {
            targetId: samplePost.id,
            likesDelta: 1,
            retweetsDelta: 0,
            repliesDelta: 0,
          },
        ],
        root,
      ),
    ).toBe(false);
    expect(count.textContent).toBe("5");
    expect(classList.add).not.toHaveBeenCalled();
  });

  it("updates off-screen counters without forcing a pulse or layout reflow", () => {
    const { count, classList, root } = fakeCounterNode("4", {
      visible: false,
    });

    expect(applyBatchCounterUpdates(sampleBatch, root)).toBe(true);
    expect(count.textContent).toBe("6");
    expect(classList.add).not.toHaveBeenCalled();
  });

  it("bumps reply counts immediately when guestbook text arrives on a timeline", () => {
    const { count, root } = fakeCounterNode("1", { type: "reply" });

    expect(applyGuestbookEntry(null, sampleEntry, root)).toBe(false);
    expect(count.textContent).toBe("2");
    expect(
      applyBatchCounterUpdates(
        [
          {
            targetId: samplePost.id,
            likesDelta: 0,
            retweetsDelta: 0,
            repliesDelta: 1,
          },
        ],
        root,
      ),
    ).toBe(false);
    expect(count.textContent).toBe("2");
  });

  it("routes live post and guestbook bodies through the markdown renderer", () => {
    const source = readFileSync(
      path.resolve("src/client/socket-feed.js"),
      "utf8",
    );
    expect(source).toContain("BATCH_COUNTER_UPDATES");
    expect(source).toContain("GUESTBOOK_ENTRY_CREATED");
    expect(source).toContain("data-counter");
    expect(source).toContain("checkVisibility");
    expect(source).toContain("is-live-entry");
    expect(source).toContain("setMarkdownContent");
    expect(source).toContain('className = "markdown-body"');
    expect(source).not.toMatch(/innerHTML\s*=/);
    expect(source).not.toContain("textContent = payload.message");
    expect(source).not.toContain("textContent = content");
  });
});

describe("web-push helpers", () => {
  it("round-trips a URL-safe VAPID public key into a Uint8Array", () => {
    const raw = Buffer.alloc(65, 7);
    const encoded = raw.toString("base64url");
    const bytes = urlBase64ToUint8Array(encoded);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect([...bytes]).toEqual([...raw]);
  });

  it("rejects truncated or non-base64 VAPID keys", () => {
    expect(() => urlBase64ToUint8Array("short")).toThrow(/URL-safe Base64/);
    expect(() => urlBase64ToUint8Array("***not-valid-base64-key***")).toThrow(
      /URL-safe Base64/,
    );
  });

  it("reports a viewed app as read so missed-notification badges can reset", () => {
    const source = readFileSync(
      path.resolve("src/client/push-subscription.js"),
      "utf8",
    );
    expect(source).toContain("export async function resetAppBadgeContext");
    expect(source).toContain("/api/notifications/read");
    expect(source).toContain('"clearAppBadge" in navigator');
    expect(source).toContain("navigator.clearAppBadge()");
  });

  it("binds badge reset to launch and visibility focus without touching the socket feed", () => {
    const source = readFileSync(path.resolve("src/client/app.js"), "utf8");
    expect(source).toContain("void resetAppBadgeContext({ csrfToken });");
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('document.visibilityState === "visible"');
    expect(source).toContain("initSocketFeed();");
    expect(source).toContain("applyCounterUpdate({");
    expect(source).toContain("noteLocalCounterDelta(");
    expect(source).toContain('type: reaction === "like" ? "like" : "retweet"');
    expect(source).toContain("armAllFlashes()");
  });

  it("maps user agents onto the stored browser platform enum", () => {
    expect(
      detectBrowserPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      ),
    ).toBe("edge");
    expect(detectBrowserPlatform("Mozilla/5.0 Firefox/121.0")).toBe("firefox");
    expect(
      detectBrowserPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("chrome");
    expect(
      detectBrowserPlatform(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      ),
    ).toBe("safari");
    expect(detectBrowserPlatform("DialupLynx/2.8")).toBe("other");
  });

  it("detects iPhone and iPad user agents for the Home Screen pager hint", () => {
    expect(
      isIosUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
    expect(
      isIosUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});

describe("resetAppBadgeContext", () => {
  let now = Date.parse("2026-08-29T15:00:00Z");

  beforeEach(() => {
    now += 5_000;
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the OS badge and POSTs the Session 1 read endpoint for this device", async () => {
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    const endpoint = "https://fcm.googleapis.com/fcm/send/badge-sync-test";

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", {
      clearAppBadge,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: () => Promise.resolve({ endpoint }),
          },
        }),
      },
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      querySelector: () => null,
    });

    await resetAppBadgeContext({ csrfToken: "csrf-test-token" });

    expect(clearAppBadge).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(call?.[0]).toBe("/api/notifications/read");
    expect(call?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": "csrf-test-token",
      },
      body: JSON.stringify({ endpoint }),
    });
  });

  it("clears the OS badge even when this device has no push endpoint yet", async () => {
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { clearAppBadge });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      querySelector: () => null,
    });

    await resetAppBadgeContext({ csrfToken: "csrf-test-token" });

    expect(clearAppBadge).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reset badges while the app is backgrounded", async () => {
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("navigator", { clearAppBadge });
    vi.stubGlobal("document", {
      visibilityState: "hidden",
      querySelector: () => null,
    });

    await resetAppBadgeContext({ csrfToken: "csrf-test-token" });

    expect(clearAppBadge).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("service worker script", () => {
  const source = readFileSync(path.resolve("public/service-worker.js"), "utf8");

  it("registers defensive push and notificationclick hooks", () => {
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("clients.openWindow");
    expect(source).toContain("client.navigate");
    expect(source).toContain("client.focus");
    expect(source).toContain("setAppBadge");
    expect(source).toContain("clearAppBadge");
    expect(source).toContain("let badgeCount = 1");
    expect(source).toContain("parseInt(data.badge, 10)");
    expect(source).toContain("Badge block error:");
    expect(source).toContain('"setAppBadge" in self.navigator');
    expect(source).not.toContain("innerHTML");
  });
});

function fakeCounterNode(
  text: string,
  options: { type?: "like" | "retweet" | "reply"; visible?: boolean } = {},
) {
  const type = options.type ?? "like";
  const setAttribute = vi.fn();
  const classList = { add: vi.fn(), remove: vi.fn() };
  const host = {
    checkVisibility: () => options.visible !== false,
  };
  const count = {
    textContent: text,
    closest: (selector: string) => {
      if (selector === "[data-post-id]") return host;
      return {
        getAttribute: () => `${text} ${type === "like" ? "likes" : type}`,
        setAttribute,
      };
    },
    classList,
    offsetWidth: 12,
    addEventListener: vi.fn(),
  };
  const root = {
    querySelectorAll: (selector: string) =>
      selector.includes(`data-counter="${type}"`) ? [count] : [],
    querySelector: () => null,
  };
  return { count, classList, setAttribute, root };
}
