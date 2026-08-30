import DOMPurify from "dompurify";
import {
  createMarkdownRenderer,
  fallbackMarkdownHtml,
  setMarkdownContent as writeMarkdown,
} from "../markdown/pipeline.js";

let renderMarkdownImpl;

export function renderMarkdown(source) {
  return getRenderer()(source);
}

export function setMarkdownContent(element, source) {
  writeMarkdown(element, source, renderMarkdown);
}

function getRenderer() {
  if (renderMarkdownImpl) return renderMarkdownImpl;
  const purify = resolvePurify();
  renderMarkdownImpl = purify
    ? createMarkdownRenderer(purify)
    : (value) => (typeof value === "string" ? fallbackMarkdownHtml(value) : "");
  return renderMarkdownImpl;
}

function resolvePurify() {
  const root =
    typeof globalThis.window !== "undefined" ? globalThis.window : null;
  const candidate = bindPurify(DOMPurify, root);
  if (isPurifyEngine(candidate)) return candidate;
  if (typeof DOMPurify === "function" && root) {
    const bound = DOMPurify(root);
    if (isPurifyEngine(bound)) return bound;
  }
  return null;
}

function bindPurify(mod, root) {
  if (isPurifyEngine(mod)) return mod;
  if (typeof mod === "function" && root) return mod(root);
  return mod;
}

function isPurifyEngine(value) {
  return (
    Boolean(value) &&
    typeof value.setConfig === "function" &&
    typeof value.addHook === "function" &&
    typeof value.sanitize === "function"
  );
}
