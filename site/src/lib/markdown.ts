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
      img: ["src", "alt", "title", "loading", "decoding", "width", "height"],
      a: ["href", "name", "target", "rel"],
    },
    transformTags: {
      // The page title is the article's only h1. Shift Markdown headings one
      // level down so the document outline remains useful to assistive tech.
      h1: (tagName, attribs) => ({ tagName: "h2", attribs }),
      h2: (tagName, attribs) => ({ tagName: "h3", attribs }),
      h3: (tagName, attribs) => ({ tagName: "h4", attribs }),
      h4: (tagName, attribs) => ({ tagName: "h5", attribs }),
      h5: (tagName, attribs) => ({ tagName: "h6", attribs }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // Images embedded in the article body are below the article header.
          // Keep an explicit author choice, but lazy-load Markdown's default.
          loading: attribs.loading ?? "lazy",
          decoding: "async",
        },
      }),
    },
  });
}
