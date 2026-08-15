import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db/client.js";
import { seedChangelogIfEmpty } from "../src/services/changelog.js";

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  const seeded = await seedChangelogIfEmpty();
  if (seeded > 0) {
    console.log(`Seeded ${String(seeded)} changelog transmissions.`);
  }
  console.log("Database migrations are up to date.");
} finally {
  await pool.end();
}
