import { login } from "../lib/auth";

export function Login() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand"><span aria-hidden="true" className="brand-mark" /> Gotas Cultas</div>
        <p className="eyebrow">Área editorial</p>
        <h1 id="login-title">Administração</h1>
        <p>Acesse o ambiente seguro para escrever, revisar e publicar reflexões.</p>
        <button className="button button-primary button-wide" onClick={() => login()}>Entrar no painel</button>
      </section>
    </main>
  );
}
