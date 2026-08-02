import { hash } from "@node-rs/argon2";
import { count } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { comments, likes, posts, reposts, users } from "../src/db/schema.js";

const countResult = await db.select({ value: count() }).from(posts);
const postCount = countResult[0]?.value ?? 0;
if (postCount > 0) {
  console.log("Seed skipped: this database already has posts.");
  await pool.end();
  process.exit(0);
}

const passwordHash = await hash("DemoPassword123!", {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

const seededUsers = await db
  .insert(users)
  .values([
    {
      username: "pixelpoet",
      displayName: "Maya Chen",
      bio: "Poems, public transit observations, and aggressively organized bookmarks.",
      passwordHash,
    },
    {
      username: "nightowl",
      displayName: "Theo Brooks",
      bio: "Building tiny websites after midnight. Tea enthusiast.",
      passwordHash,
    },
    {
      username: "goodnews",
      displayName: "Sunny Alvarez",
      bio: "Collecting proof that people are mostly wonderful.",
      passwordHash,
    },
  ])
  .onConflictDoNothing()
  .returning();

if (seededUsers.length < 3) {
  throw new Error("Seed users already exist. Use a fresh database or add content manually.");
}

const [maya, theo, sunny] = seededUsers;
if (!maya || !theo || !sunny) throw new Error("Seed users were not created.");

const seededPosts = await db
  .insert(posts)
  .values([
    {
      authorId: maya.id,
      content:
        "Today I remembered that the best parts of the old internet weren't the loading times or glitter GIFs. It was the feeling that every page had a person behind it. A favorite color. A strange little obsession. A guestbook waiting to be signed.\n\nMaybe we can have that feeling again—just with better accessibility and fewer autoplaying MIDI files.",
    },
    {
      authorId: theo.id,
      content:
        "Built a tiny weather display for my desk. It has exactly three moods: ☀ nice, ☂ dramatic, and ☁ stay home and make soup. This is all the forecasting technology I need.",
    },
    {
      authorId: sunny.id,
      content:
        "Today's small good thing: the person ahead of me at the bakery paid for the last cinnamon roll, then split it with the stranger behind them. The world keeps leaving little notes for us.",
    },
  ])
  .returning();

const [mayaPost, theoPost, sunnyPost] = seededPosts;
if (!mayaPost || !theoPost || !sunnyPost) throw new Error("Seed posts were not created.");

await db.insert(comments).values([
  { postId: mayaPost.id, authorId: theo.id, body: "Personal pages forever. I miss weird little link lists most of all." },
  { postId: mayaPost.id, authorId: sunny.id, body: "Signing this guestbook with a very tasteful sparkle GIF ✨" },
]);
await db.insert(likes).values([
  { postId: mayaPost.id, userId: theo.id },
  { postId: mayaPost.id, userId: sunny.id },
  { postId: sunnyPost.id, userId: maya.id },
]);
await db.insert(reposts).values([
  { postId: mayaPost.id, userId: sunny.id },
  { postId: theoPost.id, userId: maya.id },
]);

console.log("Seed complete. Demo password for all accounts: DemoPassword123!");
await pool.end();
