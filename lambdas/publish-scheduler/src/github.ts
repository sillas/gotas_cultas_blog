import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { createHmac } from "node:crypto";

const secretsClient = new SecretsManagerClient({});
let cachedCredentials: { token: string; hmacSecret: string } | undefined;

async function getGithubCredentials(): Promise<{ token: string; hmacSecret: string }> {
  if (cachedCredentials) return cachedCredentials;
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: process.env.GITHUB_TOKEN_SECRET_ARN! })
  );
  const parsed = JSON.parse(response.SecretString!);
  if (!parsed.token || !parsed.hmacSecret) throw new Error("GitHub dispatch credentials are incomplete");
  cachedCredentials = parsed;
  return cachedCredentials!;
}

/**
 * Same trigger as lambdas/posts/src/github.ts, intentionally duplicated
 * rather than shared: it's Node/AWS-SDK-specific and packages/shared is
 * also consumed by the browser admin bundle, which must stay dependency-free
 * of server-only code.
 */
export async function triggerSiteRebuild(reason: string): Promise<void> {
  const { token, hmacSecret } = await getGithubCredentials();
  const repo = process.env.GITHUB_REPO!;
  const stage = process.env.DEPLOY_STAGE!;
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", hmacSecret)
    .update(`${timestamp}.${stage}.${reason}`)
    .digest("hex");

  const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "content-published",
      client_payload: { reason, stage, timestamp, signature },
    }),
  });

  if (!response.ok) {
    console.error(`[github] repository_dispatch failed (${response.status}): ${await response.text()}`);
  }
}
