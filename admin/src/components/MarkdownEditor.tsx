import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  const preview = sanitizeHtml(marked.parse(value) as string, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt", "title"], a: ["href", "target", "rel"] },
  });
  return (
    <div className="markdown-editor">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={20}
        placeholder="Escreva o post em Markdown..."
      />
      <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  );
}
