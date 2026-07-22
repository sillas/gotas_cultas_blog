export const ACTIVE_SUBSCRIPTIONS_INDEX = "ActiveSubscriptionsIndex";
export const ACTIVE_SUBSCRIPTIONS_PK = "ACTIVE";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function subscriberKey(emailHash: string) {
  return { PK: `SUBSCRIBER#${emailHash}`, SK: "PROFILE" };
}

export function tokenKey(type: "CONFIRM" | "UNSUBSCRIBE", tokenHash: string) {
  return { PK: `TOKEN#${type}#${tokenHash}`, SK: "TOKEN" };
}

export function deliveryKey(postId: string, emailHash: string) {
  return { PK: `CAMPAIGN#${postId}`, SK: `RECIPIENT#${emailHash}` };
}
