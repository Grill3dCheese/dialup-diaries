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

  it("serves the public changelog from the archive", async () => {
    const response = await request(createApp()).get("/changelog");
    expect(response.status).toBe(200);
    expect(response.text).toContain("What’s new on the web?");
    expect(response.text).toContain("Version 0.4.0");
    expect(response.text).toContain("Version 0.5.0");
    expect(response.text).toContain("ONLINE · READ ONLY");
    expect(response.text).not.toContain("File a new transmission");
  });

  it("keeps the webmaster desk behind a sign-in", async () => {
    const response = await request(createApp()).get("/changelog/new");
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe("/login");
  });
});

afterAll(async () => {
  await pool.end();
});
