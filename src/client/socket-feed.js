import { io } from "socket.io-client";

export const BLOG_POST_CREATED = "BLOG_POST_CREATED";
export const BATCH_COUNTER_UPDATES = "BATCH_COUNTER_UPDATES";
export const GUESTBOOK_ENTRY_CREATED = "GUESTBOOK_ENTRY_CREATED";
const LOCAL_DELTA_TTL_MS = 3_000;
const localCounterDeltas = new Map();

const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const counterKinds = new Set(["like", "retweet", "reply"]);
const counterAriaLabels = {
  like: (count) => `${count} likes`,
  retweet: (count) => `${count} reposts`,
  reply: (count) => `${count} comments`,
};
const halloweenArtOptions = [
  "pumpkin",
  "skull",
  "skull-white",
  "ghost",
  "tombstone",
  "witch-hat",
  "cauldron",
  "bats",
];
const commentIconPath =
  "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z";
const repostIconPath =
  "m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3";
const likeIconPath =
  "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z";

function escapeSelector(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function isBlogPostPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof value.id === "string" &&
    uuidPattern.test(value.id) &&
    typeof value.content === "string" &&
    value.content.length > 0 &&
    value.content.length <= 5000 &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.authorId === "string" &&
    typeof value.authorUsername === "string" &&
    usernamePattern.test(value.authorUsername) &&
    typeof value.authorDisplayName === "string" &&
    value.authorDisplayName.trim().length > 0 &&
    value.authorDisplayName.length <= 50
  );
}

export function isCounterUpdatePayload(value) {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof value.targetId === "string" &&
    uuidPattern.test(value.targetId) &&
    typeof value.type === "string" &&
    counterKinds.has(value.type) &&
    typeof value.newCount === "number" &&
    Number.isInteger(value.newCount) &&
    value.newCount >= 0 &&
    value.newCount <= Number.MAX_SAFE_INTEGER
  );
}

export function isBatchCounterUpdateItem(value) {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof value.targetId === "string" &&
    uuidPattern.test(value.targetId) &&
    isIntegerDelta(value.likesDelta) &&
    isIntegerDelta(value.retweetsDelta) &&
    isIntegerDelta(value.repliesDelta)
  );
}

export function isBatchCounterUpdatesPayload(value) {
  return Array.isArray(value) && value.every(isBatchCounterUpdateItem);
}

export function isGuestbookEntryPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof value.entryId === "string" &&
    uuidPattern.test(value.entryId) &&
    typeof value.postId === "string" &&
    uuidPattern.test(value.postId) &&
    typeof value.authorName === "string" &&
    value.authorName.trim().length > 0 &&
    value.authorName.length <= 50 &&
    typeof value.authorUsername === "string" &&
    usernamePattern.test(value.authorUsername) &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= 1000 &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt))
  );
}

export function halloweenArtForPostId(postId) {
  let hash = 0;
  for (const character of postId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return halloweenArtOptions[hash % halloweenArtOptions.length] ?? "pumpkin";
}

export function initialsFromName(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatPostDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function createLivePostCard(payload, signedIn) {
  const article = document.createElement("article");
  article.className = "post-card";
  article.id = `${payload.id}-live`;
  article.dataset.postId = payload.id;
  article.dataset.halloweenArt = halloweenArtForPostId(payload.id);

  const profileHref = `/u/${payload.authorUsername}`;
  const postHref = `/posts/${payload.id}`;
  const displayName = payload.authorDisplayName.trim();

  const main = document.createElement("div");
  main.className = "post-main";

  const avatar = document.createElement("a");
  avatar.className = "avatar";
  avatar.href = profileHref;
  avatar.setAttribute("aria-label", `${displayName}'s profile`);
  const avatarLabel = document.createElement("span");
  avatarLabel.textContent = initialsFromName(displayName) || "?";
  const presence = document.createElement("i");
  presence.className = "presence-dot presence-dot--online";
  presence.setAttribute("role", "img");
  presence.setAttribute("aria-label", `${displayName} is online`);
  presence.title = "Online now";
  avatar.append(avatarLabel, presence);

  const body = document.createElement("div");
  body.className = "post-body";

  const header = document.createElement("header");
  header.className = "post-meta";
  const names = document.createElement("div");
  const displayLink = document.createElement("a");
  displayLink.className = "display-name";
  displayLink.href = profileHref;
  displayLink.textContent = displayName;
  const usernameLink = document.createElement("a");
  usernameLink.className = "username";
  usernameLink.href = profileHref;
  usernameLink.textContent = `@${payload.authorUsername}`;
  names.append(displayLink, usernameLink);
  const timeLink = document.createElement("a");
  timeLink.className = "post-time";
  timeLink.href = postHref;
  timeLink.textContent = formatPostDate(payload.createdAt);
  header.append(names, timeLink);

  const content = document.createElement("div");
  content.className = "post-content";
  content.dataset.expandable = "";
  appendPostContent(content, payload.content);

  const actions = document.createElement("footer");
  actions.className = "post-actions";
  actions.setAttribute("aria-label", "Post actions");
  actions.append(
    createCommentAction(postHref),
    createReactionAction("repost", payload.id, signedIn),
    createReactionAction("like", payload.id, signedIn),
  );

  body.append(header, content, actions);
  main.append(avatar, body);
  article.append(main);
  return article;
}

export function insertBlogPost(feed, payload) {
  if (!feed || !isBlogPostPayload(payload)) return false;
  if (feed.querySelector(`[data-post-id="${escapeSelector(payload.id)}"]`)) {
    return false;
  }

  const signedIn = feed.dataset.signedIn === "true";
  const wrapper = document.createElement("div");
  wrapper.className = "feed-incoming";
  wrapper.dataset.feedIncoming = "";
  wrapper.append(createLivePostCard(payload, signedIn));

  feed.querySelector(".empty-state")?.remove();
  feed.prepend(wrapper);

  const live = document.querySelector("[data-feed-live]");
  if (live) {
    live.textContent = `New diary entry from ${payload.authorDisplayName.trim()}`;
  }
  return true;
}

export function applyCounterUpdate(payload, root) {
  if (!isCounterUpdatePayload(payload)) return false;
  const scope = root ?? globalThis.document;
  const counters = findCounters(scope, payload.targetId, payload.type);
  if (counters.length === 0) return false;

  let changed = false;
  for (const node of counters) {
    if (
      writeCountToNode(node, payload.type, payload.newCount, {
        pulseOnIncrease: true,
        pulseOnChange: false,
      })
    ) {
      changed = true;
    }
  }

  if (payload.type === "reply") {
    syncGuestbookCountLabel(scope, payload.targetId, payload.newCount);
  }

  return changed || counters.length > 0;
}

export function applyBatchCounterUpdates(payload, root) {
  if (!isBatchCounterUpdatesPayload(payload)) return false;
  const scope = root ?? globalThis.document;
  if (!scope?.querySelectorAll) return false;

  let applied = false;
  for (const item of payload) {
    if (applyCounterDeltas(item, scope)) applied = true;
  }
  return applied;
}

export function noteLocalCounterDelta(targetId, type, delta) {
  if (typeof targetId !== "string" || !counterKinds.has(type)) return;
  const amount = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  if (amount === 0) return;

  const key = pendingKey(targetId, type);
  const existing = localCounterDeltas.get(key);
  localCounterDeltas.set(key, {
    delta: (existing?.delta ?? 0) + amount,
    expiresAt: Date.now() + LOCAL_DELTA_TTL_MS,
  });
}

export function resetLocalCounterDeltas() {
  localCounterDeltas.clear();
}

export function applyGuestbookEntry(guestbook, payload, root) {
  if (!isGuestbookEntryPayload(payload)) return false;
  const inserted = insertGuestbookEntry(guestbook, payload);
  noteLocalCounterDelta(payload.postId, "reply", 1);
  if (inserted || !guestbook) {
    writeCounterDelta(payload.postId, "reply", 1, root ?? globalThis.document);
  }
  return inserted;
}

export function insertGuestbookEntry(guestbook, payload) {
  if (!guestbook || !isGuestbookEntryPayload(payload)) return false;
  if (guestbook.dataset.postId !== payload.postId) return false;

  const list = guestbook.querySelector("[data-guestbook-list]");
  if (!list) return false;
  if (
    list.querySelector(`[data-entry-id="${escapeSelector(payload.entryId)}"]`)
  ) {
    return false;
  }

  list.querySelector(".empty-state")?.remove();
  list.prepend(createLiveGuestbookEntry(payload));
  return true;
}

export function initSocketFeed() {
  const feed = document.querySelector("[data-feed]");
  const guestbook = document.querySelector("[data-guestbook]");
  const hasLiveSurface = document.querySelector(
    "[data-post-id], [data-counter]",
  );
  if (!feed && !guestbook && !hasLiveSurface) return null;

  const socket = io({
    path: "/socket.io",
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 700,
    reconnectionDelayMax: 8000,
  });

  socket.on(BLOG_POST_CREATED, (payload) => {
    try {
      if (feed) insertBlogPost(feed, payload);
    } catch {
      // Keep the tab alive if a single payload is malformed.
    }
  });
  socket.on(BATCH_COUNTER_UPDATES, (payload) => {
    try {
      applyBatchCounterUpdates(payload);
    } catch {
      // Counter sync must never take down the rest of the page.
    }
  });
  socket.on(GUESTBOOK_ENTRY_CREATED, (payload) => {
    try {
      applyGuestbookEntry(guestbook, payload);
    } catch {
      // Guestbook inject is best-effort.
    }
  });

  const livePill = document.querySelector("[data-live-pill]");
  const liveText = livePill?.querySelector(".live-pill-text");
  socket.on("connect", () => {
    livePill?.classList.add("is-connected");
    livePill?.classList.remove("is-waiting");
    if (liveText) liveText.textContent = "LIVE";
  });
  socket.on("disconnect", () => {
    livePill?.classList.remove("is-connected");
    livePill?.classList.add("is-waiting");
    if (liveText) liveText.textContent = "DIALING";
  });

  return socket;
}

function appendPostContent(container, content) {
  if (content.length <= 420) {
    const span = document.createElement("span");
    span.textContent = content;
    container.append(span);
    return;
  }

  const short = document.createElement("span");
  short.dataset.short = "";
  short.textContent = `${content.slice(0, 420).trimEnd()}…`;
  const full = document.createElement("span");
  full.dataset.full = "";
  full.hidden = true;
  full.textContent = content;
  const readMore = document.createElement("button");
  readMore.className = "read-more";
  readMore.type = "button";
  readMore.setAttribute("aria-expanded", "false");
  readMore.textContent = "Read the rest";
  container.append(short, full, readMore);
}

function createCommentAction(postHref) {
  const link = document.createElement("a");
  link.className = "action action--comment";
  link.href = `${postHref}#comments`;
  link.setAttribute("aria-label", "0 comments");
  const icon = document.createElement("span");
  icon.className = "action-icon";
  icon.append(svgIcon(commentIconPath));
  const count = document.createElement("span");
  count.className = "action-count";
  count.dataset.counter = "reply";
  count.textContent = "0";
  const label = document.createElement("span");
  label.className = "action-label";
  label.textContent = "Reply";
  link.append(icon, count, label);
  return link;
}

function createReactionAction(kind, postId, signedIn) {
  const className = `action action--${kind}`;
  const countLabel = kind === "like" ? "likes" : "reposts";
  const verb = kind === "like" ? "Like" : "Repost";
  const counterType = kind === "like" ? "like" : "retweet";

  if (!signedIn) {
    const link = document.createElement("a");
    link.className = className;
    link.href = "/login";
    link.setAttribute("aria-label", `Sign in to ${kind}`);
    appendActionParts(
      link,
      kind === "like" ? likeIconPath : repostIconPath,
      verb,
      counterType,
    );
    return link;
  }

  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.reaction = kind;
  button.dataset.postId = postId;
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", `0 ${countLabel}`);
  appendActionParts(
    button,
    kind === "like" ? likeIconPath : repostIconPath,
    verb,
    counterType,
  );
  return button;
}

function appendActionParts(parent, path, verb, counterType) {
  const icon = document.createElement("span");
  icon.className = "action-icon";
  icon.append(svgIcon(path));
  const count = document.createElement("span");
  count.className = "action-count";
  count.dataset.counter = counterType;
  count.textContent = "0";
  const label = document.createElement("span");
  label.className = "action-label";
  label.textContent = verb;
  parent.append(icon, count, label);
}

function createLiveGuestbookEntry(payload) {
  const article = document.createElement("article");
  article.className = "comment is-live-entry";
  article.dataset.entryId = payload.entryId;

  const displayName = payload.authorName.trim();
  const profileHref = `/u/${payload.authorUsername}`;

  const avatar = document.createElement("a");
  avatar.className = "avatar";
  avatar.href = profileHref;
  const avatarLabel = document.createElement("span");
  avatarLabel.textContent = initialsFromName(displayName) || "?";
  const presence = document.createElement("i");
  presence.className = "presence-dot presence-dot--online";
  presence.setAttribute("role", "img");
  presence.setAttribute("aria-label", `${displayName} is online`);
  presence.title = "Online now";
  avatar.append(avatarLabel, presence);

  const body = document.createElement("div");
  const header = document.createElement("header");
  const nameLink = document.createElement("a");
  nameLink.href = profileHref;
  const strong = document.createElement("strong");
  strong.textContent = displayName;
  nameLink.append(strong);
  const username = document.createElement("span");
  username.textContent = `@${payload.authorUsername}`;
  const time = document.createElement("time");
  time.dateTime = payload.createdAt;
  time.textContent = formatPostDate(payload.createdAt);
  header.append(nameLink, username, time);

  const message = document.createElement("p");
  message.textContent = payload.message;
  body.append(header, message);
  article.append(avatar, body);
  return article;
}

function pulseCounter(node, type) {
  if (typeof node.classList?.add !== "function") return;
  node.classList.remove(
    "is-live-tick",
    "is-live-tick--like",
    "is-live-tick--retweet",
    "is-live-tick--reply",
  );
  void node.offsetWidth;
  node.classList.add("is-live-tick", `is-live-tick--${type}`);
  if (typeof node.addEventListener !== "function") return;
  node.addEventListener(
    "animationend",
    () => {
      node.classList.remove("is-live-tick", `is-live-tick--${type}`);
    },
    { once: true },
  );
}

function isIntegerDelta(value) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= Number.MIN_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function pendingKey(targetId, type) {
  return `${targetId}:${type}`;
}

function takePendingLocalDelta(targetId, type) {
  const key = pendingKey(targetId, type);
  const existing = localCounterDeltas.get(key);
  if (!existing) return 0;
  localCounterDeltas.delete(key);
  if (Date.now() > existing.expiresAt) return 0;
  return existing.delta;
}

function findCounters(scope, targetId, type) {
  if (!scope?.querySelectorAll) return [];
  return [
    ...scope.querySelectorAll(
      `[data-post-id="${escapeSelector(targetId)}"] [data-counter="${type}"]`,
    ),
  ];
}

function applyCounterDeltas(item, scope) {
  let applied = false;
  if (applyKindDelta(item.targetId, "like", item.likesDelta, scope)) {
    applied = true;
  }
  if (applyKindDelta(item.targetId, "retweet", item.retweetsDelta, scope)) {
    applied = true;
  }
  if (applyKindDelta(item.targetId, "reply", item.repliesDelta, scope)) {
    applied = true;
  }
  return applied;
}

function applyKindDelta(targetId, type, delta, scope) {
  const pending = delta === 0 ? 0 : takePendingLocalDelta(targetId, type);
  const net = delta - pending;
  if (net === 0) return false;
  return writeCounterDelta(targetId, type, net, scope);
}

function writeCounterDelta(targetId, type, delta, scope) {
  const counters = findCounters(scope, targetId, type);
  if (counters.length === 0) return false;

  let changed = false;
  let lastCount = null;
  for (const node of counters) {
    const previous = Number.parseInt(node.textContent ?? "", 10);
    const base = Number.isFinite(previous) ? previous : 0;
    const nextCount = clampReplyCount(
      scope,
      targetId,
      type,
      Math.max(0, base + delta),
    );
    if (
      writeCountToNode(node, type, nextCount, {
        pulseOnIncrease: false,
        pulseOnChange: true,
      })
    ) {
      changed = true;
    }
    lastCount = nextCount;
  }

  if (type === "reply" && lastCount !== null) {
    syncGuestbookCountLabel(scope, targetId, lastCount);
  }

  return changed || counters.length > 0;
}

function writeCountToNode(node, type, nextCount, pulse) {
  const previous = Number.parseInt(node.textContent ?? "", 10);
  const nextLabel = String(nextCount);
  const changed = node.textContent !== nextLabel;
  if (changed) {
    node.textContent = nextLabel;
  }

  const action = node.closest?.(".action");
  const aria = action?.getAttribute("aria-label") ?? "";
  if (action && !aria.startsWith("Sign in")) {
    action.setAttribute("aria-label", counterAriaLabels[type](nextCount));
  }

  const shouldPulse =
    changed &&
    isNodeVisible(node) &&
    ((pulse.pulseOnChange && nextCount !== previous) ||
      (pulse.pulseOnIncrease &&
        Number.isFinite(previous) &&
        nextCount > previous));
  if (shouldPulse) {
    pulseCounter(node, type);
  }

  return changed;
}

function clampReplyCount(scope, targetId, type, nextCount) {
  if (type !== "reply" || typeof scope.querySelector !== "function") {
    return nextCount;
  }
  const guestbook = scope.querySelector(
    `[data-guestbook][data-post-id="${escapeSelector(targetId)}"]`,
  );
  const list = guestbook?.querySelector?.("[data-guestbook-list]");
  if (!list?.querySelectorAll) return nextCount;
  const listCount = list.querySelectorAll("[data-entry-id]").length;
  if (listCount > 0 && nextCount > listCount) {
    return listCount;
  }
  return nextCount;
}

function syncGuestbookCountLabel(scope, targetId, count) {
  const guestbook = scope.querySelector?.(
    `[data-guestbook][data-post-id="${escapeSelector(targetId)}"]`,
  );
  const label = guestbook?.querySelector("[data-guestbook-count-label]");
  if (label) {
    label.textContent = count === 1 ? "reply" : "replies";
  }
}

function isNodeVisible(node) {
  const host = node.closest?.("[data-post-id]") ?? node;
  if (typeof host.checkVisibility === "function") {
    try {
      return host.checkVisibility();
    } catch {
      return true;
    }
  }
  return true;
}

function svgIcon(pathD) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.append(path);
  return svg;
}
