import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeThemePreference, resolveTheme } from "../src/client/theme.js";

describe("theme preference resolution", () => {
  it("uses valid persisted preferences before the system setting", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system when no valid override exists", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("sepia", true)).toBe("dark");
  });
});

describe("theme preference normalization", () => {
  it("keeps explicit light, dark, and system values", () => {
    expect(normalizeThemePreference("light")).toBe("light");
    expect(normalizeThemePreference("dark")).toBe("dark");
    expect(normalizeThemePreference("system")).toBe("system");
  });

  it("defaults missing or unknown values to system", () => {
    expect(normalizeThemePreference(null)).toBe("system");
    expect(normalizeThemePreference("")).toBe("system");
    expect(normalizeThemePreference("sepia")).toBe("system");
  });
});

describe("theme switch sounds", () => {
  it("ships the light, system, and dark MP3 assets", () => {
    for (const file of ["lightTheme.mp3", "systemTheme.mp3", "darkTheme.mp3"]) {
      expect(existsSync(path.resolve("public/sounds", file))).toBe(true);
    }
  });
});
