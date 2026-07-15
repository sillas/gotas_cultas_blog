import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getAllPosts } from "../lib/content";

export async function GET(context: APIContext) {
  const posts = getAllPosts();
  return rss({
    title: "Meu Blog",
    description: "Últimos posts do blog.",
    site: context.site ?? "https://example.com",
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.publishAt ? new Date(post.publishAt) : new Date(post.createdAt),
      link: `/post/${post.slug}`,
    })),
  });
}
