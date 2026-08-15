import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { users } from "../src/db/schema.js";

const tokens = process.argv.slice(2).filter((token) => token !== "--");
const revoke = tokens.includes("--revoke");
const username = tokens.find((token) => !token.startsWith("--"))?.trim().toLowerCase();

try {
  if (!username) {
    console.error("Usage: npm run db:promote-admin -- <username> [--revoke]");
    process.exitCode = 1;
  } else {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      console.error(`No account named @${username}.`);
      process.exitCode = 1;
    } else if (!revoke && user.isAdmin) {
      console.log(`@${user.username} is already a webmaster.`);
    } else if (revoke && !user.isAdmin) {
      console.log(`@${user.username} is not a webmaster.`);
    } else {
      await db.update(users).set({ isAdmin: !revoke }).where(eq(users.id, user.id));
      console.log(
        revoke
          ? `Revoked webmaster access from @${user.username}.`
          : `@${user.username} is now a webmaster.`,
      );
    }
  }
} finally {
  await pool.end();
}
