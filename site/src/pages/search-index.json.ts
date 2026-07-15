import type { APIRoute } from "astro";
import { getAllPosts } from "../lib/content";

// Static JSON index consumed by /busca — client-side title search,
// no backend call needed (PROJECT_SPEC.md section 1).
export const GET: APIRoute = () => {
  const index = getAllPosts().map((post) => ({
    slug: post.slug,
    title: post.title,
    category: post.category,
    publishAt: post.publishAt,
  }));

  return new Response(JSON.stringify(index), {
    headers: { "Content-Type": "application/json" },
  });
};
