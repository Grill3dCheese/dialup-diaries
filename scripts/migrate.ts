import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/db/client.js";

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Database migrations are up to date.");
} finally {
  await pool.end();
}
