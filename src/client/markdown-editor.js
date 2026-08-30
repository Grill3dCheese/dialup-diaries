import { MARKDOWN_BODY_CLASS } from "../markdown/pipeline.js";
import { setMarkdownContent } from "./markdown.js";

const enhancedEditors = new WeakSet();
let editorObserver = null;
let editorEventsBound = false;

export const MARKDOWN_COMMANDS = [
  { cmd: "bold", glyph: "B", label: "Bold", hint: "Wrap with **asterisks**" },
  { cmd: "italic", glyph: "I", label: "Italic", hint: "Wrap with *asterisks*" },
  {
    cmd: "strike",
    glyph: "S",
    label: "Strikethrough",
    hint: "Wrap with ~~tildes~~",
  },
  {
    cmd: "heading",
    glyph: "H",
    label: "Heading",
    hint: "Prefix the line with #",
  },
  {
    cmd: "ul",
    glyph: "•",
    label: "Bullet list",
    hint: "Prefix lines with a dash",
  },
  {
    cmd: "ol",
    glyph: "1.",
    label: "Numbered list",
    hint: "Prefix lines with 1.",
  },
  { cmd: "quote", glyph: "“", label: "Quote", hint: "Prefix lines with >" },
  {
    cmd: "code",
    glyph: "</>",
    label: "Inline code",
    hint: "Wrap with backticks",
  },
  {
    cmd: "codeblock",
    glyph: "{ }",
    label: "Code block",
    hint: "Wrap in a fenced code block",
  },
  {
    cmd: "link",
    glyph: "URL",
    label: "Link",
    hint: "Turn the selection into a link",
  },
  { cmd: "hr", glyph: "—", label: "Horizontal rule", hint: "Insert a divider" },
  {
    cmd: "clear",
    glyph: "CLR",
    label: "Clear formatting",
    hint: "Strip Markdown markers from the selection",
  },
];

export function applyMarkdownCommand(textarea, command) {
  if (!textarea || typeof textarea.value !== "string") return false;
  const applied = runCommand(textarea, command);
  if (!applied) return false;
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export function enhanceMarkdownEditor(textarea) {
  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !textarea.matches("textarea[data-md-editor]") ||
    enhancedEditors.has(textarea) ||
    textarea.closest("[data-md-editor-host]")
  ) {
    return false;
  }

  const host = document.createElement("div");
  host.className = "md-editor";
  host.dataset.mdEditorHost = "";
  if (textarea.hasAttribute("data-composer")) {
    host.classList.add("md-editor--composer");
  }

  const chrome = document.createElement("div");
  chrome.className = "md-chrome";
  chrome.append(buildToolbar(), buildTabs(textarea));

  const write = document.createElement("div");
  write.className = "md-write";
  write.dataset.mdPanel = "write";
  write.setAttribute("role", "tabpanel");
  write.id = panelId(textarea, "write");
  write.setAttribute("aria-labelledby", tabId(textarea, "write"));

  const preview = document.createElement("div");
  preview.className = "md-preview";
  preview.dataset.mdPanel = "preview";
  preview.setAttribute("role", "tabpanel");
  preview.id = panelId(textarea, "preview");
  preview.setAttribute("aria-labelledby", tabId(textarea, "preview"));
  preview.hidden = true;
  preview.tabIndex = 0;

  const previewBody = document.createElement("div");
  previewBody.className = `${MARKDOWN_BODY_CLASS} md-preview__body`;
  previewBody.dataset.mdPreviewBody = "";
  preview.append(previewBody);

  textarea.parentNode?.insertBefore(host, textarea);
  write.append(textarea);
  host.append(chrome, write, preview);
  enhancedEditors.add(textarea);
  syncTabs(host, "write");
  return true;
}

export function initMarkdownEditors(root = document) {
  bindEditorEvents();
  const scope = root.querySelectorAll ? root : document;
  scope.querySelectorAll("textarea[data-md-editor]").forEach((node) => {
    enhanceMarkdownEditor(node);
  });
  observeNewEditors();
}

function bindEditorEvents() {
  if (editorEventsBound) return;
  editorEventsBound = true;

  document.addEventListener("mousedown", (event) => {
    const command = eventElement(event)?.closest("[data-md-cmd]");
    if (command) event.preventDefault();
  });

  document.addEventListener("click", (event) => {
    const origin = eventElement(event);
    const command = origin?.closest("[data-md-cmd]");
    if (command) {
      const host = command.closest("[data-md-editor-host]");
      const textarea = host?.querySelector("textarea[data-md-editor]");
      if (textarea) applyMarkdownCommand(textarea, command.dataset.mdCmd);
      return;
    }

    const tab = origin?.closest("[data-md-tab]");
    if (!tab) return;
    const host = tab.closest("[data-md-editor-host]");
    if (host) selectEditorTab(host, tab.dataset.mdTab);
  });

  document.addEventListener("keydown", (event) => {
    const tab = eventElement(event)?.closest("[data-md-tab]");
    if (!tab) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const host = tab.closest("[data-md-editor-host]");
    if (!host) return;
    const next = event.key === "ArrowRight" ? "preview" : "write";
    selectEditorTab(host, next);
    host.querySelector(`[data-md-tab="${next}"]`)?.focus();
  });

  document.addEventListener("input", (event) => {
    const textarea = event.target;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    if (!textarea.matches("textarea[data-md-editor]")) return;
    const host = textarea.closest("[data-md-editor-host]");
    if (host?.dataset.mdMode === "preview") {
      renderPreview(host, textarea);
    }
  });
}

function observeNewEditors() {
  if (
    editorObserver ||
    typeof MutationObserver !== "function" ||
    !document.body
  ) {
    return;
  }
  editorObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("textarea[data-md-editor]")) {
          enhanceMarkdownEditor(node);
        }
        node
          .querySelectorAll?.("textarea[data-md-editor]")
          .forEach((textarea) => enhanceMarkdownEditor(textarea));
      }
    }
  });
  editorObserver.observe(document.body, { childList: true, subtree: true });
}

function buildToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "md-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Markdown formatting");

  const app = document.createElement("span");
  app.className = "md-toolbar__app";
  app.textContent = "format.exe";
  toolbar.append(app);

  MARKDOWN_COMMANDS.forEach((command, index) => {
    if (index === 3 || index === 7 || index === 10) {
      const rule = document.createElement("span");
      rule.className = "md-toolbar__rule";
      rule.setAttribute("aria-hidden", "true");
      toolbar.append(rule);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `md-tool md-tool--${command.cmd}`;
    button.dataset.mdCmd = command.cmd;
    button.setAttribute("aria-label", command.label);
    button.title = `${command.label} — ${command.hint}`;
    const glyph = document.createElement("span");
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = command.glyph;
    button.append(glyph);
    toolbar.append(button);
  });

  return toolbar;
}

function buildTabs(textarea) {
  const tabs = document.createElement("div");
  tabs.className = "md-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Write or preview");
  tabs.append(
    makeTab(textarea, "write", "Write"),
    makeTab(textarea, "preview", "Preview"),
  );
  return tabs;
}

function makeTab(textarea, mode, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "md-tab";
  button.id = tabId(textarea, mode);
  button.dataset.mdTab = mode;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", panelId(textarea, mode));
  button.textContent = label;
  return button;
}

function selectEditorTab(host, mode) {
  const next = mode === "preview" ? "preview" : "write";
  const textarea = host.querySelector("textarea[data-md-editor]");
  syncTabs(host, next);
  if (next === "preview" && textarea) {
    renderPreview(host, textarea);
    host.querySelector("[data-md-panel='preview']")?.focus();
    return;
  }
  textarea?.focus();
}

function syncTabs(host, mode) {
  host.dataset.mdMode = mode;
  host.querySelectorAll("[data-md-tab]").forEach((tab) => {
    const selected = tab.dataset.mdTab === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  host.querySelectorAll("[data-md-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.mdPanel !== mode;
  });
}

function renderPreview(host, textarea) {
  const body = host.querySelector("[data-md-preview-body]");
  if (!body) return;
  const source = textarea.value;
  if (!source.trim()) {
    body.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "md-preview__empty";
    empty.textContent = "Nothing on the page yet. Hop back to Write.";
    body.append(empty);
    return;
  }
  try {
    if (body.dataset.mdPreviewSource === source) return;
    setMarkdownContent(body, source);
    body.dataset.mdPreviewSource = source;
  } catch {
    body.replaceChildren();
    const error = document.createElement("p");
    error.className = "md-preview__error";
    error.textContent =
      "Preview hiccuped. Your draft is still safe in the Write tab.";
    body.append(error);
  }
}

function eventElement(event) {
  const target = event.target;
  if (target instanceof Element) return target;
  return target?.parentElement ?? null;
}

function editorKey(textarea) {
  if (textarea.id) return textarea.id;
  if (!textarea.dataset.mdEditorKey) {
    textarea.dataset.mdEditorKey = `md-${Math.random().toString(36).slice(2, 10)}`;
  }
  return textarea.dataset.mdEditorKey;
}

function tabId(textarea, mode) {
  return `${editorKey(textarea)}-tab-${mode}`;
}

function panelId(textarea, mode) {
  return `${editorKey(textarea)}-panel-${mode}`;
}

function runCommand(textarea, command) {
  switch (command) {
    case "bold":
      return wrapSelection(textarea, "**", "**", "bold text");
    case "italic":
      return wrapSelection(textarea, "*", "*", "italic text");
    case "strike":
      return wrapSelection(textarea, "~~", "~~", "struck text");
    case "code":
      return wrapSelection(textarea, "`", "`", "code");
    case "codeblock":
      return wrapBlock(textarea, "```\n", "\n```", "your code here");
    case "heading":
      return prefixLines(textarea, "# ", /^#{1,3} /);
    case "ul":
      return prefixLines(textarea, "- ", /^\s*[-*+] /);
    case "ol":
      return numberLines(textarea);
    case "quote":
      return prefixLines(textarea, "> ", /^> /);
    case "link":
      return insertLink(textarea);
    case "hr":
      return insertSnippet(textarea, "\n\n---\n\n");
    case "clear":
      return clearFormatting(textarea);
    default:
      return false;
  }
}

function wrapSelection(textarea, prefix, suffix, placeholder) {
  const { start, end, value, selected } = selectionOf(textarea);
  if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length >= prefix.length + suffix.length
  ) {
    const inner = selected.slice(
      prefix.length,
      selected.length - suffix.length,
    );
    writeRange(textarea, start, end, inner, start, start + inner.length);
    return true;
  }
  if (
    value.slice(Math.max(0, start - prefix.length), start) === prefix &&
    value.slice(end, end + suffix.length) === suffix
  ) {
    writeRange(
      textarea,
      start - prefix.length,
      end + suffix.length,
      selected,
      start - prefix.length,
      start - prefix.length + selected.length,
    );
    return true;
  }
  const inner = selected || placeholder;
  const next = `${prefix}${inner}${suffix}`;
  const innerStart = start + prefix.length;
  writeRange(textarea, start, end, next, innerStart, innerStart + inner.length);
  return true;
}

function wrapBlock(textarea, prefix, suffix, placeholder) {
  const { start, end, selected } = selectionOf(textarea);
  const inner = selected || placeholder;
  const next = `${prefix}${inner}${suffix}`;
  const innerStart = start + prefix.length;
  writeRange(textarea, start, end, next, innerStart, innerStart + inner.length);
  return true;
}

function prefixLines(textarea, marker, pattern) {
  const block = lineBlock(textarea);
  const lines = block.text.split("\n");
  const allMarked = lines.every(
    (line) => pattern.test(line) || line.trim() === "",
  );
  const next = lines
    .map((line) => {
      if (line.trim() === "") return line;
      if (allMarked) return line.replace(pattern, "");
      if (pattern.test(line)) return line;
      return `${marker}${line}`;
    })
    .join("\n");
  writeRange(
    textarea,
    block.start,
    block.end,
    next,
    block.start,
    block.start + next.length,
  );
  return true;
}

function numberLines(textarea) {
  const block = lineBlock(textarea);
  const lines = block.text.split("\n");
  const numbered = /^\s*\d+\. /;
  const allMarked = lines.every(
    (line) => numbered.test(line) || line.trim() === "",
  );
  let index = 1;
  const next = lines
    .map((line) => {
      if (line.trim() === "") return line;
      if (allMarked) return line.replace(numbered, "");
      const stripped = line.replace(numbered, "");
      const labeled = `${index}. ${stripped}`;
      index += 1;
      return labeled;
    })
    .join("\n");
  writeRange(
    textarea,
    block.start,
    block.end,
    next,
    block.start,
    block.start + next.length,
  );
  return true;
}

function insertLink(textarea) {
  const { start, end, selected } = selectionOf(textarea);
  const looksLikeUrl = /^(https?:\/\/|\/|#)/i.test(selected.trim());
  if (looksLikeUrl) {
    const href = selected.trim();
    const next = `[link text](${href})`;
    writeRange(textarea, start, end, next, start + 1, start + 10);
    return true;
  }
  const label = selected || "link text";
  const next = `[${label}](https://example.com)`;
  const urlStart = start + label.length + 3;
  writeRange(
    textarea,
    start,
    end,
    next,
    urlStart,
    urlStart + "https://example.com".length,
  );
  return true;
}

function insertSnippet(textarea, snippet) {
  const { start, end } = selectionOf(textarea);
  writeRange(
    textarea,
    start,
    end,
    snippet,
    start + snippet.length,
    start + snippet.length,
  );
  return true;
}

function clearFormatting(textarea) {
  const { start, end, selected } = selectionOf(textarea);
  if (!selected) return false;
  const next = selected
    .replaceAll(/```[\w+-]*\n?|\n```/g, "")
    .replaceAll(/~~([^~]+)~~/g, "$1")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/__([^_]+)__/g, "$1")
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replaceAll(/\*([^*]+)\*/g, "$1")
    .replaceAll(/_([^_]+)_/g, "$1")
    .replaceAll(/^#{1,6}\s+/gm, "")
    .replaceAll(/^>\s+/gm, "")
    .replaceAll(/^\s*[-*+]\s+/gm, "")
    .replaceAll(/^\s*\d+\.\s+/gm, "")
    .replaceAll(/^---$/gm, "");
  writeRange(textarea, start, end, next, start, start + next.length);
  return true;
}

function selectionOf(textarea) {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  return { start, end, value, selected: value.slice(start, end) };
}

function lineBlock(textarea) {
  const { start, end, value } = selectionOf(textarea);
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = value.indexOf("\n", end);
  const blockEnd = nextNewline === -1 ? value.length : nextNewline;
  return {
    start: blockStart,
    end: blockEnd,
    text: value.slice(blockStart, blockEnd),
  };
}

function writeRange(textarea, start, end, insert, selectStart, selectEnd) {
  const value = textarea.value;
  textarea.value = `${value.slice(0, start)}${insert}${value.slice(end)}`;
  if (typeof textarea.setSelectionRange === "function") {
    textarea.setSelectionRange(selectStart, selectEnd);
  }
}
