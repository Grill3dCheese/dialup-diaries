import { randomBytes } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticateUser, createUser } from "../services/auth.js";
import { firstError, loginSchema, registerSchema } from "../utils/validation.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: "Too many attempts. Take a short break and try again.",
});

authRouter.get("/register", (req, res) => {
  if (req.currentUser) return res.redirect(303, "/");
  return res.render("auth/register", { title: "Join the web", values: {}, error: null });
});

authRouter.post("/register", authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).render("auth/register", {
      title: "Join the web",
      values: {
        username: bodyString(req.body, "username"),
        displayName: bodyString(req.body, "displayName"),
      },
      error: firstError(parsed.error),
    });
  }

  try {
    const user = await createUser(parsed.data);
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.flash = { kind: "success", message: "Your corner of the web is live!" };
    return res.redirect(303, "/");
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).render("auth/register", {
        title: "Join the web",
        values: parsed.data,
        error: "That username is already taken.",
      });
    }
    throw error;
  }
});

authRouter.get("/login", (req, res) => {
  if (req.currentUser) return res.redirect(303, "/");
  return res.render("auth/login", { title: "Welcome back", values: {}, error: null });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  const user = parsed.success
    ? await authenticateUser(parsed.data.username, parsed.data.password)
    : null;

  if (!user) {
    return res.status(401).render("auth/login", {
      title: "Welcome back",
      values: { username: bodyString(req.body, "username") },
      error: "That username and password combination did not match.",
    });
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.flash = { kind: "success", message: `Welcome back, ${user.displayName}.` };
  return res.redirect(303, "/");
});

authRouter.post("/logout", async (req, res) => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
  res.clearCookie("dialup.sid");
  return res.redirect(303, "/");
});

function regenerateSession(req: Express.Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      req.session.csrfToken = randomBytes(32).toString("base64url");
      resolve();
    });
  });
}

function bodyString(body: unknown, key: string) {
  if (typeof body !== "object" || body === null || !(key in body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}
