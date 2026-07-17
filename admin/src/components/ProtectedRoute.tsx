import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { isAuthenticated, logout } from "../lib/auth";

export function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">Pular para o conteúdo</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="admin-brand" to="/" aria-label="Gotas Cultas Admin — início">
            <span aria-hidden="true" className="brand-mark" />
            <span>Gotas Cultas <small>Admin</small></span>
          </Link>
          <nav aria-label="Navegação administrativa">
            <NavLink to="/" end>Posts</NavLink>
            <NavLink to="/metrics">Métricas</NavLink>
            <button className="button button-quiet" onClick={logout}>Sair</button>
          </nav>
        </div>
      </header>
      <main id="admin-content" className="admin-content"><Outlet /></main>
    </div>
  );
}
