import { animate } from "motion/mini";

/** @typedef {"success" | "error" | "warning" | "info"} FlashKind */

/**
 * @typedef {object} FlashSession
 * @property {HTMLElement} element
 * @property {HTMLElement} bar
 * @property {number} durationMs
 * @property {number} remainingMs
 * @property {number} deadline
 * @property {boolean} paused
 * @property {boolean} leaving
 * @property {AbortController} inputController
 */

export const FLASH_DURATION_MS = 4000;
export const FLASH_ERROR_DURATION_MS = 6000;
export const FLASH_FADE_MS = 180;

const KIND_CLASSES = /** @type {const} */ ([
  ["error", ["flash--error", "flash-error"]],
  ["success", ["flash--success", "flash-success"]],
  ["warning", ["flash--warning", "flash-warning"]],
]);

/** @type {Map<HTMLElement, FlashSession>} */
const sessions = new Map();

/** @type {WeakMap<HTMLElement, () => void>} */
const fadeDisposers = new WeakMap();

let loopId = 0;

/**
 * @param {string} className
 * @returns {FlashKind}
 */
export function flashKindFromClassName(className) {
  const classes = new Set(className.split(/\s+/).filter(Boolean));
  for (const [kind, aliases] of KIND_CLASSES) {
    if (aliases.some((alias) => classes.has(alias))) return kind;
  }
  return "info";
}

/**
 * @param {FlashKind} kind
 */
export function durationForFlashKind(kind) {
  return kind === "error" ? FLASH_ERROR_DURATION_MS : FLASH_DURATION_MS;
}

/**
 * @param {HTMLElement} element
 */
export function armFlash(element) {
  if (sessions.has(element) || element.classList.contains("is-leaving")) return;

  element.dataset.flash = "";
  const kind = flashKindFromClassName(element.className);
  const durationMs = durationForFlashKind(kind);
  const bar = ensureProgressBar(element);
  const inputController = new AbortController();
  const { signal } = inputController;

  /** @type {FlashSession} */
  const session = {
    element,
    bar,
    durationMs,
    remainingMs: durationMs,
    deadline: performance.now() + durationMs,
    paused: false,
    leaving: false,
    inputController,
  };

  sessions.set(element, session);

  element.addEventListener("mouseenter", () => pauseSession(session), {
    signal,
    passive: true,
  });
  element.addEventListener("mouseleave", () => resumeSession(session), {
    signal,
    passive: true,
  });
  element.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-dismiss]")) {
        return;
      }
      dismissFlash(element);
    },
    { signal },
  );

  playEnter(element);
  playBar(session);
  ensureLoop();
}

/**
 * @param {ParentNode} [root]
 */
export function armAllFlashes(root = document) {
  root.querySelectorAll(".flash").forEach((node) => {
    if (node instanceof HTMLElement) armFlash(node);
  });
}

/**
 * @param {HTMLElement} element
 * @param {{ immediate?: boolean }} [options]
 */
export function dismissFlash(element, options = {}) {
  const immediate = options.immediate === true || prefersReducedMotion();
  const session = sessions.get(element);

  if (session) {
    session.leaving = true;
    detachInput(session);
    haltBar(session);
    sessions.delete(element);
    maybeStopLoop();
  }

  if (immediate) {
    cancelFade(element);
    element.remove();
    return;
  }

  if (element.classList.contains("is-leaving") && fadeDisposers.has(element)) {
    return;
  }

  beginFade(element);
}

/**
 * @param {string} message
 * @param {FlashKind} [kind]
 */
export function showToast(message, kind = "error") {
  const existing = document.querySelector("[data-client-toast]");
  if (existing instanceof HTMLElement) {
    dismissFlash(existing, { immediate: true });
  }

  const resolvedKind = flashKindFromClassName(`flash--${kind}`);
  const toast = document.createElement("div");
  toast.className = `flash flash--${resolvedKind}`;
  toast.dataset.clientToast = "";
  toast.dataset.flash = "";
  toast.setAttribute("role", resolvedKind === "error" ? "alert" : "status");

  const glyph = document.createElement("span");
  glyph.className = "flash__glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = resolvedKind === "success" ? "✦" : "!";

  const text = document.createElement("span");
  text.className = "flash__message";
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss message");
  close.dataset.dismiss = "";
  close.textContent = "×";

  toast.append(glyph, text, close);
  document.body.append(toast);
  armFlash(toast);
}

/**
 * @param {HTMLElement} element
 */
function ensureProgressBar(element) {
  const existing = element.querySelector(".flash__progress");
  if (existing instanceof HTMLElement) return existing;

  const bar = document.createElement("span");
  bar.className = "flash__progress";
  bar.setAttribute("aria-hidden", "true");
  element.append(bar);
  return bar;
}

/**
 * @param {FlashSession} session
 */
function pauseSession(session) {
  if (session.paused || session.leaving) return;
  session.remainingMs = Math.max(0, session.deadline - performance.now());
  session.paused = true;
  session.deadline = 0;
  freezeBar(session);
  maybeStopLoop();
}

/**
 * @param {FlashSession} session
 */
function resumeSession(session) {
  if (!session.paused || session.leaving) return;
  session.paused = false;
  session.deadline = performance.now() + session.remainingMs;
  playBar(session, { fromFrozen: true });
  ensureLoop();
}

/**
 * @param {FlashSession} session
 * @param {{ fromFrozen?: boolean }} [options]
 */
function playBar(session, options = {}) {
  const bar = session.bar;
  if (prefersReducedMotion()) {
    bar.style.transition = "none";
    bar.style.width = "100%";
    return;
  }

  if (!options.fromFrozen) {
    bar.style.transition = "none";
    bar.style.width = "100%";
  }

  const remaining = session.paused
    ? session.remainingMs
    : Math.max(0, session.deadline - performance.now());
  if (remaining <= 0) {
    bar.style.transition = "none";
    bar.style.width = "0%";
    return;
  }

  void bar.offsetWidth;
  bar.style.transition = `width ${remaining}ms linear`;
  bar.style.width = "0%";
}

/**
 * @param {FlashSession} session
 */
function freezeBar(session) {
  const bar = session.bar;
  const computedWidth = Number.parseFloat(getComputedStyle(bar).width);
  bar.style.transition = "none";
  if (Number.isFinite(computedWidth) && computedWidth > 1) {
    bar.style.width = `${computedWidth}px`;
    return;
  }
  const pct = (session.remainingMs / session.durationMs) * 100;
  bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

/**
 * @param {FlashSession} session
 */
function haltBar(session) {
  const bar = session.bar;
  bar.style.transition = "none";
  bar.style.width = "0%";
}

/**
 * @param {HTMLElement} element
 */
function playEnter(element) {
  if (prefersReducedMotion()) return;
  animate(
    element,
    { opacity: [0, 1], y: [-10, 0], scale: [0.97, 1] },
    { duration: 0.28 },
  );
}

/**
 * @param {HTMLElement} element
 */
function beginFade(element) {
  cancelFade(element);
  element.style.removeProperty("opacity");
  element.style.removeProperty("transform");
  void element.offsetWidth;
  element.classList.add("is-leaving");

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    element.removeEventListener("transitionend", onTransitionEnd);
    window.clearTimeout(fadeTimer);
    fadeDisposers.delete(element);
    element.remove();
  };

  /** @param {TransitionEvent} event */
  const onTransitionEnd = (event) => {
    if (event.target !== element) return;
    settle();
  };

  element.addEventListener("transitionend", onTransitionEnd);
  const fadeTimer = window.setTimeout(settle, FLASH_FADE_MS + 80);
  fadeDisposers.set(element, () => {
    if (settled) return;
    settled = true;
    element.removeEventListener("transitionend", onTransitionEnd);
    window.clearTimeout(fadeTimer);
    fadeDisposers.delete(element);
  });
}

/**
 * @param {HTMLElement} element
 */
function cancelFade(element) {
  fadeDisposers.get(element)?.();
}

/**
 * @param {FlashSession} session
 */
function detachInput(session) {
  session.inputController.abort();
}

function ensureLoop() {
  if (loopId !== 0 || !hasRunningSession()) return;
  loopId = window.requestAnimationFrame(tick);
}

function maybeStopLoop() {
  if (loopId === 0 || hasRunningSession()) return;
  window.cancelAnimationFrame(loopId);
  loopId = 0;
}

function hasRunningSession() {
  for (const session of sessions.values()) {
    if (!session.paused && !session.leaving) return true;
  }
  return false;
}

function tick() {
  const now = performance.now();
  for (const session of [...sessions.values()]) {
    if (session.paused || session.leaving) continue;
    if (now >= session.deadline) dismissFlash(session.element);
  }

  if (!hasRunningSession()) {
    loopId = 0;
    return;
  }

  loopId = window.requestAnimationFrame(tick);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
