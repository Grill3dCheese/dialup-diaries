import { animate } from "motion/mini";
import { armAllFlashes, showToast } from "./flash.js";
import {
  initPushSubscription,
  resetAppBadgeContext,
} from "./push-subscription.js";
import { initMarkdownEditors } from "./markdown-editor.js";
import { initKeyboardSubmit } from "./keyboard-submit.js";
import {
  initSocketFeed,
  applyCounterUpdate,
  noteLocalCounterDelta,
} from "./socket-feed.js";
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  systemTheme,
  themeStorageKey,
  writeStoredTheme,
} from "./theme.js";

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const csrfToken =
  document.querySelector('meta[name="csrf-token"]')?.content ?? "";
const themeToggle = document.querySelector("[data-theme-toggle]");
const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

if (themeToggle) {
  syncThemeToggle(document.documentElement.dataset.theme || systemTheme());
  themeToggle.addEventListener("click", () => {
    const currentTheme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    playThemeSwitchSound(nextTheme);
    switchTheme(nextTheme, true);
  });
}

colorSchemeQuery.addEventListener("change", (event) => {
  if (readStoredTheme() === "light" || readStoredTheme() === "dark") return;
  switchTheme(event.matches ? "dark" : "light", false);
});

window.addEventListener("storage", (event) => {
  if (event.key !== themeStorageKey) return;
  switchTheme(resolveTheme(event.newValue, colorSchemeQuery.matches), false);
});

function switchTheme(theme, persist) {
  const update = () => {
    applyTheme(theme);
    if (persist) writeStoredTheme(theme);
    syncThemeToggle(theme);
  };

  if (!reducedMotion && document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    if (!reducedMotion)
      document.documentElement.classList.add("theme-changing");
    update();
    window.setTimeout(
      () => document.documentElement.classList.remove("theme-changing"),
      320,
    );
  }

  if (!reducedMotion && themeToggle) {
    animate(
      themeToggle,
      { scale: [1, 0.9, 1.08, 1], rotate: [0, -4, 3, 0] },
      { duration: 0.38 },
    );
  }
}

function syncThemeToggle(theme) {
  if (!themeToggle) return;
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
}

let themeAudioContext;

function playThemeSwitchSound(theme) {
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return;
  themeAudioContext ??= new AudioContext();
  void themeAudioContext.resume();

  const start = themeAudioContext.currentTime;
  const frequencies = theme === "light" ? [420, 880] : [720, 190];
  frequencies.forEach((frequency, index) => {
    const oscillator = themeAudioContext.createOscillator();
    const gain = themeAudioContext.createGain();
    const offset = index * 0.035;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.028, start + offset + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.035);
    oscillator.connect(gain);
    gain.connect(themeAudioContext.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.04);
  });
}

const changelogReleases = [
  ...document.querySelectorAll("[data-changelog-release]"),
];
const changelogLinks = [...document.querySelectorAll("[data-changelog-link]")];

if (changelogReleases.length > 0) {
  const requestedRelease = document.getElementById(
    window.location.hash.slice(1),
  );
  if (requestedRelease?.matches("[data-changelog-release]")) {
    activateChangelogRelease(requestedRelease, false);
  }

  window.addEventListener("hashchange", () => {
    const release = document.getElementById(window.location.hash.slice(1));
    if (release?.matches("[data-changelog-release]")) {
      activateChangelogRelease(release, false);
    }
  });

  changelogReleases.forEach((release) => {
    release.addEventListener("toggle", () => {
      if (release.open) syncChangelogLinks(release.id);
    });
  });
}

function activateChangelogRelease(release, updateUrl) {
  changelogReleases.forEach((candidate) => {
    candidate.open = candidate === release;
  });
  syncChangelogLinks(release.id);

  if (updateUrl) {
    window.history.pushState(null, "", `#${release.id}`);
  }

  const body = release.querySelector("[data-changelog-body]");
  if (body && !reducedMotion) {
    animate(
      body,
      { opacity: [0, 1], y: [9, 0] },
      { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
    );
  }

  if (updateUrl && window.matchMedia("(max-width: 800px)").matches) {
    window.requestAnimationFrame(() => {
      release.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }
}

function syncChangelogLinks(releaseId) {
  changelogLinks.forEach((link) => {
    if (link.hash === `#${releaseId}`)
      link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
}

document.addEventListener("click", async (event) => {
  const changelogLink = event.target.closest("[data-changelog-link]");
  if (changelogLink) {
    const release = document.getElementById(changelogLink.hash.slice(1));
    if (!release?.matches("[data-changelog-release]")) return;
    event.preventDefault();
    activateChangelogRelease(release, true);
    return;
  }

  const usernameSuggestion = event.target.closest("[data-username-suggestion]");
  if (usernameSuggestion) {
    const usernameInput = document.querySelector("[data-username-input]");
    if (!usernameInput) return;
    usernameInput.value = usernameSuggestion.dataset.usernameSuggestion ?? "";
    usernameInput.focus();
    usernameInput.setSelectionRange(
      usernameInput.value.length,
      usernameInput.value.length,
    );
    if (!reducedMotion) {
      animate(
        usernameInput.closest(".input-wrap"),
        { scale: [1, 1.025, 1] },
        { duration: 0.24 },
      );
    }
    return;
  }

  const readMore = event.target.closest(".read-more");
  if (readMore) {
    const container = readMore.closest("[data-expandable]");
    if (!container) return;
    const expanded = readMore.getAttribute("aria-expanded") === "true";
    container.classList.toggle("is-collapsed", expanded);
    readMore.textContent = expanded ? "Read the rest" : "Show less";
    readMore.setAttribute("aria-expanded", String(!expanded));
    if (!reducedMotion)
      animate(container, { opacity: [0.72, 1] }, { duration: 0.2 });
    return;
  }

  const reaction = event.target.closest("[data-reaction]");
  if (!reaction || reaction.disabled) return;
  await toggleReaction(reaction);
});

async function toggleReaction(button) {
  const { reaction, postId } = button.dataset;
  if (!reaction || !postId) return;

  button.disabled = true;
  try {
    const response = await fetch(`/api/posts/${postId}/${reaction}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-csrf-token": csrfToken,
      },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "That did not work.");

    const matchingButtons = document.querySelectorAll(
      `[data-reaction="${CSS.escape(reaction)}"][data-post-id="${CSS.escape(postId)}"]`,
    );
    matchingButtons.forEach((matchingButton) => {
      matchingButton.classList.toggle("is-active", result.active);
      matchingButton.setAttribute("aria-pressed", String(result.active));
    });
    applyCounterUpdate({
      targetId: postId,
      type: reaction === "like" ? "like" : "retweet",
      newCount: result.count,
    });
    noteLocalCounterDelta(
      postId,
      reaction === "like" ? "like" : "retweet",
      result.active ? 1 : -1,
    );

    if (!reducedMotion) {
      const icon = button.querySelector(".action-icon");
      if (reaction === "like" && result.active) {
        animate(
          icon,
          { scale: [1, 1.45, 0.9, 1], rotate: [0, -8, 5, 0] },
          { duration: 0.42 },
        );
      } else {
        animate(
          icon,
          {
            scale: [1, 0.8, 1.2, 1],
            rotate: reaction === "repost" ? [0, 180, 360] : [0, 0, 0],
          },
          { duration: 0.38 },
        );
      }
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "That did not work.");
  } finally {
    button.disabled = false;
  }
}

const composer = document.querySelector("[data-composer]");
const count = document.querySelector("[data-character-count]");
if (composer && count) {
  const updateCount = () => {
    count.textContent = `${composer.value.length.toLocaleString()} / 5,000`;
  };
  composer.addEventListener("input", updateCount);
  updateCount();
}

armAllFlashes();

const visitorCounter = document.querySelector("[data-visitor-counter]");
if (visitorCounter) {
  initializeVisitorCounter(visitorCounter);
}

function initializeVisitorCounter(counter) {
  const output = counter.querySelector("strong");
  const count = Number.parseInt(counter.dataset.count ?? "0", 10);
  if (!output || !Number.isSafeInteger(count) || count < 0) return;

  const digits = String(count).padStart(6, "0");
  const reels = [];
  output.textContent = "";

  for (const [index, character] of [...digits].entries()) {
    const targetDigit = Number.parseInt(character, 10);
    const slot = document.createElement("span");
    const reel = document.createElement("span");
    slot.className = "counter-digit";
    reel.className = "counter-reel";
    reel.setAttribute("aria-hidden", "true");

    for (let digit = 0; digit <= 9; digit += 1) {
      const number = document.createElement("span");
      number.textContent = String(digit);
      reel.append(number);
    }

    slot.append(reel);
    output.append(slot);
    reels.push({ index, reel, slot, targetDigit });
  }

  for (const { index, reel, slot, targetDigit } of reels) {
    const distance = targetDigit * slot.getBoundingClientRect().height;
    if (reducedMotion) {
      reel.style.transform = `translateY(-${distance}px)`;
      continue;
    }
    animate(
      reel,
      { transform: ["translateY(0px)", `translateY(-${distance}px)`] },
      {
        duration: 5 + targetDigit * 0.12,
        delay: index * 0.055,
        ease: [0.22, 1, 0.36, 1],
      },
    );
  }
}

document.querySelectorAll("[data-confirm-delete]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    const message =
      form.getAttribute("data-confirm-delete") || "Delete this permanently?";
    if (!window.confirm(message)) event.preventDefault();
  });
});

const changelogGroups = document.querySelector("[data-changelog-groups]");
const changelogGroupTemplate = document.querySelector(
  "[data-changelog-group-template]",
);
const addChangelogGroup = document.querySelector("[data-add-changelog-group]");
const defaultSectionLabels = {
  added: "New on the web",
  changed: "Polished pixels",
  fixed: "Bugs sent to /dev/null",
  security: "Under the hood",
};

if (changelogGroups && changelogGroupTemplate) {
  const sectionCards = () => [
    ...changelogGroups.querySelectorAll("[data-changelog-group]"),
  ];

  const syncSectionControls = () => {
    const cards = sectionCards();
    cards.forEach((card) => {
      const remove = card.querySelector("[data-remove-changelog-group]");
      if (remove) remove.disabled = cards.length <= 1;
    });
  };

  addChangelogGroup?.addEventListener("click", () => {
    changelogGroups.append(changelogGroupTemplate.content.cloneNode(true));
    syncSectionControls();
  });

  changelogGroups.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-changelog-group]");
    if (!remove || sectionCards().length <= 1) return;
    remove.closest("[data-changelog-group]")?.remove();
    syncSectionControls();
  });

  changelogGroups.addEventListener("change", (event) => {
    const select = event.target.closest("[name='groupKind']");
    if (!select) return;
    const card = select.closest("[data-changelog-group]");
    const label = card?.querySelector("[name='groupLabel']");
    if (!label) return;
    const defaults = Object.values(defaultSectionLabels);
    if (!label.value.trim() || defaults.includes(label.value.trim())) {
      label.value = defaultSectionLabels[select.value] ?? "";
    }
  });

  syncSectionControls();
}

initMarkdownEditors();
initKeyboardSubmit();
initSocketFeed();
initPushSubscription({
  csrfToken,
  onError: showToast,
});

void resetAppBadgeContext({ csrfToken });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void resetAppBadgeContext({ csrfToken });
  }
});
