import { describe, expect, it } from "vitest";
import {
  compareSemanticVersions,
  formatReleaseDate,
  seedChangelog,
} from "../src/content/changelog.js";
import { changelogReleaseSchema } from "../src/utils/validation.js";

describe("changelog content", () => {
  it("uses unique semantic versions in newest-first order", () => {
    const versions = seedChangelog.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((version) => /^\d+\.\d+\.\d+$/.test(version))).toBe(
      true,
    );
    expect(versions).toEqual(
      [...versions].sort(compareSemanticVersions).reverse(),
    );
    expect(versions[0]).toBe("0.12.0");
  });

  it("keeps every release detailed and machine-readable", () => {
    for (const release of seedChangelog) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.summary.length).toBeGreaterThan(30);
      expect(release.groups.length).toBeGreaterThan(0);
      expect(release.groups.every((group) => group.items.length > 0)).toBe(
        true,
      );
    }
  });

  it("fits the filed-transmission schema so every seed note actually renders", () => {
    for (const release of seedChangelog) {
      const parsed = changelogReleaseSchema.safeParse({
        version: release.version,
        title: release.title,
        releasedOn: release.date,
        summary: release.summary,
        groups: release.groups.map((group) => ({
          kind: group.kind,
          label: group.label,
          items: [...group.items],
        })),
      });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("formats archive dates in UTC so the calendar day does not shift", () => {
    expect(formatReleaseDate("2026-08-14")).toBe("August 14, 2026");
    expect(formatReleaseDate("not-a-date")).toBe("not-a-date");
  });
});
