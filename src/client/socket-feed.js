import { io } from "socket.io-client";

export const BLOG_POST_CREATED = "BLOG_POST_CREATED";

const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
  if (feed.querySelector(`[data-post-id="${CSS.escape(payload.id)}"]`)) {
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

export function initSocketFeed() {
  const feed = document.querySelector("[data-feed]");
  if (!feed) return null;

  const socket = io({
    path: "/socket.io",
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 700,
    reconnectionDelayMax: 8000,
  });

  socket.on(BLOG_POST_CREATED, (payload) => {
    insertBlogPost(feed, payload);
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

  if (!signedIn) {
    const link = document.createElement("a");
    link.className = className;
    link.href = "/login";
    link.setAttribute("aria-label", `Sign in to ${kind}`);
    appendActionParts(
      link,
      kind === "like" ? likeIconPath : repostIconPath,
      verb,
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
  );
  return button;
}

function appendActionParts(parent, path, verb) {
  const icon = document.createElement("span");
  icon.className = "action-icon";
  icon.append(svgIcon(path));
  const count = document.createElement("span");
  count.className = "action-count";
  count.textContent = "0";
  const label = document.createElement("span");
  label.className = "action-label";
  label.textContent = verb;
  parent.append(icon, count, label);
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
