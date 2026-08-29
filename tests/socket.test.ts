import { createServer, type Server as HTTPServer } from "node:http";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { pool } from "../src/db/client.js";
import {
  BLOG_POST_CREATED,
  isAuthorizedOrigin,
  SocketService,
  socketService,
  type BlogPostPayload,
} from "../src/services/socketService.js";

const samplePost: BlogPostPayload = {
  id: "11111111-1111-4111-8111-111111111111",
  content: "Just signed on from the information superhighway.",
  createdAt: "2026-08-15T20:00:00.000Z",
  authorId: "22222222-2222-4222-8222-222222222222",
  authorUsername: "webmaster",
  authorDisplayName: "Webmaster",
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
  return new Promise<BlogPostPayload>((resolve) => {
    client.once(BLOG_POST_CREATED, (payload: BlogPostPayload) => {
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
