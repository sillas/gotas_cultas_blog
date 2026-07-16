import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const secretsClient = new SecretsManagerClient({});
let cachedToken: string | undefined;

async function getGithubToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.GITHUB_TOKEN_SECRET_ARN! })
  );
  cachedToken = response.SecretString!;
  return cachedToken;
}

/**
 * Same trigger as lambdas/posts/src/github.ts, intentionally duplicated
 * rather than shared: it's Node/AWS-SDK-specific and packages/shared is
 * also consumed by the browser admin bundle, which must stay dependency-free
 * of server-only code.
 */
export async function triggerSiteRebuild(reason: string): Promise<void> {
  const token = await getGithubToken();
  const repo = process.env.GITHUB_REPO!;

  const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "content-published",
      client_payload: { reason, stage: process.env.DEPLOY_STAGE },
    }),
  });

  if (!response.ok) {
    console.error(`[github] repository_dispatch failed (${response.status}): ${await response.text()}`);
  }
}
