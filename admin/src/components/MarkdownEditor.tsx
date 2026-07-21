import { useLayoutEffect, useRef } from "react";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownEditor({ value, onChange }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preview = sanitizeHtml(marked.parse(value) as string, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt", "title"], a: ["href", "target", "rel"] },
  });

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <div className="markdown-editor">
      <textarea
        ref={textareaRef}
        aria-label="Editor Markdown"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={20}
        placeholder="Escreva o post em Markdown..."
      />
      <div className="markdown-preview" aria-label="Pré-visualização do conteúdo" dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  );
}
