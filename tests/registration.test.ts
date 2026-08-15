import { describe, expect, it } from "vitest";
import { isChangelogVersionConflict, isUsernameConflict } from "../src/utils/database-errors.js";
import { buildUsernameCandidates } from "../src/utils/usernames.js";

describe("duplicate username registration", () => {
  it("recognizes a unique violation wrapped by the database query layer", () => {
    const error = {
      cause: {
        code: "23505",
        constraint: "users_username_lower_idx",
      },
    };

    expect(isUsernameConflict(error)).toBe(true);
    expect(isUsernameConflict({ cause: { code: "23503" } })).toBe(false);
    expect(
      isUsernameConflict({
        cause: { code: "23505", constraint: "some_other_unique_constraint" },
      }),
    ).toBe(false);
    expect(
      isChangelogVersionConflict({
        cause: { code: "23505", constraint: "changelog_releases_version_idx" },
      }),
    ).toBe(true);
    expect(
      isChangelogVersionConflict({
        cause: { code: "23505", constraint: "users_username_lower_idx" },
      }),
    ).toBe(false);
  });

  it("creates nostalgic, valid variations of the requested username", () => {
    const suggestions = buildUsernameCandidates("fatalError");

    expect(suggestions).toEqual(
      expect.arrayContaining(["fatal_error", "fatalerr0r", "fatalerror0", "fatalerror123"]),
    );
    expect(new Set(suggestions).size).toBe(suggestions.length);
    expect(suggestions.every((username) => /^[a-z0-9_]{3,24}$/.test(username))).toBe(true);
  });
});
