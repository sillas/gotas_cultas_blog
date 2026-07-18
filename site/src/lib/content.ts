import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Post, PostAuthor } from "@blog/shared";

const CONTENT_DIR = resolve(process.cwd(), "src/content/posts");

let cache: Post[] | null = null;
const LEGACY_AUTHOR: PostAuthor = { id: null, name: "Autor do Blog" };

function normalizePost(value: Post | (Omit<Post, "author"> & { author?: PostAuthor })): Post {
  const author = value.author;
  return {
    ...value,
    author: author && typeof author.name === "string" && author.name.trim()
      ? { id: typeof author.id === "string" ? author.id : null, name: author.name }
      : LEGACY_AUTHOR,
  };
}

/** All published posts, newest first. Reads the JSON materialized by export-content.ts. */
export function getAllPosts(): Post[] {
  if (cache) return cache;
  if (!existsSync(CONTENT_DIR)) {
    cache = [];
    return cache;
  }

  cache = readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => normalizePost(JSON.parse(readFileSync(resolve(CONTENT_DIR, file), "utf-8"))))
    .filter((post) => post.status === "published")
    .sort((a, b) => (b.publishAt ?? "").localeCompare(a.publishAt ?? ""));

  return cache;
}

export function getPostBySlug(slug: string): Post | undefined {
  return getAllPosts().find((post) => post.slug === slug);
}

export function getPostsByCategory(category: string): Post[] {
  return getAllPosts().filter((post) => post.category === category);
}

export function getCategories(): string[] {
  return Array.from(new Set(getAllPosts().map((post) => post.category))).sort();
}

export const POSTS_PER_PAGE = 10;
