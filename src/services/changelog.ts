import { eq } from "drizzle-orm";
import {
  compareSemanticVersions,
  seedChangelog,
  withReleaseDateLabel,
  type ChangelogRelease,
} from "../content/changelog.js";
import { db } from "../db/client.js";
import { changelogReleases, type StoredChangelogGroup } from "../db/schema.js";
import { changelogGroupsSchema } from "../utils/validation.js";

export async function listChangelogReleases() {
  const rows = await db.select().from(changelogReleases);
  return rows
    .map(toPublicRelease)
    .filter((release): release is ChangelogRelease => release !== null)
    .sort((left, right) =>
      compareSemanticVersions(right.version, left.version),
    );
}

export async function getChangelogRelease(version: string) {
  const [row] = await db
    .select()
    .from(changelogReleases)
    .where(eq(changelogReleases.version, version))
    .limit(1);
  return row ? toPublicRelease(row) : null;
}

export async function createChangelogRelease(input: {
  version: string;
  title: string;
  releasedOn: string;
  summary: string;
  groups: StoredChangelogGroup[];
}) {
  await db.insert(changelogReleases).values({
    version: input.version,
    title: input.title,
    releasedOn: input.releasedOn,
    summary: input.summary,
    groups: input.groups,
  });
}

export async function updateChangelogRelease(
  currentVersion: string,
  input: {
    version: string;
    title: string;
    releasedOn: string;
    summary: string;
    groups: StoredChangelogGroup[];
  },
) {
  const [updated] = await db
    .update(changelogReleases)
    .set({
      version: input.version,
      title: input.title,
      releasedOn: input.releasedOn,
      summary: input.summary,
      groups: input.groups,
      updatedAt: new Date(),
    })
    .where(eq(changelogReleases.version, currentVersion))
    .returning({ version: changelogReleases.version });

  return Boolean(updated);
}

export async function deleteChangelogRelease(version: string) {
  const [deleted] = await db
    .delete(changelogReleases)
    .where(eq(changelogReleases.version, version))
    .returning({ version: changelogReleases.version });

  return Boolean(deleted);
}

export async function seedChangelogIfEmpty() {
  const existing = await db
    .select({ version: changelogReleases.version })
    .from(changelogReleases);
  const existingVersions = new Set(existing.map((row) => row.version));
  const missing = seedChangelog.filter(
    (release) => !existingVersions.has(release.version),
  );
  if (missing.length === 0) return 0;

  await db.insert(changelogReleases).values(
    missing.map((release) => ({
      version: release.version,
      title: release.title,
      releasedOn: release.date,
      summary: release.summary,
      groups: release.groups.map((group) => ({
        kind: group.kind,
        label: group.label,
        items: [...group.items],
      })),
    })),
  );

  return missing.length;
}

export function editorValuesFromRelease(release: ChangelogRelease) {
  return {
    version: release.version,
    title: release.title,
    releasedOn: release.date,
    summary: release.summary,
    groups: release.groups.map((group) => ({
      kind: group.kind,
      label: group.label,
      items: [...group.items],
      itemsText: group.items.join("\n"),
    })),
  };
}

function toPublicRelease(
  row: typeof changelogReleases.$inferSelect,
): ChangelogRelease | null {
  const groups = changelogGroupsSchema.safeParse(row.groups);
  if (!groups.success) return null;
  return withReleaseDateLabel({
    version: row.version,
    title: row.title,
    date: row.releasedOn,
    summary: row.summary,
    groups: groups.data,
  });
}
