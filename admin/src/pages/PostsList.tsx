import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AdminPostSummary } from "@blog/shared";
import { api } from "../lib/api";

const CURRENT_YEAR = new Date().getUTCFullYear();
const EARLIEST_YEAR = 2000;

interface PostTableProps {
  posts: AdminPostSummary[];
  emptyMessage: string;
  onDelete: (slug: string) => Promise<void>;
}

function PostTable({ posts, emptyMessage, onDelete }: PostTableProps) {
  if (posts.length === 0) return <p className="muted">{emptyMessage}</p>;
  return <div className="table-wrap"><table>
    <thead><tr><th>Título</th><th>Categoria</th><th>Data</th><th></th></tr></thead>
    <tbody>{posts.map((post) => <tr key={post.slug}>
      <td>{post.title}</td>
      <td>{post.category}</td>
      <td>{post.publishAt ? new Date(post.publishAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : new Date(post.updatedAt).toLocaleDateString("pt-BR")}</td>
      <td><div className="row-actions">
        {post.status === "published" && <a className="button button-small button-secondary" href={`/post/${post.slug}/`} target="_blank" rel="noopener noreferrer">Ver post <span className="external-link-mark" aria-hidden="true">↗</span></a>}
        <Link className="button button-small button-secondary" to={`/posts/${post.slug}`}>Editar</Link>
        <button className="button button-small button-danger" onClick={() => void onDelete(post.slug)}>Excluir</button>
      </div></td>
    </tr>)}</tbody>
  </table></div>;
}

export function PostsList() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationError = typeof location.state?.error === "string" ? location.state.error : null;
  const [drafts, setDrafts] = useState<AdminPostSummary[]>([]);
  const [scheduled, setScheduled] = useState<AdminPostSummary[]>([]);
  const [published, setPublished] = useState<AdminPostSummary[]>([]);
  const [publishedYear, setPublishedYear] = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState(true);
  const [loadingPublished, setLoadingPublished] = useState(true);
  const [error, setError] = useState<string | null>(navigationError);

  useEffect(() => {
    if (navigationError) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, navigationError]);

  useEffect(() => {
    Promise.all([api.listPosts("draft"), api.listPosts("scheduled")])
      .then(([draftResult, scheduledResult]) => {
        setDrafts(draftResult.items);
        setScheduled(scheduledResult.items);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function loadPublished(startYear: number, searchPrevious = false) {
    setLoadingPublished(true);
    setError(null);
    try {
      let year = Math.min(startYear, CURRENT_YEAR);
      while (year >= EARLIEST_YEAR) {
        const result = await api.listPosts("published", year);
        if (result.items.length > 0 || !searchPrevious) {
          setPublished(result.items);
          setPublishedYear(year);
          return;
        }
        year -= 1;
      }
      setPublished([]);
      setPublishedYear(Math.max(EARLIEST_YEAR, Math.min(startYear, CURRENT_YEAR)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as publicações.");
    } finally {
      setLoadingPublished(false);
    }
  }

  useEffect(() => { void loadPublished(CURRENT_YEAR, true); }, []);

  async function handleDelete(slug: string) {
    if (!window.confirm(`Excluir o post "${slug}"? Essa ação não pode ser desfeita.`)) return;
    try {
      setError(null);
      const wasLastPublishedInYear = published.length === 1 && published[0]?.slug === slug;
      await api.deletePost(slug);
      setDrafts((prev) => prev.filter((post) => post.slug !== slug));
      setScheduled((prev) => prev.filter((post) => post.slug !== slug));
      setPublished((prev) => prev.filter((post) => post.slug !== slug));
      if (wasLastPublishedInYear && publishedYear > EARLIEST_YEAR) {
        await loadPublished(publishedYear - 1, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir a publicação.");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Conteúdo</p><h1>Publicações</h1><p>Gerencie rascunhos, agendamentos e textos publicados.</p></div>
        <Link className="button button-primary" to="/posts/new">Novo post</Link>
      </header>

      {loading && <p className="loading-state" role="status">Carregando rascunhos e agendamentos…</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}

      {!loading && <section className="post-group" aria-labelledby="drafts-heading">
        <div className="post-group-heading"><div><p className="eyebrow">Em elaboração</p><h2 id="drafts-heading">Rascunhos <span>{drafts.length}</span></h2></div></div>
        <PostTable posts={drafts} emptyMessage="Nenhum rascunho." onDelete={handleDelete} />
      </section>}

      {!loading && <section className="post-group" aria-labelledby="scheduled-heading">
        <div className="post-group-heading"><div><p className="eyebrow">Fila de publicação</p><h2 id="scheduled-heading">Agendados <span>{scheduled.length}</span></h2></div></div>
        <PostTable posts={scheduled} emptyMessage="Nenhuma publicação agendada." onDelete={handleDelete} />
      </section>}

      <section className="post-group" aria-labelledby="published-heading">
        <div className="post-group-heading">
          <div><p className="eyebrow">Arquivo anual</p><h2 id="published-heading">Publicados em {publishedYear} <span>{published.length}</span></h2></div>
          <div className="year-navigation" aria-label="Navegação por ano">
            <button className="button button-secondary" disabled={loadingPublished || publishedYear <= EARLIEST_YEAR} onClick={() => void loadPublished(publishedYear - 1, true)}>← Ano anterior</button>
            <button className="button button-secondary" disabled={loadingPublished || publishedYear >= CURRENT_YEAR} onClick={() => void loadPublished(publishedYear + 1)}>Próximo ano →</button>
          </div>
        </div>
        {loadingPublished ? <p className="loading-state" role="status">Carregando publicações…</p> : <PostTable posts={published} emptyMessage={`Nenhuma publicação encontrada em ${publishedYear}.`} onDelete={handleDelete} />}
      </section>
    </div>
  );
}
