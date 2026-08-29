import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { socketService } from "./services/socketService.js";

const app = createApp();
const server = createServer(app);
socketService.initialize(server);

server.listen(env.PORT, () => {
  console.log(
    `Dialup Diaries is online at http://localhost:${String(env.PORT)}`,
  );
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`${signal} received; closing connections.`);
  socketService.close();
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

server.on("error", (error: Error) => {
  console.error("HTTP server error", error);
  shutdown("error");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
