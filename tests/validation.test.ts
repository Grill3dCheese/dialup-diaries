import { describe, expect, it } from "vitest";
import { parseAdminUsernames } from "../src/config/env.js";
import {
  changelogReleaseFromForm,
  commentSchema,
  parseChangelogFormBody,
  postSchema,
  registerSchema,
} from "../src/utils/validation.js";

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

  it("parses repeated changelog group fields from a simple form body", () => {
    const values = parseChangelogFormBody({
      version: " 0.5.0 ",
      title: "The webmaster desk is open",
      releasedOn: "2026-08-14",
      summary: "Release notes can now be filed without editing source.",
      groupKind: ["added", "fixed"],
      groupLabel: ["New on the web", "Bugs sent to /dev/null"],
      groupItems: ["A webmaster desk\nRepeatable sections", "  "],
    });

    const parsed = changelogReleaseFromForm(values);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.version).toBe("0.5.0");
    expect(parsed.data.groups).toEqual([
      {
        kind: "added",
        label: "New on the web",
        items: ["A webmaster desk", "Repeatable sections"],
      },
    ]);
  });

  it("accepts a single changelog section as a string instead of an array", () => {
    const parsed = changelogReleaseFromForm(
      parseChangelogFormBody({
        version: "0.5.1",
        title: "A tiny follow-up",
        releasedOn: "2026-08-14",
        summary: "One section still files correctly from a simple form.",
        groupKind: "changed",
        groupLabel: "Polished pixels",
        groupItems: "Kept the public changelog looking the same.",
      }),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.groups).toHaveLength(1);
    expect(parsed.data.groups[0]?.kind).toBe("changed");
  });

  it("rejects unsafe changelog versions and empty archives", () => {
    expect(
      changelogReleaseFromForm(
        parseChangelogFormBody({
          version: "v1",
          title: "Nope",
          releasedOn: "2026-08-14",
          summary: "This should not save.",
          groupKind: "added",
          groupLabel: "New on the web",
          groupItems: "A note",
        }),
      ).success,
    ).toBe(false);
    expect(
      changelogReleaseFromForm(
        parseChangelogFormBody({
          version: "0.5.0",
          title: "Empty sections",
          releasedOn: "2026-08-14",
          summary: "This should not save either.",
          groupKind: "added",
          groupLabel: "New on the web",
          groupItems: "   ",
        }),
      ).success,
    ).toBe(false);
  });

  it("reads webmaster usernames from a comma or space separated list", () => {
    expect([...parseAdminUsernames(" Keith, PixelPoet  nightowl")]).toEqual([
      "keith",
      "pixelpoet",
      "nightowl",
    ]);
    expect(parseAdminUsernames("").size).toBe(0);
  });
});
