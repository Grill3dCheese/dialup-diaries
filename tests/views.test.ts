import path from "node:path";
import ejs from "ejs";
import { describe, expect, it } from "vitest";
import {
  seedChangelog,
  withReleaseDateLabel,
} from "../src/content/changelog.js";

const views = path.resolve("src/views");
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "pixelpoet",
  displayName: "Maya Chen",
  bio: "Poems and bookmarks.",
  isOnline: false,
  createdAt: new Date("2024-01-01T12:00:00Z"),
};
const post = {
  id: "00000000-0000-4000-8000-000000000002",
  content: "Hello from my corner of the web.",
  createdAt: new Date("2026-01-01T12:00:00Z"),
  eventAt: new Date("2026-01-01T12:00:00Z"),
  authorId: user.id,
  authorUsername: user.username,
  authorDisplayName: user.displayName,
  authorIsOnline: false,
  reposterUsername: null,
  reposterDisplayName: null,
  likeCount: 2,
  repostCount: 1,
  commentCount: 1,
  likedByViewer: true,
  repostedByViewer: false,
};
const common = {
  csrfToken: "test-token",
  currentUser: user,
  path: "/",
  flash: null,
  year: 2026,
  initials: (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join(""),
  formatDate: () => "Jan 1, 12:00 PM",
};

describe("server-rendered pages", () => {
  it("renders every primary page with escaped, complete HTML", async () => {
    const pages = await Promise.all([
      render("home.ejs", {
        ...common,
        title: "Timeline",
        posts: [post],
        visitorCount: 42,
        composeError: null,
      }),
      render("posts/show.ejs", {
        ...common,
        title: "Post",
        post,
        comments: [
          {
            id: "1",
            body: "Hi!",
            createdAt: new Date(),
            username: user.username,
            displayName: user.displayName,
            isOnline: true,
          },
        ],
        error: null,
      }),
      render("profiles/show.ejs", {
        ...common,
        title: "Profile",
        user,
        posts: [post],
        error: null,
      }),
      render("auth/login.ejs", {
        ...common,
        currentUser: null,
        title: "Login",
        values: {},
        error: null,
      }),
      render("auth/register.ejs", {
        ...common,
        currentUser: null,
        title: "Register",
        values: {},
        error: null,
        suggestions: ["pixelpoet123", "pixel_poet"],
      }),
      render("changelog.ejs", {
        ...common,
        path: "/changelog",
        title: "Changelog",
        releases: seedChangelog.map(withReleaseDateLabel),
      }),
      render("changelog-edit.ejs", {
        ...common,
        currentUser: { ...user, isAdmin: true },
        path: "/changelog/new",
        title: "File a transmission",
        mode: "create",
        originalVersion: null,
        error: null,
        values: {
          version: "0.5.0",
          title: "The webmaster desk is open",
          releasedOn: "2026-08-14",
          summary: "A short postcard from this release.",
          groups: [
            {
              kind: "added",
              label: "New on the web",
              itemsText: "A webmaster desk",
            },
          ],
        },
      }),
      render("errors/error.ejs", {
        ...common,
        title: "Missing",
        status: 404,
        message: "Not found",
      }),
    ]);

    for (const html of pages) {
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("Dialup Diaries");
      expect(html).toContain('<script src="/theme-init.js"></script>');
      expect(html).toContain("data-theme-toggle");
      expect(html).toContain('aria-label="Toggle color theme"');
      expect(html).toContain("data-push-toggle");
      expect(html).toContain("PAGER OFF");
      expect(html).toContain("data-pager-hint");
      expect(html).toContain('rel="manifest"');
      expect(html).toContain("/art/pumpkin-face5-white.svg");
      expect(html).toContain("/art/spiderweb-white.svg");
      expect(html.indexOf("/theme-init.js")).toBeLessThan(
        html.indexOf("/styles/main.css"),
      );
      expect(html).toContain("</html>");
    }
    expect(pages.join("")).toContain("presence-dot--online");
    expect(pages.join("")).toContain("presence-dot--offline");
    expect(pages[0]).toContain('data-count="42"');
    expect(pages[0]).toContain("0 0 0 0 4 2");
    expect(pages[0]).toContain("pager.exe");
    expect(pages[0]).toContain("data-feed");
    expect(pages[0]).toContain('data-signed-in="true"');
    expect(pages[0]).toContain("data-live-pill");
    expect(pages[0]).toContain("data-feed-live");
    expect(pages[0]).toContain(
      'data-post-id="00000000-0000-4000-8000-000000000002"',
    );
    expect(pages[0]).toMatch(
      /data-halloween-art="(?:pumpkin|skull|skull-white|ghost|tombstone|witch-hat|cauldron|bats)"/,
    );
    expect(pages[5]).toContain("version_picker.exe");
    expect(pages[5]).toContain("data-changelog-release");
    expect(pages[5]).toContain("Version 0.4.0");
    expect(pages[5]).toContain("Version 0.5.0");
    expect(pages[5]).toContain("Version 0.6.0");
    expect(pages[5]).toContain("Version 0.7.0");
    expect(pages[5]).toContain("Version 0.8.0");
    expect(pages[5]).toContain("ONLINE · READ ONLY");
    expect(pages[5]).not.toContain("File a new transmission");
    expect(pages[5]).not.toContain("webmaster_desk.exe");
    expect(pages[6]).toContain("webmaster_desk.exe");
    expect(pages[6]).toContain("File a new transmission");
    expect(pages[6]).toContain('name="groupKind"');
    expect(pages[6]).toContain("New on the web");
  });

  it("shows webmaster controls only to admins and an empty archive message", async () => {
    const [adminChangelog, emptyChangelog] = await Promise.all([
      render("changelog.ejs", {
        ...common,
        currentUser: { ...user, isAdmin: true },
        path: "/changelog",
        title: "Changelog",
        releases: seedChangelog.map(withReleaseDateLabel),
      }),
      render("changelog.ejs", {
        ...common,
        path: "/changelog",
        title: "Changelog",
        releases: [],
      }),
    ]);

    expect(adminChangelog).toContain("ONLINE · WEBMASTER");
    expect(adminChangelog).toContain("File a new transmission");
    expect(adminChangelog).toContain("/changelog/0.5.0/edit");
    expect(emptyChangelog).toContain("No transmissions archived yet.");
    expect(emptyChangelog).toContain("Nothing filed yet.");
  });

  it("exposes the VAPID public key only when the pager is configured", async () => {
    const [withoutKey, withKey] = await Promise.all([
      render("home.ejs", {
        ...common,
        title: "Timeline",
        posts: [post],
        visitorCount: 1,
        composeError: null,
      }),
      render("home.ejs", {
        ...common,
        vapidPublicKey: "B".repeat(87),
        title: "Timeline",
        posts: [post],
        visitorCount: 1,
        composeError: null,
      }),
    ]);

    expect(withoutKey).not.toContain("vapid-public-key");
    expect(withKey).toContain('meta name="vapid-public-key" content="');
    expect(withKey).toContain("B".repeat(87));
  });
});

function render(template: string, data: Record<string, unknown>) {
  return ejs.renderFile(path.join(views, template), data);
}
