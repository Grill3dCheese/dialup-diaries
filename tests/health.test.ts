import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/client.js";

describe("health check", () => {
  it("reports that the process is available without exposing internals", async () => {
    const response = await request(createApp()).get("/healthz");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

afterAll(async () => {
  await pool.end();
});
