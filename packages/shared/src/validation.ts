import type { PostInput, PostStatus } from "./types.js";

const STATUSES = new Set<PostStatus>(["draft", "scheduled", "published"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PostValidationOptions {
  /** Trusted absolute URL prefixes, for example https://blog.example/images. */
  allowedImageBaseUrls?: string[];
}

function isAllowedImageUrl(value: string, allowedBaseUrls: string[]): boolean {
  if (value.startsWith("/images/")) return true;
  return allowedBaseUrls.some((baseUrl) => {
    const normalizedBase = baseUrl.replace(/\/+$/, "");
    return value.startsWith(`${normalizedBase}/`);
  });
}

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "ValidationError";
  }
}

export function parsePostInput(value: unknown, options: PostValidationOptions = {}): PostInput {
  const input = value as Partial<PostInput> | null;
  const issues: string[] = [];
  if (!input || typeof input !== "object") throw new ValidationError(["body must be a JSON object"]);

  const text = (field: keyof PostInput, max: number) => {
    const current = input[field];
    if (typeof current !== "string" || !current.trim()) issues.push(`${field} is required`);
    else if (current.length > max) issues.push(`${field} must have at most ${max} characters`);
  };

  text("slug", 120);
  text("title", 200);
  text("description", 320);
  text("category", 80);
  text("contentMarkdown", 400_000);
  if (typeof input.slug === "string" && !SLUG_PATTERN.test(input.slug)) {
    issues.push("slug must contain only lowercase letters, numbers and single hyphens");
  }
  if (!STATUSES.has(input.status as PostStatus)) issues.push("status is invalid");
  if (!Array.isArray(input.tags) || input.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 50)) {
    issues.push("tags must be an array of non-empty strings with at most 50 characters");
  } else if (input.tags.length > 20) issues.push("tags must have at most 20 entries");
  if (input.coverImageKey !== null &&
      (typeof input.coverImageKey !== "string" || !isAllowedImageUrl(input.coverImageKey, options.allowedImageBaseUrls ?? []))) {
    issues.push("coverImageKey must be null or use the configured images origin");
  }

  const needsDate = input.status === "scheduled" || input.status === "published";
  if (needsDate && (typeof input.publishAt !== "string" || Number.isNaN(Date.parse(input.publishAt)))) {
    issues.push("publishAt must be a valid ISO date for scheduled or published posts");
  }
  if (!needsDate && input.publishAt !== null && input.publishAt !== undefined &&
      (typeof input.publishAt !== "string" || Number.isNaN(Date.parse(input.publishAt)))) {
    issues.push("publishAt must be null or a valid ISO date");
  }
  if (issues.length) throw new ValidationError(issues);

  return {
    slug: input.slug!.trim(), title: input.title!.trim(), description: input.description!.trim(),
    category: input.category!.trim(), tags: [...new Set(input.tags!.map((tag) => tag.trim()))],
    coverImageKey: input.coverImageKey ?? null, contentMarkdown: input.contentMarkdown!,
    status: input.status!, publishAt: input.publishAt ?? null,
  };
}
