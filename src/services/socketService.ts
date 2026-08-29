import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders, Server as HTTPServer } from "node:http";
import { parseCookie } from "cookie";
import pino from "pino";
import { Server, type Socket } from "socket.io";
import { env, isProduction } from "../config/env.js";
import { pool } from "../db/client.js";

export const BLOG_POST_CREATED = "BLOG_POST_CREATED" as const;
const sessionCookieName = "dialup.sid";
const blogFeedRoom = "blog:feed";

export type BlogPostPayload = {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
};

type ClientToServerEvents = Record<string, never>;
type ServerToClientEvents = {
  [BLOG_POST_CREATED]: (payload: BlogPostPayload) => void;
};
type InterServerEvents = Record<string, never>;
type SocketData = {
  userId: string | null;
};

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type TrackedConnection = {
  id: string;
  connectedAt: Date;
  transport: string;
  userId: string | null;
};

type SessionCookieResult =
  { kind: "missing" } | { kind: "invalid" } | { kind: "ok"; sid: string };

const logger = pino({
  name: "socket",
  level: isProduction ? "info" : "debug",
});

export function toBlogPostPayload(post: {
  id: string;
  content: string;
  createdAt: Date;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
}): BlogPostPayload {
  return {
    id: post.id,
    content: post.content,
    createdAt: post.createdAt.toISOString(),
    authorId: post.authorId,
    authorUsername: post.authorUsername,
    authorDisplayName: post.authorDisplayName,
  };
}

export class SocketService {
  private static instance: SocketService | undefined;
  private readonly connections: Map<string, TrackedConnection>;
  private io: IoServer | null = null;
  private httpServer: HTTPServer | null = null;

  private constructor() {
    this.connections = new Map();
  }

  public static getInstance(): SocketService {
    SocketService.instance ??= new SocketService();
    return SocketService.instance;
  }

  public initialize(httpServer: HTTPServer): void {
    if (this.io) {
      throw new Error("SocketService is already initialized.");
    }

    const io: IoServer = new Server(httpServer, {
      path: "/socket.io",
      serveClient: false,
      cors: corsOptions(),
      allowRequest: (req, callback) => {
        if (
          isAuthorizedOrigin(
            firstHeader(req.headers.origin),
            firstHeader(req.headers.host),
          )
        ) {
          callback(null, true);
          return;
        }
        callback("Origin not allowed", false);
      },
    });

    io.use((socket, next) => {
      void this.authorizeHandshake(socket)
        .then(() => {
          next();
        })
        .catch((error: unknown) => {
          next(error instanceof Error ? error : new Error("Unauthorized"));
        });
    });

    io.on("connection", (socket) => {
      this.handleConnection(socket);
    });

    io.engine.on("connection_error", (error: unknown) => {
      logger.warn(summarizeConnectionError(error), "Socket handshake failed");
    });

    httpServer.on("error", this.onHttpServerError);
    httpServer.on("close", this.onHttpServerClose);

    this.httpServer = httpServer;
    this.io = io;
  }

  public broadcastNewBlogPost(blogData: BlogPostPayload): void {
    if (!this.io) {
      return;
    }

    for (const namespace of this.io._nsps.values()) {
      namespace.emit(BLOG_POST_CREATED, blogData);
    }
  }

  public close(): void {
    const io = this.io;
    const httpServer = this.httpServer;
    this.io = null;
    this.httpServer = null;
    this.connections.clear();

    if (httpServer) {
      httpServer.off("error", this.onHttpServerError);
      httpServer.off("close", this.onHttpServerClose);
    }

    if (!io) {
      return;
    }

    io.disconnectSockets(true);
    io.engine.close();
  }

  public get activeConnectionCount(): number {
    return this.connections.size;
  }

  private readonly onHttpServerError = (error: Error): void => {
    logger.error(
      { err: error },
      "HTTP server error; closing socket connections",
    );
    this.close();
  };

  private readonly onHttpServerClose = (): void => {
    this.close();
  };

  private async authorizeHandshake(socket: IoSocket): Promise<void> {
    const origin = firstHeader(socket.handshake.headers.origin);
    const host = firstHeader(socket.handshake.headers.host);
    if (!isAuthorizedOrigin(origin, host)) {
      throw new Error("Origin not allowed");
    }

    const sessionCookie = readSignedSessionId(
      firstHeader(socket.handshake.headers.cookie),
    );
    if (sessionCookie.kind === "invalid") {
      throw new Error("Invalid session");
    }
    if (sessionCookie.kind === "missing") {
      socket.data.userId = null;
      return;
    }

    socket.data.userId = await lookupSessionUserId(sessionCookie.sid);
  }

  private handleConnection(socket: IoSocket): void {
    const transport = socket.conn.transport.name;
    this.connections.set(socket.id, {
      id: socket.id,
      connectedAt: new Date(),
      transport,
      userId: socket.data.userId,
    });
    logger.info(
      { socketId: socket.id, transport, userId: socket.data.userId },
      "Socket connected",
    );

    void socket.join(blogFeedRoom);

    socket.conn.on("upgrade", (upgradedTransport: { name: string }) => {
      const tracked = this.connections.get(socket.id);
      if (tracked) {
        tracked.transport = upgradedTransport.name;
      }
      logger.info(
        { socketId: socket.id, transport: upgradedTransport.name },
        "Socket transport upgraded",
      );
    });

    socket.on("disconnect", () => {
      this.connections.delete(socket.id);
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  }
}

export const socketService = SocketService.getInstance();

function corsOptions() {
  if (isProduction) {
    return {
      origin: false,
      methods: ["GET", "POST"],
    };
  }

  return {
    origin: true,
    credentials: true,
    methods: ["GET", "POST"],
  };
}

export function isAuthorizedOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  if (!origin) {
    return true;
  }
  if (!isProduction && isLoopbackOrigin(origin)) {
    return true;
  }
  if (!host) {
    return false;
  }
  return isSameOriginAsHost(origin, host);
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      isLoopbackHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

function isSameOriginAsHost(origin: string, hostHeader: string): boolean {
  try {
    const originUrl = new URL(origin);
    const hostUrl = new URL(`http://${hostHeader}`);
    if (originUrl.hostname.toLowerCase() !== hostUrl.hostname.toLowerCase()) {
      return false;
    }
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") {
      return false;
    }
    if (
      isProduction &&
      originUrl.protocol !== "https:" &&
      !isLoopbackHostname(originUrl.hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function firstHeader(value: IncomingHttpHeaders[string]): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function readSignedSessionId(
  cookieHeader: string | undefined,
): SessionCookieResult {
  if (!cookieHeader) {
    return { kind: "missing" };
  }

  const raw = parseCookie(cookieHeader)[sessionCookieName];
  if (!raw) {
    return { kind: "missing" };
  }
  if (!raw.startsWith("s:")) {
    return { kind: "invalid" };
  }

  const sid = unsignCookie(raw.slice(2), env.SESSION_SECRET);
  return sid ? { kind: "ok", sid } : { kind: "invalid" };
}

function unsignCookie(signedValue: string, secret: string): string | null {
  const separator = signedValue.lastIndexOf(".");
  if (separator < 1) {
    return null;
  }

  const value = signedValue.slice(0, separator);
  const provided = signedValue.slice(separator + 1);
  const expected = createHmac("sha256", secret)
    .update(value)
    .digest("base64")
    .replace(/=+$/u, "");
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }
  return value;
}

function summarizeConnectionError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { err: error };
  }

  return {
    code: "code" in error ? error.code : undefined,
    message: "message" in error ? error.message : undefined,
  };
}

async function lookupSessionUserId(sid: string): Promise<string | null> {
  const result = await pool.query<{ sess: unknown }>(
    "SELECT sess FROM user_sessions WHERE sid = $1 AND expire > now() LIMIT 1",
    [sid],
  );
  return readUserIdFromSession(result.rows[0]?.sess);
}

function readUserIdFromSession(sess: unknown): string | null {
  if (typeof sess !== "object" || sess === null || !("userId" in sess)) {
    return null;
  }
  return typeof sess.userId === "string" ? sess.userId : null;
}
