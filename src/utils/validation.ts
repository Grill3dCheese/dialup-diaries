import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores."),
  displayName: z.string().trim().min(1, "Display name is required.").max(50),
  password: z
    .string()
    .min(12, "Use at least 12 characters for your password.")
    .max(128)
    .regex(/[a-z]/, "Add a lowercase letter for your password.")
    .regex(/[A-Z]/, "Add an uppercase letter for your password.")
    .regex(/[0-9]/, "Add a number for your password."),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(24),
  password: z.string().min(1).max(128),
});

export const postSchema = z.object({
  content: z.string().trim().min(1, "Write something first.").max(5000, "Posts are limited to 5,000 characters."),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Your comment is empty.").max(1000),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  bio: z.string().trim().max(280),
});

export const changelogGroupSchema = z.object({
  kind: z.enum(["added", "changed", "fixed", "security"]),
  label: z.string().trim().min(1, "Each section needs a heading.").max(60),
  items: z
    .array(z.string().trim().min(1).max(400, "Keep each note under 400 characters."))
    .min(1, "Add at least one bullet in each section.")
    .max(20, "Each section can hold 20 notes."),
});

export const changelogGroupsSchema = z
  .array(changelogGroupSchema)
  .min(1, "Add at least one section.")
  .max(8, "Eight sections is the maximum.");

export const changelogReleaseSchema = z.object({
  version: z
    .string()
    .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Use a semantic version like 0.5.0."),
  title: z.string().trim().min(1, "Give this release a title.").max(120),
  releasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a release date."),
  summary: z.string().trim().min(12, "Write a short summary.").max(600),
  groups: changelogGroupsSchema,
});

export type ChangelogEditorGroup = {
  kind: string;
  label: string;
  items: string[];
  itemsText: string;
};

export type ChangelogEditorValues = {
  version: string;
  title: string;
  releasedOn: string;
  summary: string;
  groups: ChangelogEditorGroup[];
};

export function parseChangelogFormBody(body: unknown): ChangelogEditorValues {
  const record = isRecord(body) ? body : {};
  const kinds = asStringArray(record.groupKind);
  const labels = asStringArray(record.groupLabel);
  const itemBlocks = asStringArray(record.groupItems);
  const count = Math.max(kinds.length, labels.length, itemBlocks.length);
  const groups: ChangelogEditorGroup[] = [];

  for (let index = 0; index < count; index += 1) {
    const itemsText = itemBlocks[index] ?? "";
    groups.push({
      kind: (kinds[index] ?? "").trim(),
      label: (labels[index] ?? "").trim(),
      items: itemsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
      itemsText,
    });
  }

  return {
    version: typeof record.version === "string" ? record.version.trim() : "",
    title: typeof record.title === "string" ? record.title.trim() : "",
    releasedOn: typeof record.releasedOn === "string" ? record.releasedOn.trim() : "",
    summary: typeof record.summary === "string" ? record.summary.trim() : "",
    groups,
  };
}

export function changelogReleaseFromForm(values: ChangelogEditorValues) {
  return changelogReleaseSchema.safeParse({
    version: values.version,
    title: values.title,
    releasedOn: values.releasedOn,
    summary: values.summary,
    groups: values.groups
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        kind: group.kind,
        label: group.label,
        items: group.items,
      })),
  });
}

export function firstError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check your input.";
}

function asStringArray(value: unknown) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
