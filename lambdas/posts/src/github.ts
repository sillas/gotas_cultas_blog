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
 * Fires a repository_dispatch event so the GitHub Actions workflow rebuilds
 * and redeploys the static site (PROJECT_SPEC.md section 5). Best-effort:
 * a failure here must not roll back the DynamoDB write that already
 * succeeded. Failures are rethrown so the caller can persist a recoverable
 * side-effect state or let EventBridge retry the invocation.
 */
export async function triggerSiteRebuild(reason: string): Promise<void> {
  try {
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

    if (!response.ok) throw new Error(`repository_dispatch failed (${response.status}): ${await response.text()}`);
  } catch (error) {
    console.error(JSON.stringify({ event: "site_rebuild_dispatch_failed", reason, error: String(error) }));
    throw error;
  }
}
