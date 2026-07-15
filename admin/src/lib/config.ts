// Filled from CDK stack outputs after the first `cdk deploy` (see infra/).
export const config = {
  authMode: import.meta.env.VITE_AUTH_MODE ?? "cognito",
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN ?? "",
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? "",
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI ?? `${window.location.origin}/admin/callback`,
  logoutRedirectUri: import.meta.env.VITE_COGNITO_LOGOUT_REDIRECT_URI ?? `${window.location.origin}/admin/login`,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api",
};
