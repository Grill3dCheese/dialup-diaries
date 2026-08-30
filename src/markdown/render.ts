import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { createMarkdownRenderer } from "./pipeline.js";

const { window } = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "https://dialup.invalid/",
  pretendToBeVisual: false,
});

const purify = DOMPurify(window);

export const renderMarkdown = createMarkdownRenderer(purify);
