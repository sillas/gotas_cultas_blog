import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "@blog/shared";
import { api } from "../lib/api";

export function PostsList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPosts()
      .then(setPosts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(slug: string) {
    if (!window.confirm(`Excluir o post "${slug}"? Essa ação não pode ser desfeita.`)) return;
    try {
      setError(null);
      await api.deletePost(slug);
      setPosts((prev) => prev.filter((post) => post.slug !== slug));
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

      {loading && <p className="loading-state" role="status">Carregando publicações…</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}

      {!loading && !error && posts.length === 0 && <div className="empty-state"><h2>Nenhuma publicação</h2><p>Comece criando o primeiro texto do Gotas Cultas.</p></div>}
      {posts.length > 0 && <div className="table-wrap"><table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Status</th>
            <th>Publicação</th>
            <th>Views</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.slug}>
              <td>{post.title}</td>
              <td><span className={`status status-${post.status}`}>{post.status}</span></td>
              <td>{post.publishAt ? new Date(post.publishAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
              <td>{post.viewCount}</td>
              <td>
                <div className="row-actions">
                {post.status === "published" && (
                  <a
                    className="button button-small button-secondary"
                    href={`/post/${post.slug}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver post <span className="external-link-mark" aria-hidden="true">↗</span>
                  </a>
                )}
                <Link className="button button-small button-secondary" to={`/posts/${post.slug}`}>Editar</Link>
                <button className="button button-small button-danger" onClick={() => handleDelete(post.slug)}>Excluir</button></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>}
    </div>
  );
}
