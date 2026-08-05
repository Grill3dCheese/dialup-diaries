import { hash, verify } from "@node-rs/argon2";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { buildUsernameCandidates } from "../utils/usernames.js";

const hashOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function createUser(input: {
  username: string;
  displayName: string;
  password: string;
}) {
  const passwordHash = await hash(input.password, hashOptions);
  const [user] = await db
    .insert(users)
    .values({
      username: input.username.toLowerCase(),
      displayName: input.displayName,
      passwordHash,
    })
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
    });

  if (!user) throw new Error("User creation did not return a record.");
  return user;
}

export async function authenticateUser(username: string, password: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);

  if (!user || !(await verify(user.passwordHash, password))) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
  };
}

export async function findSafeUserById(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
}

export async function touchUserPresence(userId: string) {
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
}

export async function getAvailableUsernameSuggestions(username: string) {
  const candidates = buildUsernameCandidates(username);
  if (candidates.length === 0) return [];

  const unavailable = await db
    .select({ username: users.username })
    .from(users)
    .where(inArray(users.username, candidates));
  const unavailableNames = new Set(unavailable.map((user) => user.username));

  return candidates.filter((candidate) => !unavailableNames.has(candidate)).slice(0, 6);
}
