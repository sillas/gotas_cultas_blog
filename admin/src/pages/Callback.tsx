import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleCallback } from "../lib/auth";

export function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // React Strict Mode replays effects in development. OAuth codes and our
    // state/verifier pair are deliberately single-use, so start only once.
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    window.history.replaceState(null, "", window.location.pathname);
    if (!code || !state) {
      setError("Código de autorização ou estado OAuth ausente na URL de retorno.");
      return;
    }
    handleCallback(code, state)
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
