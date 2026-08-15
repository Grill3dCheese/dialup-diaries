import type { User } from "../db/schema.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    presenceTouchedAt?: number;
    csrfToken?: string;
    flash?: { kind: "success" | "error"; message: string };
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser: Pick<User, "id" | "username" | "displayName" | "bio" | "lastSeenAt" | "isAdmin"> | null;
    }
  }
}

export {};
