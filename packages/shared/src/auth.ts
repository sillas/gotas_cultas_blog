const ADMIN_GROUP = "blog-admins";

/** Defense in depth beyond API Gateway's OAuth scope check. */
export function hasAdminGroup(event: unknown): boolean {
  const claims = (event as { requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } } })
    ?.requestContext?.authorizer?.jwt?.claims;
  const groups = claims?.["cognito:groups"];
  if (Array.isArray(groups)) return groups.includes(ADMIN_GROUP);
  if (typeof groups === "string") {
    try {
      const parsed = JSON.parse(groups);
      if (Array.isArray(parsed)) return parsed.includes(ADMIN_GROUP);
    } catch {}
    return groups.split(",").map((group) => group.trim()).includes(ADMIN_GROUP);
  }
  return false;
}
