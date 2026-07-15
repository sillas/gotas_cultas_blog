import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Raw HTML in Markdown is stripped by default (sanitize-html's baseline
 * allowlist). See PROJECT_SPEC.md section 13.2 — defense in depth in case
 * the single admin account is ever compromised.
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "loading"],
      a: ["href", "name", "target", "rel"],
    },
  });
}
