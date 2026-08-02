import { animate } from "motion/mini";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? "";

document.addEventListener("click", async (event) => {
  const readMore = event.target.closest(".read-more");
  if (readMore) {
    const container = readMore.closest("[data-expandable]");
    const short = container?.querySelector("[data-short]");
    const full = container?.querySelector("[data-full]");
    if (!short || !full) return;
    const expanded = readMore.getAttribute("aria-expanded") === "true";
    short.hidden = !expanded;
    full.hidden = expanded;
    readMore.textContent = expanded ? "Read the rest" : "Show less";
    readMore.setAttribute("aria-expanded", String(!expanded));
    if (!reducedMotion) animate(container, { opacity: [0.72, 1] }, { duration: 0.2 });
    return;
  }

  const dismiss = event.target.closest("[data-dismiss]");
  if (dismiss) {
    const flash = dismiss.closest("[data-flash]");
    if (!flash) return;
    if (reducedMotion) flash.remove();
    else animate(flash, { opacity: [1, 0], y: [0, -8] }, { duration: 0.18 }).then(() => flash.remove());
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
      const count = matchingButton.querySelector(".action-count");
      if (count) count.textContent = String(result.count);
    });

    if (!reducedMotion) {
      const icon = button.querySelector(".action-icon");
      if (reaction === "like" && result.active) {
        animate(icon, { scale: [1, 1.45, 0.9, 1], rotate: [0, -8, 5, 0] }, { duration: 0.42 });
      } else {
        animate(icon, { scale: [1, 0.8, 1.2, 1], rotate: reaction === "repost" ? [0, 180, 360] : [0, 0, 0] }, { duration: 0.38 });
      }
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "That did not work.");
  } finally {
    button.disabled = false;
  }
}

function showToast(message) {
  document.querySelector("[data-client-toast]")?.remove();
  const toast = document.createElement("div");
  toast.className = "flash flash--error";
  toast.dataset.clientToast = "";
  toast.setAttribute("role", "alert");
  toast.textContent = message;
  document.body.append(toast);
  if (!reducedMotion) animate(toast, { opacity: [0, 1], y: [-8, 0] }, { duration: 0.2 });
  window.setTimeout(() => toast.remove(), 4500);
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

const flash = document.querySelector("[data-flash]");
if (flash && !reducedMotion) {
  animate(flash, { opacity: [0, 1], y: [-10, 0], scale: [0.97, 1] }, { duration: 0.28 });
}

document.querySelector("[data-confirm-delete]")?.addEventListener("submit", (event) => {
  if (!window.confirm("Delete this post permanently?")) event.preventDefault();
});
