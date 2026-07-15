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
 * Fires a repository_dispatch event so the GitHub Actions workflow rebuilds
 * and redeploys the static site (PROJECT_SPEC.md section 5). Best-effort:
 * a failure here must not roll back the DynamoDB write that already
 * succeeded — the author can always re-trigger the workflow manually.
 */
export async function triggerSiteRebuild(reason: string): Promise<void> {
  try {
    const token = await getGithubToken();
    const repo = process.env.GITHUB_REPO!;

    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: "content-published", client_payload: { reason } }),
  });

    if (!response.ok) throw new Error(`repository_dispatch failed (${response.status}): ${await response.text()}`);
  } catch (error) {
    console.error(JSON.stringify({ event: "site_rebuild_dispatch_failed", reason, error: String(error) }));
  }
}
