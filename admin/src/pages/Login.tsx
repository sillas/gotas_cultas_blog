import { login } from "../lib/auth";

export function Login() {
  return (
    <div className="centered">
      <h1>Admin — Meu Blog</h1>
      <button onClick={() => login()}>Entrar</button>
    </div>
  );
}
