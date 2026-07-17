import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleCallback } from "../lib/auth";

export function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("Código de autorização ausente na URL de retorno.");
      return;
    }
    handleCallback(code)
      .then(() => navigate("/", { replace: true }))
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao autenticar."));
  }, [navigate]);

  if (error) {
    return (
      <main className="auth-page"><section className="auth-card">
        <p className="alert alert-error" role="alert">Erro no login: {error}</p>
        <a className="button button-secondary" href="/admin/login">Tentar novamente</a>
      </section></main>
    );
  }

  return <main className="auth-page"><div className="loading-state" role="status">Autenticando…</div></main>;
}
