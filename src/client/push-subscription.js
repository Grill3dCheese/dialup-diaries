const vapidCharset = /^[A-Za-z0-9_-]+={0,2}$/;
const serviceWorkerUrl = "/service-worker.js";
const badgeClearDebounceMs = 2000;
let lastBadgeClearAt = 0;
let badgeClearInFlight = false;
let badgeClearQueued = false;
let queuedBadgeResetOptions = {};

export function pushSupported() {
  return (
    window.isSecureContext === true &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    typeof Notification.requestPermission === "function"
  );
}

export function isIosUserAgent(userAgent = "") {
  return /iPad|iPhone|iPod/i.test(userAgent);
}

export function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

export function detectBrowserPlatform(userAgent = "") {
  const ua = userAgent;
  if (/Edg\//i.test(ua) || /EdgiOS\//i.test(ua)) return "edge";
  if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) return "firefox";
  if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) return "chrome";
  if (/Safari\//i.test(ua)) return "safari";
  return "other";
}

export function urlBase64ToUint8Array(base64String) {
  if (typeof base64String !== "string") {
    throw new TypeError("VAPID public key must be a string.");
  }

  const trimmed = base64String.trim();
  if (
    trimmed.length < 20 ||
    trimmed.length > 200 ||
    !vapidCharset.test(trimmed)
  ) {
    throw new TypeError("VAPID public key is not valid URL-safe Base64.");
  }

  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");

  let raw;
  try {
    raw = atob(base64);
  } catch {
    throw new TypeError("VAPID public key could not be decoded.");
  }

  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  if (bytes.byteLength === 0) {
    throw new TypeError("VAPID public key decoded to an empty key.");
  }
  return bytes;
}

export function initPushSubscription({ csrfToken, onError }) {
  const toggles = [...document.querySelectorAll("[data-push-toggle]")];
  if (!pushSupported()) {
    showUnsupportedPager(toggles);
    return { supported: false };
  }

  void bootstrap({ csrfToken, onError, toggles });
  return { supported: true };
}

async function bootstrap({ csrfToken, onError, toggles }) {
  const registration = await registerServiceWorker();
  if (!registration) {
    setPagerUnavailable(toggles, "Pager unavailable in this browser");
    return;
  }

  bindToggles({ csrfToken, onError, registration, toggles });
  void resetAppBadgeContext({ csrfToken, registration });
  await syncPagerState(registration, toggles);
}

async function registerServiceWorker() {
  try {
    return await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: "/",
      updateViaCache: "none",
    });
  } catch {
    return null;
  }
}

export async function resetAppBadgeContext(options = {}) {
  if (badgeClearInFlight) {
    badgeClearQueued = true;
    queuedBadgeResetOptions = {
      csrfToken: options.csrfToken ?? queuedBadgeResetOptions.csrfToken,
      registration:
        options.registration ?? queuedBadgeResetOptions.registration,
    };
    return;
  }
  if (document.visibilityState && document.visibilityState !== "visible") {
    return;
  }

  const now = Date.now();
  if (now - lastBadgeClearAt < badgeClearDebounceMs) return;

  const { csrfToken, registration } = options;
  badgeClearInFlight = true;
  try {
    await clearOperatingSystemBadge();
    const synced = await syncRemoteBadgeReset(csrfToken, registration);
    if (synced) lastBadgeClearAt = Date.now();
  } catch {
    lastBadgeClearAt = 0;
  } finally {
    badgeClearInFlight = false;
    if (badgeClearQueued) {
      badgeClearQueued = false;
      const next = queuedBadgeResetOptions;
      queuedBadgeResetOptions = {};
      void resetAppBadgeContext(next);
    }
  }
}

async function clearOperatingSystemBadge() {
  if (!("clearAppBadge" in navigator)) return;
  try {
    await navigator.clearAppBadge();
  } catch {
    // Home-screen badging is optional; the database reset still proceeds.
  }
}

async function syncRemoteBadgeReset(csrfToken, registration) {
  const token = readCsrfToken(csrfToken);
  const endpoint = await resolvePushEndpoint(registration);
  if (!token || !endpoint) return false;

  await postJson("/api/notifications/read", token, { endpoint });
  return true;
}

async function resolvePushEndpoint(registration) {
  try {
    const active =
      registration ??
      ("serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration("/")
        : null);
    const subscription = await active?.pushManager.getSubscription();
    return typeof subscription?.endpoint === "string"
      ? subscription.endpoint
      : null;
  } catch {
    return null;
  }
}

function readCsrfToken(explicit) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return (
    document.querySelector('meta[name="csrf-token"]')?.content?.trim() ?? ""
  );
}

function bindToggles({ csrfToken, onError, registration, toggles }) {
  for (const toggle of toggles) {
    toggle.addEventListener("click", () => {
      void togglePager({
        csrfToken,
        onError,
        registration,
        toggle,
        toggles,
      });
    });
  }
}

async function togglePager({
  csrfToken,
  onError,
  registration,
  toggle,
  toggles,
}) {
  if (toggle.disabled) return;
  setBusy(toggles, true);

  try {
    const ready = await navigator.serviceWorker.ready;
    const activeRegistration = ready ?? registration;
    const existing = await activeRegistration.pushManager.getSubscription();

    if (existing) {
      const endpoint = existing.endpoint;
      await existing.unsubscribe();
      await postJson("/api/notifications/unsubscribe", csrfToken, { endpoint });
      return;
    }

    const vapidPublicKey = readVapidPublicKey();
    if (!vapidPublicKey) {
      throw new Error("The guestbook pager is offline on this host.");
    }

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") {
      if (permission === "denied") {
        throw new Error(
          "This browser blocked the pager. Open the lock icon beside the URL, set Notifications to Ask or Allow, then refresh and try again.",
        );
      }
      return;
    }

    const subscription = await activeRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const serialized = subscription.toJSON();
    if (
      !serialized.endpoint ||
      !serialized.keys?.p256dh ||
      !serialized.keys?.auth
    ) {
      throw new Error(
        "This browser returned an incomplete pager subscription.",
      );
    }

    await postJson("/api/notifications/subscribe", csrfToken, {
      endpoint: serialized.endpoint,
      keys: {
        p256dh: serialized.keys.p256dh,
        auth: serialized.keys.auth,
      },
      platform: detectBrowserPlatform(navigator.userAgent),
    });
  } catch (error) {
    onError?.(
      error instanceof Error ? error.message : "The pager did not pick up.",
    );
  } finally {
    await syncPagerState(registration, toggles);
  }
}

async function syncPagerState(registration, toggles) {
  try {
    if (Notification.permission === "denied") {
      revealPagerUi(toggles);
      syncButtons(toggles, { on: false, blocked: true });
      showPagerHint(
        "This browser already blocked notifications for this address. Open the lock icon beside the URL, set Notifications to Ask or Allow, then refresh.",
      );
      return;
    }

    const subscription = await registration.pushManager.getSubscription();
    const vapidPublicKey = readVapidPublicKey();
    if (!subscription && !vapidPublicKey) {
      setPagerUnavailable(toggles, "Pager offline on this host");
      return;
    }

    revealPagerUi(toggles);
    syncButtons(toggles, { on: Boolean(subscription), blocked: false });
  } catch {
    setPagerUnavailable(toggles, "Pager unavailable in this browser");
  }
}

function revealPagerUi(toggles) {
  document.querySelectorAll("[data-pager-card]").forEach((card) => {
    card.hidden = false;
  });
  for (const toggle of toggles) {
    toggle.hidden = false;
  }
  hidePagerHint();
}

function showUnsupportedPager(toggles) {
  const iosNeedsHomeScreen =
    isIosUserAgent(navigator.userAgent) && !isStandaloneDisplay();

  if (iosNeedsHomeScreen) {
    revealPagerUi(toggles);
    lockToggles(
      toggles,
      "HOME SCREEN",
      "Add Dialup Diaries to your Home Screen, then open that icon to turn on the pager.",
    );
    setPagerCardCopy(
      "iPhone keeps the pager off in Safari. Tap Share, Add to Home Screen, then open the icon and the toggle will come alive.",
    );
    showPagerHint(
      "iPhone Safari only rings the guestbook pager from a Home Screen app. Tap Share → Add to Home Screen, open that icon, then try PAGER OFF.",
    );
    return;
  }

  setPagerUnavailable(toggles, "Pager unavailable in this browser");
  showPagerHint(
    "This browser does not expose web push. On iPhone, add the site to your Home Screen first. On a computer, use a current Chrome, Edge, Firefox, or Safari window over https.",
  );
}

function showPagerHint(message) {
  const hint = document.querySelector("[data-pager-hint]");
  const body = hint?.querySelector("[data-pager-hint-body]");
  if (!hint || !body) return;
  body.textContent = message;
  hint.hidden = false;
}

function hidePagerHint() {
  const hint = document.querySelector("[data-pager-hint]");
  if (hint) hint.hidden = true;
}

function setPagerCardCopy(message) {
  document.querySelectorAll("[data-pager-card-copy]").forEach((copy) => {
    copy.textContent = message;
  });
}

function lockToggles(toggles, label, aria) {
  for (const toggle of toggles) {
    toggle.hidden = false;
    toggle.disabled = true;
    toggle.classList.remove("is-on");
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", aria);
    toggle.setAttribute("aria-busy", "false");
    toggle.title = aria;
    const text = toggle.querySelector("[data-push-toggle-label]");
    if (text) text.textContent = label;
  }
}

function setPagerUnavailable(toggles, label) {
  document.querySelectorAll("[data-pager-card]").forEach((card) => {
    card.hidden = true;
  });
  for (const toggle of toggles) {
    if (toggle.closest("[data-pager-card]")) {
      toggle.hidden = true;
      continue;
    }
    toggle.hidden = false;
    toggle.disabled = true;
    toggle.classList.remove("is-on");
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-busy", "false");
    toggle.title = label;
    const text = toggle.querySelector("[data-push-toggle-label]");
    if (text) text.textContent = "PAGER OFFLINE";
  }
}

function syncButtons(toggles, { on, blocked }) {
  const label = blocked ? "PAGER BLOCKED" : on ? "PAGER ON" : "PAGER OFF";
  const aria = blocked
    ? "Guestbook pager blocked by this browser"
    : on
      ? "Turn off guestbook pager notifications"
      : "Turn on guestbook pager notifications";

  for (const toggle of toggles) {
    toggle.hidden = false;
    toggle.disabled = blocked;
    toggle.classList.toggle("is-on", on);
    toggle.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("aria-label", aria);
    toggle.setAttribute("aria-busy", "false");
    toggle.title = aria;
    const text = toggle.querySelector("[data-push-toggle-label]");
    if (text) text.textContent = label;
  }
}

function setBusy(toggles, busy) {
  for (const toggle of toggles) {
    toggle.setAttribute("aria-busy", String(busy));
    if (busy) toggle.disabled = true;
  }
}

function readVapidPublicKey() {
  return (
    document.querySelector('meta[name="vapid-public-key"]')?.content?.trim() ??
    ""
  );
}

async function postJson(url, csrfToken, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "The pager did not pick up.",
    );
  }
  return result;
}
