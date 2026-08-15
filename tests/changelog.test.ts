import { describe, expect, it } from "vitest";
import { changelog } from "../src/content/changelog.js";

describe("changelog content", () => {
  it("uses unique semantic versions in newest-first order", () => {
    const versions = changelog.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.every((version) => /^\d+\.\d+\.\d+$/.test(version))).toBe(true);
    expect(versions).toEqual([...versions].sort(compareVersions).reverse());
  });

  it("keeps every release detailed and machine-readable", () => {
    for (const release of changelog) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.summary.length).toBeGreaterThan(30);
      expect(release.groups.length).toBeGreaterThan(0);
      expect(release.groups.every((group) => group.items.length > 0)).toBe(true);
    }
  });
});

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
