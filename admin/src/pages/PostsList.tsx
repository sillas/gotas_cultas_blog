import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { AdminPostSummary } from "@blog/shared";
import { api } from "../lib/api";

const CURRENT_YEAR = new Date().getUTCFullYear();
const EARLIEST_YEAR = 2000;
const POST_TABS = ["published", "scheduled", "drafts"] as const;

type PostTab = (typeof POST_TABS)[number];

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
  const [activeTab, setActiveTab] = useState<PostTab>("published");
  const [loading, setLoading] = useState(true);
  const [loadingPublished, setLoadingPublished] = useState(true);
  const [error, setError] = useState<string | null>(navigationError);
  const tabRefs = useRef<Record<PostTab, HTMLButtonElement | null>>({
    published: null,
    scheduled: null,
    drafts: null,
  });

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

  function selectAdjacentTab(direction: 1 | -1) {
    const currentIndex = POST_TABS.indexOf(activeTab);
    const nextIndex = (currentIndex + direction + POST_TABS.length) % POST_TABS.length;
    const nextTab = POST_TABS[nextIndex];
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Conteúdo</p><h1>Publicações</h1><p>Gerencie rascunhos, agendamentos e textos publicados.</p></div>
        <Link className="button button-primary" to="/posts/new">Novo post</Link>
      </header>

      {error && <p className="alert alert-error" role="alert">{error}</p>}

      <div className="posts-tabs">
        <div className="posts-tab-list" role="tablist" aria-label="Status das publicações" onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); selectAdjacentTab(1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); selectAdjacentTab(-1); }
          if (event.key === "Home") { event.preventDefault(); setActiveTab("published"); tabRefs.current.published?.focus(); }
          if (event.key === "End") { event.preventDefault(); setActiveTab("drafts"); tabRefs.current.drafts?.focus(); }
        }}>
          {POST_TABS.map((tab) => {
            const labels: Record<PostTab, string> = { published: "Publicados", scheduled: "Agendados", drafts: "Rascunhos" };
            const counts: Record<PostTab, number | null> = { published: loadingPublished ? null : published.length, scheduled: loading ? null : scheduled.length, drafts: loading ? null : drafts.length };
            return <button
              key={tab}
              ref={(element) => { tabRefs.current[tab] = element; }}
              id={`${tab}-tab`}
              className="posts-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`${tab}-panel`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
            >{labels[tab]} {counts[tab] !== null && <span>{counts[tab]}</span>}</button>;
          })}
        </div>

        <section id="published-panel" className="post-group posts-tab-panel" role="tabpanel" aria-labelledby="published-tab" tabIndex={0} hidden={activeTab !== "published"}>
          <div className="post-group-heading">
            <div><p className="eyebrow">Arquivo anual</p><h2 id="published-heading">Publicados em {publishedYear} <span>{published.length}</span></h2></div>
            <div className="year-navigation" aria-label="Navegação por ano">
              <button className="button button-secondary" disabled={loadingPublished || publishedYear === CURRENT_YEAR} onClick={() => void loadPublished(CURRENT_YEAR)}>Ano Atual</button>
              <button className="button button-secondary" disabled={loadingPublished || publishedYear >= CURRENT_YEAR} onClick={() => void loadPublished(publishedYear + 1)}>← Próximo ano</button>
              <button className="button button-secondary" disabled={loadingPublished || publishedYear <= EARLIEST_YEAR} onClick={() => void loadPublished(publishedYear - 1, true)}>Ano anterior →</button>
            </div>
          </div>
          {loadingPublished ? <p className="loading-state" role="status">Carregando publicações…</p> : <PostTable posts={published} emptyMessage={`Nenhuma publicação encontrada em ${publishedYear}.`} onDelete={handleDelete} />}
        </section>

        <section id="scheduled-panel" className="post-group posts-tab-panel" role="tabpanel" aria-labelledby="scheduled-tab" tabIndex={0} hidden={activeTab !== "scheduled"}>
          <div className="post-group-heading"><div><p className="eyebrow">Fila de publicação</p><h2 id="scheduled-heading">Agendados <span>{scheduled.length}</span></h2></div></div>
          {loading ? <p className="loading-state" role="status">Carregando agendamentos…</p> : <PostTable posts={scheduled} emptyMessage="Nenhuma publicação agendada." onDelete={handleDelete} />}
        </section>

        <section id="drafts-panel" className="post-group posts-tab-panel" role="tabpanel" aria-labelledby="drafts-tab" tabIndex={0} hidden={activeTab !== "drafts"}>
          <div className="post-group-heading"><div><p className="eyebrow">Em elaboração</p><h2 id="drafts-heading">Rascunhos <span>{drafts.length}</span></h2></div></div>
          {loading ? <p className="loading-state" role="status">Carregando rascunhos…</p> : <PostTable posts={drafts} emptyMessage="Nenhum rascunho." onDelete={handleDelete} />}
        </section>
      </div>
    </div>
  );
}
