import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/client/theme.js";

describe("theme preference resolution", () => {
  it("uses valid persisted preferences before the system setting", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system when no valid override exists", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("sepia", true)).toBe("dark");
  });
});
