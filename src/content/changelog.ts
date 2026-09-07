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

export function withReleaseDateLabel<T extends { date: string }>(
  release: T,
): T & { dateLabel: string } {
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
    version: "0.12.1",
    title: "Idle lines hang up on their own",
    date: "2026-09-06",
    summary:
      "Signed-in visits now time out if you wander off, so a forgotten tab does not stay logged in forever. Keep using the guestbook and you stay on the line; step away for a while and you may need to knock again.",
    groups: [
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "If you leave Dialup Diaries unattended for a while, you may be asked to sign in again when you come back. Active browsing still keeps the handshake alive.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Signed-in sessions now expire after a stretch of inactivity instead of lingering indefinitely.",
          "Leftover sessions are cleaned up automatically so abandoned logins do not pile up on the server.",
        ],
      },
    ],
  },
  {
    version: "0.12.0",
    title: "Ctrl+Enter hangs up the form",
    date: "2026-08-31",
    summary:
      "If you are already typing in a form, Ctrl+Enter (or ⌘ Enter on a Mac) now submits it the same way the real Submit button would. Enter by itself still makes a new line in Markdown. Sign out and delete stay off the shortcut on purpose.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Sign in, register, the timeline composer, guestbook replies, your profile, and the webmaster desk can all be sent with Ctrl+Enter or ⌘ Enter while the cursor is in a field.",
          "The shortcut presses the form’s normal primary button. Validation, loading, CSRF, flashes, and Socket.io behavior are the same as a click.",
          "The composer and guestbook show a tiny [Ctrl] + [Enter] keycap hint next to Publish and Sign the guestbook. On a Mac the first key reads ⌘. Pocket-sized and touch-first screens hide the hint so it does not clutter the footer.",
        ],
      },
      {
        kind: "added",
        label: "How to drive the handshake",
        items: [
          "Focus a field in the form you mean to send, then hold Control (Windows/Linux) or Command (Mac) and press Enter. The form attached to that field is the only one that submits—never the first form on the page, and never a reply next door.",
          "In a textarea, including format.exe, a plain Enter still starts a new line. Ctrl+Enter or ⌘ Enter is what sends. Cursor position, a selection, and a multi-line draft do not change that.",
          "If a required field is empty, the shortcut shows the same browser message as clicking Submit. It does not invent a second validation path.",
          "format.exe stays out of the way: Bold, Italic, and the other toolbar buttons still drop in Markdown. Write still writes. Preview still previews. Focusing a toolbar button, a Write/Preview tab, or the Preview pane does not submit the form.",
          "Holding the shortcut does not fire three requests. A disabled Submit button still means the form is not available.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "The keycaps use the same inset/outset chrome as the rest of the 1990s desk—small Courier labels, not a modern shortcut overlay.",
          "Clicking Submit, tabbing to the button, and pressing Enter in a single-line field all still work. The shortcut is extra, not a replacement.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "One document keydown listener watches for the combo after page load, so a guestbook form that appears later still inherits it. There is no per-form listener to leak.",
          "The listener asks the focused control for its native form, then calls requestSubmit on that form’s primary Submit button. form.submit() is not used, so HTML constraint validation and existing submit handlers still run.",
          "Sign out, Delete this post, and Delete this transmission are excluded. The shortcut will not pick a destructive button just because it is nearby.",
          "Alt and Shift stay out of the combo so an AltGr Enter on an international keyboard is not stolen. The keys that decide the shortcut are the browser’s ctrlKey and metaKey, not a user-agent guess.",
        ],
      },
    ],
  },
  {
    version: "0.11.0",
    title: "format.exe is online",
    date: "2026-08-30",
    summary:
      "Posts and guestbook replies can now be written in Markdown. A tiny format.exe toolbar sits on the composer—Write, Preview, and a row of chunky buttons—while the original source is still what gets saved. Existing notes, including ones that arrive live, render the same way. Raw HTML and sneaky scripts do not.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "The timeline composer and every guestbook reply now open with format.exe: a Write tab, a Preview tab, and a compact row of formatting buttons.",
          "Preview paints a live rendering of the current draft. Switching tabs never mutates what you typed, and an empty box says so instead of inventing content.",
          "Posts and guestbook entries already in the archive now render as Markdown—headings, lists, quotes, code, links, and images—without turning a short diary note into a magazine spread.",
          "Fresh posts and guestbook signatures that arrive while you are watching still go through the same renderer. A live insert is not trusted just because it came from our socket.",
        ],
      },
      {
        kind: "added",
        label: "How to drive format.exe",
        items: [
          "format.exe is nostalgic chrome around a normal textarea, not a what-you-see-is-what-you-get editor. You still write Markdown; the buttons drop in the punctuation, then hand the cursor back so you can keep typing.",
          "WRITE is the drafting tab. Everything typed there is the source that gets published and stored. PREVIEW shows a sanitized rendering of that draft without changing a single character of it.",
          "Click a button with a selection to wrap or prefix those words. With nothing selected, a placeholder is inserted and highlighted so you can type over it immediately. Keyboard and mouse both work; hover is never required.",
          "B (Bold) wraps the selection in **double asterisks**, like **this**. Click B again on already-bold text to unwrap it.",
          "I (Italic) wraps the selection in *single asterisks*, like *this*. Same toggle: click I again to peel the markers off.",
          "S (Strikethrough) wraps the selection in ~~tildes~~, like ~~this~~. Handy for a crossed-out afterthought you still want people to read.",
          "H (Heading) prefixes the current line with # and a space. Select several lines to mark them all. Click H again to remove the hashes. Deeper headings (##, ###) can be typed by hand.",
          "• (Bullet list) prefixes each selected line with a dash and a space. Blank lines in the selection are left alone. Click it again to remove those dashes. Nested bullets are typed with spaces, not this button.",
          "1. (Numbered list) prefixes selected lines with 1. 2. 3. in order. Click again to remove the numbers. Nested numbering is also typed with leading spaces, not this button.",
          "“ (Quote) prefixes each selected line with > and a space. A nested quote is >> typed by hand. Click the button again to unwrap.",
          "</> (Inline code) wraps the selection in single backticks, like `this`. Best for a short command, handle, or filename inside a sentence.",
          "{ } (Code block) wraps the selection in a fenced block: three backticks on the line above and the line below. Long snippets scroll inside the box. The code is shown, never run.",
          "URL (Link) turns the selection into [selected text](https://example.com) and highlights the address so you can paste a real one. If the selection already looks like a URL, it becomes [link text](that-url) and highlights the words instead.",
          "— (Horizontal rule) inserts a --- divider with blank lines around it. Useful for splitting a long note into scenes without starting a new post.",
          "CLR (Clear formatting) peels Markdown markers off the selection only—asterisks, hashes, list prefixes, fences, and link wrappers—leaving the plain words. It never touches the rest of the draft.",
          "If Preview hiccups, hop back to Write. The draft is still there, cursor and all. Publishing always sends the Write-tab Markdown, never the generated HTML.",
        ],
      },
      {
        kind: "added",
        label: "Markdown, if you like",
        items: [
          "A single Enter becomes a line break inside a paragraph, which is handy for a short stanza. A blank line starts a new paragraph. Leave a blank line before and after a list if the next paragraph should sit outside it.",
          "Headings: start a line with # and a space for the largest title, ## for a section, ### for a subsection. Deeper hashes still work, but they are capped at ### size so a diary note does not become a billboard.",
          "Emphasis stacks. **bold**, *italic*, and ~~struck~~ can nest, like ***bold italic***, and they work the same way inside a list item or a quote.",
          "Nested bullets: put two or more spaces in front of the dash so the item becomes a child of the line above. Write - chores then, on the next line, two spaces, a dash, a space, and laundry. That laundry line hangs under chores.",
          "Nested numbers work the same way: two or more spaces before 1. nests that item. Mix them freely—a numbered list can hold indented dashes, and a dashed list can hold indented 1. 2. 3. children.",
          "Deeper nests need more indent. A child of a two-space item usually wants four spaces, and so on. The bullet and number buttons always prefix at the current line; type the extra spaces yourself when you want a sub-list.",
          "Links look like [visible words](https://example.com). Images look like ![a short description](https://example.com/cat.gif). Only http and https pictures load; they shrink to fit and never stretch the page sideways.",
          "Quotes start with > and a space at the beginning of the line. Nested quotes use >>. A quote can contain lists, links, and emphasis, so a cited recipe or lyric can still be structured.",
          "Inline code uses one backtick on each side. A fenced block uses three backticks on their own lines around the snippet. You can label the opening fence (for example ```js) for your own notes; the site still just displays the text.",
          "Tables use pipes: a header row, a separator row of dashes, then the data. A wide table scrolls inside the post instead of shoving the timeline sideways.",
          "Type HTML if you want, but it will not render. Tags, scripts, iframes, and javascript: links are stripped so a guestbook cannot execute code in someone else's browser.",
          "Long URLs wrap instead of stretching the page. Huge images shrink. A very long code line scrolls inside its box. The surrounding post chrome stays put.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "The composer is still a textarea. format.exe is a small piece of late-90s web chrome—chunky buttons, a window title, Write and Preview tabs—not a modern rich-text ribbon.",
          "Long posts still tuck behind Read the rest, but the fold is visual now so a heading or list is not sliced in half mid-marker.",
          "On a pocket-sized screen the toolbar wraps onto extra rows instead of overflowing. Touch targets stay chunky; the preview box stays inside the post.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "PostgreSQL still stores the original Markdown. Generated HTML is never the canonical copy, so a later render can always start from the source.",
          "One pipeline serves first paint, Preview, and live Socket.io inserts: parse with marked, sanitize with DOMPurify, then put only the cleaned HTML in the page.",
          "Raw HTML inside Markdown is discarded at parse time. Scripts, iframes, event handlers, javascript: and data: URLs, and SVG tricks are stripped by an allowlist sanitizer.",
          "External links open in a new tab with rel noopener noreferrer nofollow. Images only load from http or https, lazily, and without sending a referrer.",
          "If parsing fails, the note falls back to escaped plain text. The feed does not crash, and unsanitized HTML never reaches the DOM.",
        ],
      },
    ],
  },
  {
    version: "0.10.0",
    title: "The counters learned to travel in packs",
    date: "2026-08-29",
    summary:
      "Likes, reposts, and guestbook replies now tick live across open tabs—without asking the socket to shout about every single click.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Like, repost, and reply counts update on other open tabs without a refresh.",
          "New guestbook entries appear at the top of the thread as soon as someone signs.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "A count that actually changes gets a short pop animation; off-screen posts skip the flourish so the page stays calm while you scroll.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Like, repost, and reply totals are stored as atomic counters on each post, so the timeline does not recount from scratch on every load.",
          "Socket broadcasts for those counters wait two seconds, then go out as one compact batch instead of an event per click.",
          "Guestbook text still broadcasts immediately, because handwritten replies are rare compared with button clicks.",
          "A server restart drops the in-memory batch buffer; PostgreSQL still holds the real totals.",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    title: "The notices learned to hang up",
    date: "2026-08-29",
    summary:
      "Success notes, errors, and pager alerts now fade themselves away on a countdown—and they wait politely if your cursor is still reading.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Every flash notice carries a thin countdown bar along its bottom edge and dismisses itself when the bar runs out.",
          "Hovering a notice freezes the countdown so you can finish reading; moving away lets it continue from the same moment.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "Success messages, system warnings, and pager errors now share the same auto-dismiss lifestyle instead of one-off timers.",
          "Technical errors linger a little longer than ordinary notices so there is time to read lock-icon instructions.",
        ],
      },
      {
        kind: "fixed",
        label: "Bugs sent to /dev/null",
        items: [
          "After a hover-pause, the countdown bar no longer snaps back to its frozen width while the notice fades away.",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    title: "The icon keeps score",
    date: "2026-08-29",
    summary:
      "The Home Screen icon can now keep a running tally of guestbook pages you missed, and it clears itself when you come back.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Each pager ding can set a Home Screen badge with the number of notifications this device missed while you were away.",
          "Opening Dialup Diaries from that icon, or bringing a backgrounded app back to the front, clears the badge.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Each active push subscription stores a missed-notification count that increments when a new post is pushed.",
          "The service worker reads that integer from the push payload and updates the OS badge, falling back to 1 if the payload is corrupt.",
          "Coming back to the app clears the operating-system badge and tells PostgreSQL this device has been seen, so the missed count returns to zero.",
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    title: "You've got pager",
    date: "2026-08-15",
    summary:
      "The guestbook can now ding this machine when a new diary entry hits the timeline—even if the tab is closed.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "A pager.exe toggle opts this browser into Web Push dings for new timeline entries.",
          "Dialup Diaries can live on the Home Screen as a standalone app, which is how a pocket computer is allowed to ring.",
        ],
      },
      {
        kind: "changed",
        label: "Polished pixels",
        items: [
          "The pager sits in the status strip and as a retro sidebar card without crowding the reading path.",
          "iPhone Safari explains that the pager only wakes up after you add the site to Home Screen and open that icon.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "Push subscriptions are stored per device in PostgreSQL, with VAPID keys kept on the server.",
          "Only known push service hosts are accepted, and dead endpoints deactivate instead of retrying forever.",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    title: "The timeline learned to breathe",
    date: "2026-08-15",
    summary:
      "New diary entries now appear at the top of the feed while you watch, so the guestbook no longer waits for a refresh.",
    groups: [
      {
        kind: "added",
        label: "New on the web",
        items: [
          "Fresh posts slide onto the live timeline as soon as they are published.",
          "The LIVE indicator keeps its pulse while the socket stays connected.",
        ],
      },
      {
        kind: "security",
        label: "Under the hood",
        items: [
          "A dedicated Socket.io service broadcasts a sanitized payload after PostgreSQL commits the post.",
          "The socket handshake stays cookie-aware and isolated from the Express routes, so a noisy socket cannot roll back a successful publish.",
        ],
      },
    ],
  },
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
