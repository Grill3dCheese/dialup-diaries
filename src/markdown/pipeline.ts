import { Marked } from "marked";

export const MARKDOWN_BODY_CLASS = "markdown-body";

const HEADING_CAP = 3;
const RENDER_CACHE_LIMIT = 64;
const renderCache = new Map<string, string>();

export const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "h1",
    "h2",
    "h3",
    "p",
    "br",
    "hr",
    "ul",
    "ol",
    "li",
    "blockquote",
    "pre",
    "code",
    "strong",
    "em",
    "del",
    "s",
    "a",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  ALLOWED_ATTR: [
    "href",
    "title",
    "src",
    "alt",
    "target",
    "rel",
    "loading",
    "decoding",
    "referrerpolicy",
  ],
  ALLOWED_NAMESPACES: ["http://www.w3.org/1999/xhtml"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/|#)/i,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ADD_DATA_URI_TAGS: [],
  FORBID_TAGS: [
    "script",
    "iframe",
    "object",
    "embed",
    "style",
    "link",
    "meta",
    "base",
    "form",
    "input",
    "button",
    "textarea",
    "svg",
    "math",
    "video",
    "audio",
    "source",
    "picture",
  ],
  FORBID_ATTR: ["style", "srcdoc", "srcset", "xlink:href"],
  KEEP_CONTENT: true,
  SANITIZE_DOM: true,
  CUSTOM_ELEMENT_HANDLING: {
    tagNameCheck: null,
    attributeNameCheck: null,
    allowCustomizedBuiltInElements: false,
  },
};

export type SanitizeNode = {
  tagName: string;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

export type PurifyEngine = {
  setConfig: (config: typeof SANITIZE_CONFIG) => void;
  addHook: (
    name: "afterSanitizeAttributes",
    hook: (node: SanitizeNode) => void,
  ) => void;
  sanitize: (dirty: string) => unknown;
};

const configuredPurifiers = new WeakSet<object>();

const markdownParser = new Marked({
  async: false,
  gfm: true,
  breaks: true,
  silent: true,
  renderer: {
    html() {
      return "";
    },
    heading({ tokens, depth }) {
      const level = Math.min(Math.max(depth, 1), HEADING_CAP);
      const text = this.parser.parseInline(tokens);
      return `<h${String(level)}>${text}</h${String(level)}>\n`;
    },
  },
});

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function fallbackMarkdownHtml(source: string) {
  if (!source) return "";
  return `<p>${escapeHtml(source).replaceAll("\n", "<br>")}</p>`;
}

export function isAllowedHref(value: string | null | undefined) {
  if (!value) return false;
  return protocolOf(value, ["http:", "https:", "mailto:"]) !== null;
}

export function isAllowedImageSrc(value: string | null | undefined) {
  if (!value) return false;
  return protocolOf(value, ["http:", "https:"]) !== null;
}

export function isExternalHttpUrl(value: string) {
  const protocol = protocolOf(value, ["http:", "https:"]);
  return protocol === "http:" || protocol === "https:";
}

export function hardenSanitizedElement(node: SanitizeNode) {
  const tag = node.tagName.toUpperCase();
  if (tag === "A") {
    const href = node.getAttribute("href");
    if (!isAllowedHref(href)) {
      node.removeAttribute("href");
      node.removeAttribute("target");
      node.removeAttribute("rel");
      return;
    }
    if (href && isExternalHttpUrl(href)) {
      node.setAttribute("rel", "noopener noreferrer nofollow");
      node.setAttribute("target", "_blank");
    } else {
      node.removeAttribute("target");
      node.removeAttribute("rel");
    }
    return;
  }
  if (tag === "IMG") {
    const src = node.getAttribute("src");
    if (!isAllowedImageSrc(src)) {
      node.removeAttribute("src");
    }
    node.setAttribute("loading", "lazy");
    node.setAttribute("decoding", "async");
    node.setAttribute("referrerpolicy", "no-referrer");
    if (!node.getAttribute("alt")) {
      node.setAttribute("alt", "");
    }
  }
}

export function bindMarkdownPurify(purify: PurifyEngine) {
  if (configuredPurifiers.has(purify)) return purify;
  configuredPurifiers.add(purify);
  purify.setConfig(SANITIZE_CONFIG);
  purify.addHook("afterSanitizeAttributes", hardenSanitizedElement);
  return purify;
}

export function createMarkdownRenderer(purify: PurifyEngine) {
  bindMarkdownPurify(purify);

  return function renderMarkdown(source: unknown) {
    if (typeof source !== "string" || source.length === 0) return "";
    const cached = renderCache.get(source);
    if (cached !== undefined) return cached;

    let html = fallbackMarkdownHtml(source);
    try {
      const parsed = markdownParser.parse(source, { async: false });
      if (typeof parsed === "string") {
        const clean = purify.sanitize(parsed);
        if (typeof clean === "string") {
          html = clean;
        }
      }
    } catch {
      html = fallbackMarkdownHtml(source);
    }

    rememberRender(source, html);
    return html;
  };
}

export function setMarkdownContent(
  element: { innerHTML: string; textContent: string | null },
  source: unknown,
  renderMarkdown: (value: unknown) => string,
) {
  try {
    element.innerHTML = renderMarkdown(source);
  } catch {
    element.textContent = typeof source === "string" ? source : "";
  }
}

function rememberRender(source: string, html: string) {
  renderCache.set(source, html);
  if (renderCache.size <= RENDER_CACHE_LIMIT) return;
  const oldest = renderCache.keys().next().value;
  if (oldest !== undefined) renderCache.delete(oldest);
}

function hasUnsafeChars(value: string) {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function protocolOf(value: string, allowed: readonly string[]) {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.includes("\\") ||
    trimmed.startsWith("//") ||
    hasUnsafeChars(trimmed)
  ) {
    return null;
  }
  try {
    if (
      trimmed.startsWith("/") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("?")
    ) {
      new URL(trimmed, "https://dialup.invalid");
      return "relative:";
    }
    const parsed = new URL(trimmed);
    if (!allowed.includes(parsed.protocol)) return null;
    return parsed.protocol;
  } catch {
    return null;
  }
}
