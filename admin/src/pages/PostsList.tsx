import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "@blog/shared";
import { api } from "../lib/api";
import { logout } from "../lib/auth";

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
    await api.deletePost(slug);
    setPosts((prev) => prev.filter((post) => post.slug !== slug));
  }

  return (
    <div>
      <header className="admin-header">
        <h1>Posts</h1>
        <div>
          <Link to="/metrics">Métricas</Link>
          <Link to="/posts/new">Novo post</Link>
          <button onClick={logout}>Sair</button>
        </div>
      </header>

      {loading && <p>Carregando...</p>}
      {error && <p role="alert">{error}</p>}

      <table>
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
              <td>{post.status}</td>
              <td>{post.publishAt ?? "—"}</td>
              <td>{post.viewCount}</td>
              <td>
                <Link to={`/posts/${post.slug}`}>Editar</Link>{" "}
                <button onClick={() => handleDelete(post.slug)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
