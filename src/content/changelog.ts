export const changeKinds = ["added", "changed", "fixed", "security"] as const;

export type ChangeKind = (typeof changeKinds)[number];

export type ChangelogGroup = {
  kind: ChangeKind;
  label: string;
  items: readonly string[];
};

export type ChangelogRelease = {
  version: string;
  title: string;
  date: string;
  dateLabel: string;
  summary: string;
  groups: readonly ChangelogGroup[];
};

type SeedChangelogRelease = Omit<ChangelogRelease, "dateLabel"> & {
  version: `${number}.${number}.${number}`;
};

export const changeKindLabels: Record<ChangeKind, string> = {
  added: "New on the web",
  changed: "Polished pixels",
  fixed: "Bugs sent to /dev/null",
  security: "Under the hood",
};

export function formatReleaseDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function withReleaseDateLabel<T extends { date: string }>(release: T): T & { dateLabel: string } {
  return { ...release, dateLabel: formatReleaseDate(release.date) };
}

export function compareSemanticVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function defaultChangelogEditorGroups() {
  return changeKinds.map((kind) => ({
    kind,
    label: changeKindLabels[kind],
    itemsText: "",
  }));
}

export const seedChangelog = [
  {
    version: "0.5.0",
    title: "The webmaster desk is open",
    date: "2026-08-14",
    summary:
      "Release notes can now be filed from a private webmaster desk, so the archive can grow without hand-editing the source.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "A retro webmaster desk for drafting new semantic-version transmissions.",
          "Repeatable Added, Changed, Fixed, and Under the hood sections that keep the public changelog’s shape.",
          "Edit and delete controls that appear only for the webmaster.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "The public changelog now loads from the database after a one-time seed of the existing archive.",
          "The live page still uses the same layout, fade, and section language—only the filing method changed.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Webmaster access is granted from server configuration or a one-off CLI command, never from the public signup form.",
          "Changelog edits stay behind authentication, CSRF protection, and validated payloads.",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    title: "The changelog has entered the chat",
    date: "2026-08-14",
    summary:
      "A hand-curated release archive arrived so every new corner, creature, and quality-of-life improvement has a home.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "A dedicated, bookmarkable changelog with semantic versions and detailed release notes.",
          "An in-page version switcher with a soft fade transition and no full-page reload.",
          "Progressive disclosure that remains readable and navigable without client-side JavaScript.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "Added Changelog links to the primary navigation and footer without changing the existing page structure.",
          "Styled release notes for both the cozy light theme and neon after-dark theme.",
        ],
      },
    ],
  },
  {
    version: "0.3.1",
    title: "The monsters got a makeover",
    date: "2026-08-05",
    summary:
      "The after-dark decorations became clearer, friendlier, and more varied while keeping their handmade web charm.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "More original Halloween artwork, including alternate skulls, pumpkins, ghosts, tombstones, bats, and other spooky surprises.",
          "Stable per-post artwork variety and subtle cobweb details across the release.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "Refined decorative placement so artwork stays out of the reading path and scales cleanly across viewports.",
          "Slowed the visitor-counter reel for a more satisfying mechanical roll.",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    title: "After dark, the web gets weird",
    date: "2026-08-05",
    summary:
      "Dialup Diaries gained a neon, Halloween-inspired dark mode without changing the original daylight design.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "A system-aware light and dark theme with a persistent manual override.",
          "An accessible retro sun-and-moon switch with lightweight motion and synthesized switch sounds.",
          "Original line-art decorations and dark-mode-only post stamps.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "Added short View Transition crossfades with a reduced-motion fallback.",
          "Rethemed every existing surface, control, status, focus ring, and interaction for high-contrast dark mode.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Kept the feature dependency-free by using native browser APIs and the existing Motion mini bundle.",
          "Loaded the tiny theme bootstrap before CSS to prevent flashes of the incorrect theme.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    title: "Signs of life on the information superhighway",
    date: "2026-08-04",
    summary:
      "The community started feeling alive with presence indicators, friendlier registration, and a real visitor counter.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Activity-based online and offline indicators across posts, comments, and profiles.",
          "A privacy-preserving unique visitor counter with an animated six-digit reel.",
          "Available username suggestions when a requested handle is already taken.",
        ],
      },
      {
        kind: "fixed",
        label: "Bugs sent to /dev/null",
        items: [
          "Duplicate username registration now returns a helpful form error instead of the generic error page.",
          "Presence and visitor state refresh correctly when pages load.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Signed anonymous visitor tokens avoid collecting names, email addresses, or fingerprinting data.",
          "Atomic database updates prevent duplicate visitor counts during concurrent requests.",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    title: "A nostalgic blogging site is born!",
    date: "2026-08-01",
    summary:
      "The first usable Dialup Diaries release brought personal-homepage energy to a modern, lightweight social diary.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Secure account registration, sign-in, sign-out, sessions, and editable profile pages.",
          "A chronological timeline with posts, comments, likes, reposts, counts, and truncated long-form entries.",
          "Responsive server-rendered pages inspired by personal websites, web rings, guestbooks, and desktop windows.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Argon2id password hashing, CSRF protection, secure session cookies, rate limits, and hardened HTTP headers.",
          "Validated request payloads, parameterized PostgreSQL queries, and escaped server-rendered content.",
        ],
      },
    ],
  },
] as const satisfies readonly SeedChangelogRelease[];
