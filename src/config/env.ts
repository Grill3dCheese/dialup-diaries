import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // Production environments inject variables; a local .env file is optional.
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url().default("postgres://postgres:postgres@localhost:5432/dialup_diaries"),
  SESSION_SECRET: z.string().min(32).default("development-only-secret-change-before-deploying"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration", z.treeifyError(result.error));
  process.exit(1);
}

if (result.data.NODE_ENV === "production" && result.data.SESSION_SECRET.startsWith("development-")) {
  throw new Error("SESSION_SECRET must be set to a strong, unique value in production.");
}

export const env = result.data;
export const isProduction = env.NODE_ENV === "production";
