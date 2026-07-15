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
      <div className="centered">
        <p>Erro no login: {error}</p>
        <a href="/admin/login">Tentar novamente</a>
      </div>
    );
  }

  return <div className="centered">Autenticando...</div>;
}
