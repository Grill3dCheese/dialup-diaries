import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  durationForFlashKind,
  FLASH_DURATION_MS,
  FLASH_ERROR_DURATION_MS,
  flashKindFromClassName,
} from "../src/client/flash.js";

describe("flash timing", () => {
  it("gives technical errors extra reading time", () => {
    expect(FLASH_DURATION_MS).toBe(4000);
    expect(FLASH_ERROR_DURATION_MS).toBe(6000);
    expect(durationForFlashKind("success")).toBe(4000);
    expect(durationForFlashKind("warning")).toBe(4000);
    expect(durationForFlashKind("info")).toBe(4000);
    expect(durationForFlashKind("error")).toBe(6000);
  });

  it("recognizes both BEM and legacy error class names", () => {
    expect(flashKindFromClassName("flash flash--error")).toBe("error");
    expect(flashKindFromClassName("flash flash-error")).toBe("error");
    expect(flashKindFromClassName("flash flash--success")).toBe("success");
    expect(flashKindFromClassName("flash flash--warning")).toBe("warning");
    expect(flashKindFromClassName("flash")).toBe("info");
  });
});

describe("flash controller wiring", () => {
  it("routes every toast through one countdown loop with hover pause", () => {
    const source = readFileSync(path.resolve("src/client/flash.js"), "utf8");
    expect(source).toContain("requestAnimationFrame(tick)");
    expect(source).toContain("performance.now()");
    expect(source).toContain('addEventListener("mouseenter"');
    expect(source).toContain('addEventListener("mouseleave"');
    expect(source).toContain("transition = `width ${remaining}ms linear`");
    expect(source).toContain("inputController.abort()");
    expect(source).toContain("window.clearTimeout(fadeTimer)");
    expect(source).toContain("[data-dismiss]");
    expect(source).toContain("is-leaving");
  });

  it("arms server flashes and client pager errors from the same pipeline", () => {
    const app = readFileSync(path.resolve("src/client/app.js"), "utf8");
    expect(app).toContain('from "./flash.js"');
    expect(app).toContain("armAllFlashes()");
    expect(app).toContain("onError: showToast");
    expect(app).not.toContain("window.setTimeout(() => toast.remove()");
    expect(app).not.toContain('className = "flash flash--error"');
  });
});
