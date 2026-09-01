// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleKeyboardSubmit,
  initKeyboardSubmit,
  isSubmitShortcut,
  prefersMetaSubmitHint,
} from "../src/client/keyboard-submit.js";

describe("submit shortcut detection", () => {
  it("recognizes Control or Command with Enter and ignores other combos", () => {
    expect(isSubmitShortcut(key({ key: "Enter", ctrlKey: true }))).toBe(true);
    expect(isSubmitShortcut(key({ key: "Enter", metaKey: true }))).toBe(true);
    expect(isSubmitShortcut(key({ key: "Enter" }))).toBe(false);
    expect(
      isSubmitShortcut(key({ key: "Enter", ctrlKey: true, repeat: true })),
    ).toBe(false);
    expect(
      isSubmitShortcut(key({ key: "Enter", ctrlKey: true, altKey: true })),
    ).toBe(false);
    expect(
      isSubmitShortcut(key({ key: "Enter", ctrlKey: true, shiftKey: true })),
    ).toBe(false);
    expect(isSubmitShortcut(key({ key: "a", ctrlKey: true }))).toBe(false);
  });

  it("labels Mac-family platforms with the Command glyph only for the hint", () => {
    expect(prefersMetaSubmitHint("Win32")).toBe(false);
    expect(prefersMetaSubmitHint("Linux x86_64")).toBe(false);
    expect(prefersMetaSubmitHint("MacIntel")).toBe(true);
    expect(prefersMetaSubmitHint("iPhone")).toBe(true);
  });
});

describe("keyboard form submission", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    initKeyboardSubmit();
  });

  it("submits only the focused form through requestSubmit and the primary button", () => {
    document.body.innerHTML = `
      <form id="composer" action="/posts" method="post">
        <textarea id="composer-body" name="content"></textarea>
        <button class="button button--primary" type="submit" name="intent" value="publish">Publish</button>
      </form>
      <form id="reply" action="/posts/1/comments" method="post">
        <textarea id="reply-body" name="body"></textarea>
        <button class="button button--primary" type="submit" name="intent" value="reply">Reply</button>
      </form>
    `;
    const composer = form("composer");
    const reply = form("reply");
    const composerSubmit = vi.fn();
    const replySubmit = vi.fn();
    composer.requestSubmit = composerSubmit;
    reply.requestSubmit = replySubmit;

    const replyBody = document.getElementById("reply-body");
    replyBody?.focus();
    dispatchShortcut(replyBody, { ctrlKey: true });

    expect(replySubmit).toHaveBeenCalledTimes(1);
    expect(replySubmit.mock.calls[0]?.[0]).toBe(
      reply.querySelector("button[type='submit']"),
    );
    expect(composerSubmit).not.toHaveBeenCalled();
  });

  it("treats Command+Enter the same as Control+Enter", () => {
    const { formEl, submit } = mountSingleForm();
    const area = formEl.querySelector("textarea");
    area?.focus();
    dispatchShortcut(area, { metaKey: true });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not submit on a plain Enter in a textarea", () => {
    const { formEl, submit } = mountSingleForm();
    const area = formEl.querySelector("textarea");
    area?.focus();
    const event = dispatchKey(area, { key: "Enter" });
    expect(submit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores held-key repeats so a stuck shortcut is one submit", () => {
    const { formEl, submit } = mountSingleForm();
    const area = formEl.querySelector("textarea");
    area?.focus();
    dispatchShortcut(area, { ctrlKey: true });
    dispatchShortcut(area, { ctrlKey: true, repeat: true });
    dispatchShortcut(area, { ctrlKey: true, repeat: true });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not submit destructive, logout, or opted-out forms", () => {
    document.body.innerHTML = `
      <form id="delete" class="danger-zone" action="/posts/1/delete" method="post" data-confirm-delete="Delete?">
        <textarea id="delete-note"></textarea>
        <button type="submit">Delete this post</button>
      </form>
      <form id="logout" action="/logout" method="post">
        <input id="logout-trap" name="note">
        <button type="submit">Sign out</button>
      </form>
      <form id="quiet" action="/settings" method="post" data-keyboard-submit="off">
        <input id="quiet-name" name="displayName">
        <button class="button button--primary" type="submit">Save</button>
      </form>
    `;
    for (const id of ["delete", "logout", "quiet"]) {
      const current = form(id);
      const spy = vi.fn();
      current.requestSubmit = spy;
      const control = current.querySelector("textarea, input");
      if (!(control instanceof HTMLElement)) {
        throw new Error(`expected a field in #${id}`);
      }
      control.focus();
      const event = dispatchShortcut(control, { ctrlKey: true });
      expect(spy, id).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it("does not submit when the primary button is disabled or the control is disabled", () => {
    const { formEl, submit, area } = mountSingleForm();
    const button = formEl.querySelector("button[type='submit']");
    if (button instanceof HTMLButtonElement) button.disabled = true;
    area.focus();
    expect(dispatchShortcut(area, { ctrlKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(submit).not.toHaveBeenCalled();

    if (button instanceof HTMLButtonElement) button.disabled = false;
    area.disabled = true;
    expect(dispatchShortcut(area, { ctrlKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not steal Ctrl+Enter from Markdown toolbar, tabs, or preview", () => {
    document.body.innerHTML = `
      <form id="composer" action="/posts" method="post">
        <div data-md-editor-host>
          <button type="button" data-md-cmd="bold" id="bold">B</button>
          <button type="button" data-md-tab="preview" id="preview-tab">Preview</button>
          <textarea id="draft"></textarea>
          <div data-md-panel="preview" tabindex="0" id="preview">Preview</div>
        </div>
        <button class="button button--primary" type="submit">Publish</button>
      </form>
    `;
    const composer = form("composer");
    const spy = vi.fn();
    composer.requestSubmit = spy;

    for (const id of ["bold", "preview-tab", "preview"]) {
      const node = document.getElementById(id);
      node?.focus();
      const event = dispatchShortcut(node, { ctrlKey: true });
      expect(spy, id).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }

    const draft = document.getElementById("draft");
    draft?.focus();
    dispatchShortcut(draft, { ctrlKey: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("prefers the primary submit action when a form has extra buttons", () => {
    document.body.innerHTML = `
      <form id="notes" action="/changelog" method="post">
        <textarea id="summary" name="summary"></textarea>
        <button type="button" data-add-changelog-group>Add another section</button>
        <button type="submit">Not this one</button>
        <button class="button button--primary" type="submit" id="save">Save these notes</button>
      </form>
    `;
    const notes = form("notes");
    const spy = vi.fn();
    notes.requestSubmit = spy;
    const summary = document.getElementById("summary");
    summary?.focus();
    dispatchShortcut(summary, { ctrlKey: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(document.getElementById("save"));
  });

  it("refuses to guess when two primary submit buttons exist", () => {
    document.body.innerHTML = `
      <form id="split" action="/save" method="post">
        <input id="title" name="title">
        <button class="button button--primary" type="submit" name="mode" value="draft">Save draft</button>
        <button class="button button--primary" type="submit" name="mode" value="live">Publish</button>
      </form>
    `;
    const split = form("split");
    const spy = vi.fn();
    split.requestSubmit = spy;
    const title = document.getElementById("title");
    title?.focus();
    const event = dispatchShortcut(title, { ctrlKey: true });
    expect(spy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("still works for a form inserted after the listener is bound", () => {
    initKeyboardSubmit();
    const { formEl, submit, area } = mountSingleForm();
    area.focus();
    dispatchShortcut(area, { ctrlKey: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(formEl.id).toBe("composer");
  });

  it("does nothing when focus is outside a form", () => {
    document.body.innerHTML = `<p id="reading" tabindex="0">Just browsing.</p>`;
    const reading = document.getElementById("reading");
    reading?.focus();
    const event = dispatchShortcut(reading, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(handleKeyboardSubmit(event)).toBe(false);
  });
});

describe("keyboard submit wiring", () => {
  it("arms one document listener from the client boot path", () => {
    const app = readFileSync(path.resolve("src/client/app.js"), "utf8");
    expect(app).toContain('from "./keyboard-submit.js"');
    expect(app).toContain("initKeyboardSubmit()");
    const source = readFileSync(
      path.resolve("src/client/keyboard-submit.js"),
      "utf8",
    );
    expect(source).toContain("requestSubmit");
    expect(source).toContain('document.addEventListener("keydown"');
    expect(source).toContain("shortcutBound");
  });
});

function mountSingleForm() {
  document.body.innerHTML = `
    <form id="composer" action="/posts" method="post">
      <textarea id="composer-body" name="content"></textarea>
      <button class="button button--primary" type="submit">Publish</button>
    </form>
  `;
  const formEl = form("composer");
  const submit = vi.fn();
  formEl.requestSubmit = submit;
  const area = document.getElementById("composer-body");
  if (!(area instanceof HTMLTextAreaElement)) {
    throw new Error("expected composer textarea");
  }
  return { formEl, submit, area };
}

function form(id: string) {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLFormElement)) {
    throw new Error(`expected form #${id}`);
  }
  return node;
}

function dispatchShortcut(
  target: Element | null,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean },
) {
  return dispatchKey(target, { key: "Enter", ...modifiers });
}

function dispatchKey(
  target: Element | null,
  init: KeyboardEventInit & { key: string },
) {
  if (!target) throw new Error("expected an event target");
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function key(init: KeyboardEventInit & { key: string }) {
  return new KeyboardEvent("keydown", init);
}
