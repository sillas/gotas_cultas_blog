import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PostInput, PostStatus } from "@blog/shared";
import { api } from "../lib/api";
import { slugify } from "../lib/slugify";
import { MarkdownEditor } from "../components/MarkdownEditor";

const EMPTY_POST: PostInput = {
  slug: "",
  title: "",
  description: "",
  category: "",
  tags: [],
  coverImageKey: null,
  contentMarkdown: "",
  status: "draft",
  publishAt: null,
};

export function PostEditor() {
  const { slug: existingSlug } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(existingSlug);

  const [post, setPost] = useState<PostInput>(EMPTY_POST);
  const [tagsInput, setTagsInput] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingSlug) return;
    api.getPost(existingSlug).then((existing) => {
      setPost(existing);
      setTagsInput(existing.tags.join(", "));
      setSlugManuallyEdited(true);
    });
  }, [existingSlug]);

  function handleTitleChange(title: string) {
    setPost((prev) => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : slugify(title),
    }));
  }

  // publishAt is stored in UTC in DynamoDB; the <input type="datetime-local">
  // works in the author's local time zone (PROJECT_SPEC.md section 13.5).
  function handlePublishAtChange(localValue: string) {
    setPost((prev) => ({
      ...prev,
      publishAt: localValue ? new Date(localValue).toISOString() : null,
    }));
  }

  function localDatetimeValue(iso: string | null): string {
    if (!iso) return "";
    const date = new Date(iso);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
  }

  async function handleCoverImageChange(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 8 MB.");
      return;
    }
    const { uploadUrl, publicUrl } = await api.presignUpload(file.name, file.type);
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    setPost((prev) => ({ ...prev, coverImageKey: publicUrl }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input: PostInput = {
      ...post,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    try {
      if (isEditing) {
        await api.updatePost(existingSlug!, input);
      } else {
        await api.createPost(input);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="post-editor">
      <header className="page-header"><div><p className="eyebrow">Editor</p><h1>{isEditing ? "Editar post" : "Novo post"}</h1><p>Organize os metadados, escreva o conteúdo e defina a publicação.</p></div></header>
      {error && <p className="alert alert-error" role="alert">{error}</p>}

      <label>
        Título
        <input value={post.title} onChange={(e) => handleTitleChange(e.target.value)} required />
      </label>

      <label>
        Slug
        <input
          value={post.slug}
          onChange={(e) => {
            setSlugManuallyEdited(true);
            setPost((prev) => ({ ...prev, slug: e.target.value }));
          }}
          disabled={isEditing}
          required
        />
      </label>

      <label>
        Descrição (meta description / resumo)
        <textarea
          value={post.description}
          onChange={(e) => setPost((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
          required
        />
      </label>

      <label>
        Categoria
        <input
          value={post.category}
          onChange={(e) => setPost((prev) => ({ ...prev, category: e.target.value }))}
          required
        />
      </label>

      <label>
        Tags (separadas por vírgula)
        <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
      </label>

      <label>
        Imagem de capa (alt text = título, usado como já aplicado acima)
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleCoverImageChange(e.target.files[0])}
        />
        {post.coverImageKey && <img src={post.coverImageKey} alt="Capa" className="cover-preview" />}
      </label>

      <label>
        Conteúdo (Markdown)
        <MarkdownEditor
          value={post.contentMarkdown}
          onChange={(value) => setPost((prev) => ({ ...prev, contentMarkdown: value }))}
        />
      </label>

      <label>
        Status
        <select
          value={post.status}
          onChange={(e) => setPost((prev) => ({ ...prev, status: e.target.value as PostStatus }))}
        >
          <option value="draft">Rascunho</option>
          <option value="scheduled">Agendado</option>
          <option value="published">Publicado</option>
        </select>
      </label>

      {post.status !== "draft" && (
        <label>
          Data/hora de publicação (fuso local)
          <input
            type="datetime-local"
            value={localDatetimeValue(post.publishAt)}
            onChange={(e) => handlePublishAtChange(e.target.value)}
            required
          />
        </label>
      )}

      <div className="sticky-actions"><button className="button button-primary" type="submit" disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </button></div>
    </form>
  );
}
