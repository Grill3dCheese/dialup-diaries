import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVisitorToken, readVisitorId } from "../src/utils/visitor-token.js";

describe("anonymous visitor tokens", () => {
  const secret = "a-test-secret-that-is-long-enough-to-sign-tokens";

  it("round-trips a server-issued visitor identifier", () => {
    const visitorId = randomUUID();
    const token = createVisitorToken(visitorId, secret);

    expect(readVisitorId(token, secret)).toBe(visitorId);
  });

  it("rejects modified and incorrectly signed tokens", () => {
    const token = createVisitorToken(randomUUID(), secret);

    expect(readVisitorId(`${token}tampered`, secret)).toBeNull();
    expect(readVisitorId(token, `${secret}-wrong`)).toBeNull();
    expect(readVisitorId("not-a-visitor-token", secret)).toBeNull();
  });
});
