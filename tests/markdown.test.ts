import { describe, expect, it } from "vitest";
import { applyMarkdownCommand } from "../src/client/markdown-editor.js";
import {
  fallbackMarkdownHtml,
  isAllowedHref,
  isAllowedImageSrc,
} from "../src/markdown/pipeline.js";
import { renderMarkdown } from "../src/markdown/render.js";

describe("markdown rendering and sanitization", () => {
  it("renders common formatting through the shared pipeline", () => {
    const html = renderMarkdown(`# Heading

**Bold** and *italic* and ~~struck~~

- List item
- List item

1. Ordered item
2. Ordered item

> Blockquote

\`inline code\`

\`\`\`javascript
alert("test")
\`\`\`

[Example](https://example.com)
`);

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<del>struck</del>");
    expect(html).toContain("<li>List item</li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>inline code</code>");
    expect(html).toContain("<pre>");
    expect(html).toMatch(/alert\(/);
    expect(html).not.toContain("<script");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("strips raw HTML, scripts, handlers, and javascript URLs", () => {
    const html = renderMarkdown(`<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
[javascript link](javascript:alert('XSS'))
<iframe src="javascript:alert('XSS')"></iframe>
<div onclick="alert('XSS')">Click me</div>
[data image](data:text/html,<script>alert(1)</script>)
`);

    const normalized = html.toLowerCase();
    expect(normalized).not.toMatch(/<script[\s>]/);
    expect(normalized).not.toMatch(/<[^>]+onerror\s*=/);
    expect(normalized).not.toMatch(/<[^>]+onclick\s*=/);
    expect(normalized).not.toContain("javascript:");
    expect(normalized).not.toMatch(/<iframe[\s>]/);
    expect(normalized).not.toMatch(/<div[\s>]/);
  });

  it("rejects dangerous image protocols while allowing https images", () => {
    const html = renderMarkdown(
      `![ok](https://example.com/cat.gif) ![nope](javascript:alert(1)) ![data](data:image/svg+xml,<svg>)`,
    );
    expect(html).toContain('src="https://example.com/cat.gif"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toContain("data:image");
  });

  it("falls back to escaped plain text and treats empty input as empty", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
    expect(fallbackMarkdownHtml("<hi>")).toBe("<p>&lt;hi&gt;</p>");
    expect(isAllowedHref("javascript:alert(1)")).toBe(false);
    expect(isAllowedHref("//evil.example")).toBe(false);
    expect(isAllowedHref("/posts/1")).toBe(true);
    expect(isAllowedImageSrc("mailto:hi@example.com")).toBe(false);
    expect(isAllowedImageSrc("https://example.com/x.png")).toBe(true);
  });

  it("does not let a failed parse expose unsanitized HTML", () => {
    const html = renderMarkdown("<b>safe-ish</b> **still bold**");
    expect(html).not.toContain("<b>");
    expect(html).toContain("<strong>still bold</strong>");
  });
});

describe("markdown toolbar commands", () => {
  it("wraps, prefixes, and restores selection for common shortcuts", () => {
    const area = fakeTextarea("hello", 0, 5);
    expect(applyMarkdownCommand(area, "bold")).toBe(true);
    expect(area.value).toBe("**hello**");
    expect(area.selectionStart).toBe(2);
    expect(area.selectionEnd).toBe(7);

    const italic = fakeTextarea("", 0, 0);
    applyMarkdownCommand(italic, "italic");
    expect(italic.value).toBe("*italic text*");
    expect(italic.selectionStart).toBe(1);
    expect(italic.selectionEnd).toBe(12);

    const heading = fakeTextarea("Title", 0, 5);
    applyMarkdownCommand(heading, "heading");
    expect(heading.value).toBe("# Title");

    const list = fakeTextarea("one\ntwo", 0, 7);
    applyMarkdownCommand(list, "ul");
    expect(list.value).toBe("- one\n- two");

    const link = fakeTextarea("docs", 0, 4);
    applyMarkdownCommand(link, "link");
    expect(link.value).toBe("[docs](https://example.com)");
    expect(link.selectionStart).toBe(7);
    expect(link.selectionEnd).toBe(26);
  });

  it("toggles wrapping off and clears markers without dropping the source", () => {
    const area = fakeTextarea("**hello**", 0, 9);
    applyMarkdownCommand(area, "bold");
    expect(area.value).toBe("hello");

    const messy = fakeTextarea("**bold** and `code`", 0, 19);
    applyMarkdownCommand(messy, "clear");
    expect(messy.value).toBe("bold and code");
  });
});

function fakeTextarea(value: string, start: number, end: number) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    setSelectionRange(nextStart: number, nextEnd: number) {
      this.selectionStart = nextStart;
      this.selectionEnd = nextEnd;
    },
    dispatchEvent() {
      return true;
    },
    focus() {
      return undefined;
    },
  };
}
