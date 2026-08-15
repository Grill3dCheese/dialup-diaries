import { Router, type Response } from "express";
import { defaultChangelogEditorGroups } from "../content/changelog.js";
import { requireAdmin, requireAuth } from "../middleware/web.js";
import {
  createChangelogRelease,
  deleteChangelogRelease,
  editorValuesFromRelease,
  getChangelogRelease,
  listChangelogReleases,
  updateChangelogRelease,
} from "../services/changelog.js";
import { isChangelogVersionConflict } from "../utils/database-errors.js";
import {
  changelogReleaseFromForm,
  firstError,
  parseChangelogFormBody,
  type ChangelogEditorValues,
} from "../utils/validation.js";

export const changelogRouter = Router();

changelogRouter.get("/changelog", async (_req, res) => {
  const releases = await listChangelogReleases();
  res.render("changelog", { title: "Changelog", releases });
});

changelogRouter.get("/changelog/new", requireAuth, requireAdmin, (_req, res) => {
  renderEditor(res, 200, {
    mode: "create",
    values: emptyEditorValues(),
    error: null,
    originalVersion: null,
  });
});

changelogRouter.post("/changelog", requireAuth, requireAdmin, async (req, res) => {
  const values = parseChangelogFormBody(req.body);
  const parsed = changelogReleaseFromForm(values);
  if (!parsed.success) {
    return renderEditor(res, 422, {
      mode: "create",
      values: withFallbackGroups(values),
      error: firstError(parsed.error),
      originalVersion: null,
    });
  }

  try {
    await createChangelogRelease({
      version: parsed.data.version,
      title: parsed.data.title,
      releasedOn: parsed.data.releasedOn,
      summary: parsed.data.summary,
      groups: parsed.data.groups.map((group) => ({
        kind: group.kind,
        label: group.label,
        items: [...group.items],
      })),
    });
  } catch (error) {
    if (isChangelogVersionConflict(error)) {
      return renderEditor(res, 409, {
        mode: "create",
        values: withFallbackGroups(values),
        error: "That version is already in the archives.",
        originalVersion: null,
      });
    }
    throw error;
  }

  req.session.flash = { kind: "success", message: "Transmission filed in the archives." };
  return res.redirect(303, `/changelog#${releaseAnchor(parsed.data.version)}`);
});

changelogRouter.get("/changelog/:version/edit", requireAuth, requireAdmin, async (req, res) => {
  const release = await getChangelogRelease(versionParam(req.params.version));
  if (!release) return renderChangelogNotFound(res);
  return renderEditor(res, 200, {
    mode: "edit",
    values: editorValuesFromRelease(release),
    error: null,
    originalVersion: release.version,
  });
});

changelogRouter.post("/changelog/:version/delete", requireAuth, requireAdmin, async (req, res) => {
  const deleted = await deleteChangelogRelease(versionParam(req.params.version));
  if (!deleted) return renderChangelogNotFound(res);
  req.session.flash = { kind: "success", message: "That transmission was removed from the archives." };
  return res.redirect(303, "/changelog");
});

changelogRouter.post("/changelog/:version", requireAuth, requireAdmin, async (req, res) => {
  const originalVersion = versionParam(req.params.version);
  const existing = await getChangelogRelease(originalVersion);
  if (!existing) return renderChangelogNotFound(res);

  const values = parseChangelogFormBody(req.body);
  const parsed = changelogReleaseFromForm(values);
  if (!parsed.success) {
    return renderEditor(res, 422, {
      mode: "edit",
      values: withFallbackGroups(values),
      error: firstError(parsed.error),
      originalVersion,
    });
  }

  try {
    const updated = await updateChangelogRelease(originalVersion, {
      version: parsed.data.version,
      title: parsed.data.title,
      releasedOn: parsed.data.releasedOn,
      summary: parsed.data.summary,
      groups: parsed.data.groups.map((group) => ({
        kind: group.kind,
        label: group.label,
        items: [...group.items],
      })),
    });
    if (!updated) return renderChangelogNotFound(res);
  } catch (error) {
    if (isChangelogVersionConflict(error)) {
      return renderEditor(res, 409, {
        mode: "edit",
        values: withFallbackGroups(values),
        error: "That version is already in the archives.",
        originalVersion,
      });
    }
    throw error;
  }

  req.session.flash = { kind: "success", message: "Release notes updated." };
  return res.redirect(303, `/changelog#${releaseAnchor(parsed.data.version)}`);
});

function emptyEditorValues(): ChangelogEditorValues {
  return {
    version: "",
    title: "",
    releasedOn: "",
    summary: "",
    groups: defaultChangelogEditorGroups().map((group) => ({
      kind: group.kind,
      label: group.label,
      items: [],
      itemsText: group.itemsText,
    })),
  };
}

function withFallbackGroups(values: ChangelogEditorValues) {
  if (values.groups.length > 0) return values;
  return { ...values, groups: emptyEditorValues().groups };
}

function renderEditor(
  res: Response,
  status: number,
  options: {
    mode: "create" | "edit";
    values: ChangelogEditorValues;
    error: string | null;
    originalVersion: string | null;
  },
) {
  return res.status(status).render("changelog-edit", {
    title: options.mode === "create" ? "File a transmission" : "Edit transmission",
    mode: options.mode,
    values: options.values,
    error: options.error,
    originalVersion: options.originalVersion,
  });
}

function renderChangelogNotFound(res: Response) {
  return res.status(404).render("errors/error", {
    title: "Page not found",
    status: 404,
    message: "That page drifted off the information superhighway.",
  });
}

function releaseAnchor(version: string) {
  return `release-${version.replaceAll(".", "-")}`;
}

function versionParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
