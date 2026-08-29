import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
  // Production environments inject variables; a local .env file is optional.
}

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .url()
    .default("postgres://postgres:postgres@localhost:5432/dialup_diaries"),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-before-deploying"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
  ADMIN_USERNAMES: z.string().default(""),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error(
    "Invalid environment configuration",
    z.treeifyError(result.error),
  );
  process.exit(1);
}

if (
  result.data.NODE_ENV === "production" &&
  result.data.SESSION_SECRET.startsWith("development-")
) {
  throw new Error(
    "SESSION_SECRET must be set to a strong, unique value in production.",
  );
}

export const env = result.data;
export const isProduction = env.NODE_ENV === "production";

export type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export const vapidConfig = readVapidConfig(env.NODE_ENV);
export const vapidPublicKey = vapidConfig?.publicKey ?? null;

export function parseAdminUsernames(value: string) {
  return new Set(
    value
      .split(/[\s,]+/)
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
}

export const configuredAdminUsernames = parseAdminUsernames(
  env.ADMIN_USERNAMES,
);

function optionalEnv(name: string) {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isVapidKey(value: string) {
  return (
    value.length >= 20 &&
    value.length <= 200 &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value)
  );
}

function isVapidSubject(value: string) {
  if (value.startsWith("mailto:")) {
    const email = value.slice("mailto:".length).trim();
    return (
      email.length >= 3 &&
      email.length <= 254 &&
      /^[^\s@]+@[^\s@]+$/.test(email)
    );
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

function readVapidConfig(nodeEnv: string): VapidConfig | null {
  const publicKey = optionalEnv("VAPID_PUBLIC_KEY");
  const privateKey = optionalEnv("VAPID_PRIVATE_KEY");
  const subject = optionalEnv("VAPID_EMAIL_SUBJECT");
  const provided = [publicKey, privateKey, subject].filter(
    (value) => value !== undefined,
  ).length;

  if (provided === 0) {
    if (nodeEnv === "production") {
      throw new Error(
        "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL_SUBJECT must be set in production.",
      );
    }
    return null;
  }

  if (
    publicKey === undefined ||
    privateKey === undefined ||
    subject === undefined
  ) {
    throw new Error(
      "Incomplete VAPID configuration; set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL_SUBJECT together.",
    );
  }

  if (!isVapidKey(publicKey) || !isVapidKey(privateKey)) {
    throw new Error(
      "VAPID keys must be URL-safe Base64 strings from `npx web-push generate-vapid-keys`.",
    );
  }

  if (!isVapidSubject(subject)) {
    throw new Error(
      "VAPID_EMAIL_SUBJECT must be a mailto: address or https: contact URL.",
    );
  }

  return { publicKey, privateKey, subject };
}
