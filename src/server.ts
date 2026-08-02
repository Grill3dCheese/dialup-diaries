import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Dialup Diaries is online at http://localhost:${String(env.PORT)}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing connections.`);
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
