import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Post } from "@blog/shared";

const CONTENT_DIR = resolve(process.cwd(), "src/content/posts");

let cache: Post[] | null = null;

/** All published posts, newest first. Reads the JSON materialized by export-content.ts. */
export function getAllPosts(): Post[] {
  // Production builds use an immutable content snapshot. In development the
  // local synchronizer replaces these files while Astro keeps running.
  if (!import.meta.env.DEV && cache) return cache;
  if (!existsSync(CONTENT_DIR)) {
    cache = [];
    return cache;
  }

  cache = readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(resolve(CONTENT_DIR, file), "utf-8")) as Post)
    .filter((post) => post.status === "published")
    .sort((a, b) => (b.publishAt ?? "").localeCompare(a.publishAt ?? ""));

  return cache;
}

export function getPostBySlug(slug: string): Post | undefined {
  return getAllPosts().find((post) => post.slug === slug);
}

export function getPostsByCategory(category: string): Post[] {
  const slug = getCategorySlug(category);
  return getAllPosts().filter((post) => getCategorySlug(post.category) === slug);
}

export function getCategories(): string[] {
  return Array.from(new Set(getAllPosts().map((post) => getCategoryLabel(post.category)))).sort();
}

/** Stable, URL-safe category identifier used by links, routes and filtering. */
export function getCategorySlug(category: string): string {
  return category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CATEGORY_LABELS: Record<string, string> = {
  teologia: "Teologia",
  filosofia: "Filosofia",
  ciencia: "Ciência",
};

/** Canonical display label for the blog's primary categories. */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[getCategorySlug(category)] ?? category.trim();
}

export const POSTS_PER_PAGE = 10;
