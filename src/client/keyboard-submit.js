const INELIGIBLE_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "image",
  "file",
  "hidden",
  "checkbox",
  "radio",
  "range",
  "color",
]);

let shortcutBound = false;

export function isSubmitShortcut(event) {
  if (event.key !== "Enter") return false;
  if (event.repeat || event.isComposing) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  if (event.altKey || event.shiftKey) return false;
  return true;
}

export function prefersMetaSubmitHint(
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
) {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function isEligibleSubmitControl(element) {
  if (!(element instanceof HTMLElement) || element.disabled) return false;
  if (
    element.closest("[data-md-cmd], [data-md-tab], [data-md-panel='preview']")
  ) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly;
  }
  if (element instanceof HTMLSelectElement) {
    return true;
  }
  if (element instanceof HTMLInputElement) {
    if (element.readOnly) return false;
    return !INELIGIBLE_INPUT_TYPES.has(element.type);
  }
  return false;
}

export function resolveSubmitForm(element) {
  if (!isEligibleSubmitControl(element)) return null;
  if ("form" in element && element.form instanceof HTMLFormElement) {
    return element.form;
  }
  return null;
}

export function isKeyboardSubmittableForm(form) {
  if (!(form instanceof HTMLFormElement)) return false;
  if (form.dataset.keyboardSubmit === "off") return false;
  if (form.hasAttribute("data-confirm-delete")) return false;
  if (form.classList.contains("danger-zone")) return false;
  if (isDestructiveFormAction(form.getAttribute("action") ?? "")) return false;
  return resolveSubmitter(form).ok;
}

export function resolveSubmitter(form) {
  const submitters = [...form.elements].filter(isSubmitButton);
  if (submitters.length === 0) return { ok: true, submitter: null };

  const enabled = submitters.filter((button) => !button.disabled);
  if (enabled.length === 0) return { ok: false, submitter: null };

  const primary = enabled.filter((button) =>
    button.classList.contains("button--primary"),
  );
  if (primary.length === 1) return { ok: true, submitter: primary[0] };
  if (primary.length > 1) return { ok: false, submitter: null };
  if (enabled.length === 1) return { ok: true, submitter: enabled[0] };
  return { ok: false, submitter: null };
}

export function handleKeyboardSubmit(event) {
  if (event.defaultPrevented || !isSubmitShortcut(event)) return false;

  const control = eventElement(event);
  const form = resolveSubmitForm(control);
  if (!form || !isKeyboardSubmittableForm(form)) return false;

  const { ok, submitter } = resolveSubmitter(form);
  if (!ok) return false;

  event.preventDefault();
  delegateSubmit(form, submitter);
  return true;
}

export function initKeyboardSubmit() {
  if (shortcutBound) return;
  shortcutBound = true;
  document.addEventListener("keydown", handleKeyboardSubmit);
  syncSubmitHintModifiers();
}

function syncSubmitHintModifiers() {
  const label = prefersMetaSubmitHint() ? "⌘" : "Ctrl";
  document.querySelectorAll("[data-submit-mod]").forEach((node) => {
    node.textContent = label;
  });
}

function delegateSubmit(form, submitter) {
  if (typeof form.requestSubmit === "function") {
    try {
      if (submitter) form.requestSubmit(submitter);
      else form.requestSubmit();
      return;
    } catch {
      // Fall through to a submit-button click if the submitter is stale.
    }
  }
  if (submitter) {
    submitter.click();
  }
}

function isSubmitButton(element) {
  if (element instanceof HTMLButtonElement) return element.type === "submit";
  if (element instanceof HTMLInputElement) {
    return element.type === "submit" || element.type === "image";
  }
  return false;
}

function isDestructiveFormAction(action) {
  const path = action.split("?")[0].toLowerCase();
  return /(?:^|\/)(?:logout|delete)\/?$/.test(path);
}

function eventElement(event) {
  const target = event.target;
  if (target instanceof Element) return target;
  return target?.parentElement ?? null;
}
