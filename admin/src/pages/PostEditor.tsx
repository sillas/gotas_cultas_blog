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
  coverImage: null,
  contentMarkdown: "",
  status: "draft",
  publishAt: null,
};

function uploadForm(url: string, fields: Record<string, string>, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener("load", () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload rejeitado (${xhr.status}).`)));
    xhr.addEventListener("error", () => reject(new Error("Falha de rede durante o upload.")));
    xhr.send(form);
  });
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function PostEditor() {
  const { slug: existingSlug } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(existingSlug);

  const [post, setPost] = useState<PostInput>(EMPTY_POST);
  const [tagsInput, setTagsInput] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [originalStatus, setOriginalStatus] = useState<PostStatus | null>(null);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingSlug) return;
    api.getPost(existingSlug).then((existing) => {
      setPost(existing);
      setTagsInput(existing.tags.join(", "));
      setSlugManuallyEdited(true);
      setOriginalStatus(existing.status);
      setExpectedUpdatedAt(existing.updatedAt);
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
    try {
      setError(null);
      setUploadProgress(0);
      const { uploadUrl, fields, image } = await api.presignUpload(file.name, file.type);
      setPost((prev) => ({ ...prev, coverImage: image, coverImageKey: null }));
      await uploadForm(uploadUrl, fields, file, setUploadProgress);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const current = await api.getUploadState(image.id);
        setPost((prev) => ({ ...prev, coverImage: current, coverImageKey: current.fallbackUrl ?? null }));
        if (current.status === "ready") return;
        if (current.status === "failed") throw new Error(current.error ?? "A imagem foi rejeitada durante o processamento.");
        await wait(1_000);
      }
      throw new Error("O processamento da imagem excedeu o tempo esperado. Tente novamente.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao processar a imagem.");
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input: PostInput = {
      ...post,
      publishAt:
        post.status === "published" && (originalStatus !== "published" || !post.publishAt)
          ? new Date().toISOString()
          : post.status === "draft"
            ? null
            : post.publishAt,
      tags: tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    try {
      if (isEditing) {
        if (!expectedUpdatedAt) throw new Error("A versão original do post não foi carregada.");
        await api.updatePost(existingSlug!, { ...input, expectedUpdatedAt });
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
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={(e) => e.target.files?.[0] && handleCoverImageChange(e.target.files[0])}
        />
        {uploadProgress !== null && <progress value={uploadProgress} max="100">{uploadProgress}%</progress>}
        {post.coverImage?.status === "processing" && <small className="field-hint">Processando e otimizando a capa…</small>}
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
          onChange={(e) => {
            const status = e.target.value as PostStatus;
            setPost((prev) => ({
              ...prev,
              status,
              publishAt: status === "scheduled" ? prev.publishAt : null,
            }));
          }}
        >
          <option value="draft">Rascunho</option>
          <option value="scheduled">Agendar</option>
          <option value="published">Publicar</option>
        </select>
        <small className="field-hint">
          {post.status === "draft" && "Salva sem disponibilizar o texto no site."}
          {post.status === "scheduled" && "Publica automaticamente na data e hora escolhidas."}
          {post.status === "published" && "Publica imediatamente usando a data e hora atuais."}
        </small>
      </label>

      {post.status === "scheduled" && (
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

      <div className="sticky-actions"><button className="button button-primary" type="submit" disabled={saving || uploadProgress !== null || (post.status !== "draft" && Boolean(post.coverImage) && post.coverImage?.status !== "ready")}>
        {saving ? "Salvando..." : "Salvar"}
      </button></div>
    </form>
  );
}
