import { describe, expect, it } from "vitest";
import { commentSchema, postSchema, registerSchema } from "../src/utils/validation.js";

describe("input validation", () => {
  it("normalizes valid registration input", () => {
    const result = registerSchema.parse({
      username: "  pixel_poet  ",
      displayName: "  Maya  ",
      password: "CorrectHorse42",
    });
    expect(result.username).toBe("pixel_poet");
    expect(result.displayName).toBe("Maya");
  });

  it("rejects weak passwords and unsafe usernames", () => {
    expect(
      registerSchema.safeParse({
        username: "<script>",
        displayName: "Someone",
        password: "password",
      }).success,
    ).toBe(false);
  });

  it("enforces post and comment limits", () => {
    expect(postSchema.safeParse({ content: "x".repeat(5001) }).success).toBe(false);
    expect(commentSchema.safeParse({ body: "x".repeat(1001) }).success).toBe(false);
    expect(postSchema.parse({ content: "  hello web  " }).content).toBe("hello web");
  });
});
