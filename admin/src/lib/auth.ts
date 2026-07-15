// Cognito Hosted UI, OAuth2 Authorization Code + PKCE. No aws-amplify
// dependency — a single-admin app doesn't need its full surface, and this
// keeps the admin bundle small (PROJECT_SPEC.md section 2, "manter simples").
import { config } from "./config";

const VERIFIER_STORAGE_KEY = "pkce_code_verifier";
const TOKENS_STORAGE_KEY = "auth_tokens";

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer).slice(0, length);
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

export async function login(): Promise<void> {
  const verifier = randomString(64);
  sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
  const challenge = base64UrlEncode(await sha256(verifier));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.cognitoClientId,
    redirect_uri: config.redirectUri,
    scope: "openid email",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `https://${config.cognitoDomain}/oauth2/authorize?${params.toString()}`;
}

export async function handleCallback(code: string): Promise<void> {
  const verifier = sessionStorage.getItem(VERIFIER_STORAGE_KEY);
  if (!verifier) throw new Error("Missing PKCE code_verifier — restart the login flow.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.cognitoClientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(`https://${config.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const tokens = (await response.json()) as TokenResponse;
  sessionStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify({ ...tokens, obtainedAt: Date.now() }));
  sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
}

function readTokens(): (TokenResponse & { obtainedAt: number }) | null {
  const raw = sessionStorage.getItem(TOKENS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isAuthenticated(): boolean {
  const tokens = readTokens();
  if (!tokens) return false;
  const expiresAt = tokens.obtainedAt + tokens.expires_in * 1000;
  return Date.now() < expiresAt;
}

export function getIdToken(): string | null {
  return readTokens()?.id_token ?? null;
}

export function logout(): void {
  sessionStorage.removeItem(TOKENS_STORAGE_KEY);
  const params = new URLSearchParams({
    client_id: config.cognitoClientId,
    logout_uri: config.logoutRedirectUri,
  });
  window.location.href = `https://${config.cognitoDomain}/logout?${params.toString()}`;
}
