import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/client.js";

describe("push notification routes", () => {
  it("rejects subscribe without a CSRF token", async () => {
    const response = await request(createApp())
      .post("/api/notifications/subscribe")
      .set("Accept", "application/json")
      .send({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { p256dh: "abc", auth: "def" },
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Your session expired. Refresh and try again.",
    });
  });

  it("rejects an SSRF-prone subscribe payload after CSRF succeeds", async () => {
    const agent = request.agent(createApp());
    const loginPage = await agent.get("/login");
    const token = csrfToken(loginPage.text);
    const response = await agent
      .post("/api/notifications/subscribe")
      .set("Accept", "application/json")
      .set("x-csrf-token", token)
      .send({
        endpoint: "http://127.0.0.1:1/",
        keys: { p256dh: "p256dh-key-value", auth: "auth-secret" },
        platform: "chrome",
      });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: "That push endpoint is not allowed.",
    });
  });

  it("rejects unsubscribe without an endpoint", async () => {
    const agent = request.agent(createApp());
    const loginPage = await agent.get("/login");
    const token = csrfToken(loginPage.text);
    const response = await agent
      .post("/api/notifications/unsubscribe")
      .set("Accept", "application/json")
      .set("x-csrf-token", token)
      .send({ endpoint: "" });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: "That subscription looks invalid.",
    });
  });

  it("rejects anonymous badge-clear without a device endpoint", async () => {
    const agent = request.agent(createApp());
    const loginPage = await agent.get("/login");
    const token = csrfToken(loginPage.text);
    const response = await agent
      .post("/api/notifications/read")
      .set("Accept", "application/json")
      .set("x-csrf-token", token)
      .send({});

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: "Include this device's push endpoint to clear its badge.",
    });
  });

  it("clears a device badge when a push endpoint is provided", async () => {
    const agent = request.agent(createApp());
    const loginPage = await agent.get("/login");
    const token = csrfToken(loginPage.text);
    const response = await agent
      .post("/api/notifications/read")
      .set("Accept", "application/json")
      .set("x-csrf-token", token)
      .send({
        endpoint: "https://fcm.googleapis.com/fcm/send/badge-clear-test",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

afterAll(async () => {
  await pool.end();
});

function csrfToken(html: string) {
  const match = /<meta name="csrf-token" content="([^"]+)"/.exec(html);
  if (!match?.[1]) {
    throw new Error("Expected a CSRF token in the login page.");
  }
  return match[1];
}
