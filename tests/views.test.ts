import path from "node:path";
import ejs from "ejs";
import { describe, expect, it } from "vitest";
import { changelog } from "../src/content/changelog.js";

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
      render("profiles/show.ejs", { ...common, title: "Profile", user, posts: [post], error: null }),
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
        releases: changelog,
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
      expect(html).toContain('data-theme-toggle');
      expect(html).toContain('aria-label="Toggle color theme"');
      expect(html).toContain('/art/pumpkin-face5-white.svg');
      expect(html).toContain('/art/spiderweb-white.svg');
      expect(html.indexOf("/theme-init.js")).toBeLessThan(html.indexOf("/styles/main.css"));
      expect(html).toContain("</html>");
    }
    expect(pages.join("")).toContain("presence-dot--online");
    expect(pages.join("")).toContain("presence-dot--offline");
    expect(pages[0]).toContain('data-count="42"');
    expect(pages[0]).toContain("0 0 0 0 4 2");
    expect(pages[0]).toMatch(/data-halloween-art="(?:pumpkin|skull|skull-white|ghost|tombstone|witch-hat|cauldron|bats)"/);
    expect(pages[5]).toContain("version_picker.exe");
    expect(pages[5]).toContain('data-changelog-release');
    expect(pages[5]).toContain("Version 0.4.0");
  });
});

function render(template: string, data: Record<string, unknown>) {
  return ejs.renderFile(path.join(views, template), data);
}
