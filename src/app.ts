import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import connectPgSimple from "connect-pg-simple";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import session from "express-session";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { env, isProduction } from "./config/env.js";
import { pool } from "./db/client.js";
import { csrfProtection, webLocals } from "./middleware/web.js";
import { authRouter } from "./routes/auth.js";
import { changelogRouter } from "./routes/changelog.js";
import { siteRouter } from "./routes/site.js";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const logger = pino({
  level: isProduction ? "info" : "debug",
  redact: ["req.headers.cookie", "req.headers.authorization"],
});

export function createApp() {
  const app = express();
  const PgSession = connectPgSimple(session);

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.set("view engine", "ejs");
  app.set("views", path.join(rootDirectory, "src", "views"));

  app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers["x-request-id"];
        const id = typeof existing === "string" ? existing : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
    }),
  );
  if (process.env.NODE_ENV === "development") {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        strictTransportSecurity: false,
      }),
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );
  }
  app.use(compression());
  app.use(
    "/",
    express.static(path.join(rootDirectory, "public"), {
      immutable: false,
      maxAge: isProduction ? "1h" : 0,
      index: false,
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "16kb" }));
  app.use(express.json({ limit: "16kb" }));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    session({
      name: "dialup.sid",
      store: new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: false,
        pruneSessionInterval: 60 * 15,
      }),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    }),
  );
  app.use(webLocals);
  app.use(csrfProtection);
  app.use(authRouter);
  app.use(changelogRouter);
  app.use(siteRouter);

  app.use((_req, res) => {
    res.status(404).render("errors/error", {
      title: "Page not found",
      status: 404,
      message: "That page drifted off the information superhighway.",
    });
  });

  app.use(
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      req.log.error({ err: error }, "Unhandled request error");
      if (res.headersSent) return;
      res.status(500).render("errors/error", {
        title: "Something went wrong",
        status: 500,
        message:
          "The modem made a strange noise. Please try again in a moment.",
      });
    },
  );

  return app;
}
