import { createServer, type Server as HTTPServer } from "node:http";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { pool } from "../src/db/client.js";
import {
  asIntegerDelta,
  BATCH_COUNTER_UPDATES,
  BLOG_POST_CREATED,
  COUNTER_FLUSH_INTERVAL_MS,
  drainCounterLedger,
  GUESTBOOK_ENTRY_CREATED,
  isAuthorizedOrigin,
  mergeCounterDelta,
  SocketService,
  socketService,
  toggleDelta,
  type BatchCounterUpdatesPayload,
  type BlogPostPayload,
  type CounterDeltaLedger,
  type GuestbookEntryPayload,
} from "../src/services/socketService.js";

const samplePost: BlogPostPayload = {
  id: "11111111-1111-4111-8111-111111111111",
  content: "Just signed on from the information superhighway.",
  createdAt: "2026-08-15T20:00:00.000Z",
  authorId: "22222222-2222-4222-8222-222222222222",
  authorUsername: "webmaster",
  authorDisplayName: "Webmaster",
};

const sampleTargetId = "11111111-1111-4111-8111-111111111111";
const otherTargetId = "44444444-4444-4444-8444-444444444444";

const sampleGuestbook: GuestbookEntryPayload = {
  entryId: "33333333-3333-4333-8333-333333333333",
  postId: "11111111-1111-4111-8111-111111111111",
  authorName: "Sunny",
  authorUsername: "sunny",
  message: "Leaving a sparkle in the guestbook.",
  createdAt: "2026-08-29T21:00:00.000Z",
};

describe("SocketService", () => {
  const clients: ClientSocket[] = [];
  let httpServer: HTTPServer | undefined;

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }
    socketService.close();
    await closeServer(httpServer);
    httpServer = undefined;
  });

  it("exposes a singleton instance", () => {
    expect(SocketService.getInstance()).toBe(socketService);
    expect(SocketService.getInstance()).toBe(SocketService.getInstance());
  });

  it("does not throw when broadcasting before the HTTP server is attached", () => {
    expect(() => socketService.broadcastNewBlogPost(samplePost)).not.toThrow();
    expect(() =>
      socketService.queueCounterDelta(sampleTargetId, "like", 1),
    ).not.toThrow();
    expect(() => socketService.flushCounterBatch()).not.toThrow();
    expect(() =>
      socketService.broadcastGuestbookEntry(sampleGuestbook),
    ).not.toThrow();
  });

  it("tracks connections and logs the transport by accepting a handshake", async () => {
    const port = await attachService();
    const client = connect(port);
    await waitForConnect(client);

    expect(socketService.activeConnectionCount).toBe(1);
  });

  it("broadcasts BLOG_POST_CREATED to every connected client", async () => {
    const port = await attachService();
    const first = connect(port);
    const second = connect(port);
    await Promise.all([waitForConnect(first), waitForConnect(second)]);

    const received = Promise.all([waitForPost(first), waitForPost(second)]);
    socketService.broadcastNewBlogPost(samplePost);

    await expect(received).resolves.toEqual([samplePost, samplePost]);
  });

  it("does not emit counter deltas until the buffer is flushed", async () => {
    const port = await attachService();
    const client = connect(port);
    await waitForConnect(client);

    let emitted = false;
    client.on(BATCH_COUNTER_UPDATES, () => {
      emitted = true;
    });
    socketService.queueCounterDelta(sampleTargetId, "like", 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });

    expect(emitted).toBe(false);
    expect(socketService.pendingCounterTargetCount).toBe(1);
  });

  it("broadcasts one compact BATCH_COUNTER_UPDATES payload per sweep", async () => {
    const port = await attachService();
    const first = connect(port);
    const second = connect(port);
    await Promise.all([waitForConnect(first), waitForConnect(second)]);

    const received = Promise.all([
      waitForEvent<BatchCounterUpdatesPayload>(first, BATCH_COUNTER_UPDATES),
      waitForEvent<BatchCounterUpdatesPayload>(second, BATCH_COUNTER_UPDATES),
    ]);
    socketService.queueCounterDelta(sampleTargetId, "like", 1);
    socketService.queueCounterDelta(sampleTargetId, "like", 1);
    socketService.queueCounterDelta(sampleTargetId, "retweet", -1);
    socketService.queueCounterDelta(sampleTargetId, "reply", 1);
    socketService.queueCounterDelta(otherTargetId, "like", 3);
    socketService.flushCounterBatch();

    const expected: BatchCounterUpdatesPayload = [
      {
        targetId: sampleTargetId,
        likesDelta: 2,
        retweetsDelta: -1,
        repliesDelta: 1,
      },
      {
        targetId: otherTargetId,
        likesDelta: 3,
        retweetsDelta: 0,
        repliesDelta: 0,
      },
    ];
    await expect(received).resolves.toEqual([expected, expected]);
    expect(socketService.pendingCounterTargetCount).toBe(0);
  });

  it("arms a 2-second flush interval on the first queued delta", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    try {
      socketService.queueCounterDelta(sampleTargetId, "like", 1);
      expect(spy).toHaveBeenCalledWith(
        expect.any(Function),
        COUNTER_FLUSH_INTERVAL_MS,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("drops the in-memory ledger on close so a crash cannot replay stale deltas", () => {
    socketService.queueCounterDelta(sampleTargetId, "like", 1);
    expect(socketService.pendingCounterTargetCount).toBe(1);
    socketService.close();
    expect(socketService.pendingCounterTargetCount).toBe(0);
  });

  it("broadcasts GUESTBOOK_ENTRY_CREATED to every connected client", async () => {
    const port = await attachService();
    const first = connect(port);
    const second = connect(port);
    await Promise.all([waitForConnect(first), waitForConnect(second)]);

    const received = Promise.all([
      waitForEvent<GuestbookEntryPayload>(first, GUESTBOOK_ENTRY_CREATED),
      waitForEvent<GuestbookEntryPayload>(second, GUESTBOOK_ENTRY_CREATED),
    ]);
    socketService.broadcastGuestbookEntry(sampleGuestbook);

    await expect(received).resolves.toEqual([sampleGuestbook, sampleGuestbook]);
  });

  it("aggregates counter deltas by post id and drops cancelled-out rows", () => {
    const ledger = new Map<string, CounterDeltaLedger>();
    mergeCounterDelta(ledger, sampleTargetId, "like", 1);
    mergeCounterDelta(ledger, sampleTargetId, "like", 1);
    mergeCounterDelta(ledger, sampleTargetId, "retweet", 2);
    mergeCounterDelta(ledger, sampleTargetId, "retweet", -2);
    mergeCounterDelta(ledger, otherTargetId, "reply", 1);
    expect(drainCounterLedger(ledger)).toEqual([
      {
        targetId: sampleTargetId,
        likesDelta: 2,
        retweetsDelta: 0,
        repliesDelta: 0,
      },
      {
        targetId: otherTargetId,
        likesDelta: 0,
        retweetsDelta: 0,
        repliesDelta: 1,
      },
    ]);
    expect(ledger.size).toBe(0);
    expect(asIntegerDelta(4.9)).toBe(4);
    expect(asIntegerDelta(Number.NaN)).toBe(0);
    expect(toggleDelta(true)).toBe(1);
    expect(toggleDelta(false)).toBe(-1);
  });

  it("rejects handshakes from disallowed origins", async () => {
    const port = await attachService();
    const client = connect(port, { Origin: "https://evil.example" });

    const error = await waitForConnectError(client);
    expect(error.message.length).toBeGreaterThan(0);
    expect(socketService.activeConnectionCount).toBe(0);
  });

  it("treats a matching tunnel origin as authorized during local development", () => {
    expect(
      isAuthorizedOrigin("https://demo.ngrok-free.app", "demo.ngrok-free.app"),
    ).toBe(true);
    expect(
      isAuthorizedOrigin("https://evil.example", "demo.ngrok-free.app"),
    ).toBe(false);
    expect(isAuthorizedOrigin("http://127.0.0.1:3000", "127.0.0.1:3000")).toBe(
      true,
    );
  });

  it("disconnects active sockets on close", async () => {
    const port = await attachService();
    const client = connect(port);
    await waitForConnect(client);

    const disconnected = new Promise<void>((resolve) => {
      client.once("disconnect", () => {
        resolve();
      });
    });
    socketService.close();
    await disconnected;

    expect(socketService.activeConnectionCount).toBe(0);
  });

  async function attachService() {
    httpServer = createServer();
    socketService.initialize(httpServer);
    await listen(httpServer);
    const address = httpServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listen address.");
    }
    return address.port;
  }

  function connect(port: number, extraHeaders?: Record<string, string>) {
    const client = ioc(`http://127.0.0.1:${String(port)}`, {
      reconnection: false,
      timeout: 3_000,
      transports: ["websocket"],
      ...(extraHeaders ? { extraHeaders } : {}),
    });
    clients.push(client);
    return client;
  }
});

afterAll(async () => {
  await pool.end();
});

function waitForConnect(client: ClientSocket) {
  if (client.connected) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for socket connect"));
    }, 3_000);
    client.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForConnectError(client: ClientSocket) {
  return new Promise<Error>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for socket connect_error"));
    }, 3_000);
    client.once("connect", () => {
      clearTimeout(timer);
      reject(new Error("Connected despite a forbidden origin"));
    });
    client.once("connect_error", (error) => {
      clearTimeout(timer);
      resolve(error);
    });
  });
}

function waitForPost(client: ClientSocket) {
  return waitForEvent<BlogPostPayload>(client, BLOG_POST_CREATED);
}

function waitForEvent<T>(client: ClientSocket, event: string) {
  return new Promise<T>((resolve) => {
    client.once(event, (payload: T) => {
      resolve(payload);
    });
  });
}

function listen(server: HTTPServer) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: HTTPServer | undefined) {
  if (!server?.listening) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
