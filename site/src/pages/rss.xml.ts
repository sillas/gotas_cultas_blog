import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getAllPosts } from "../lib/content";

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

export async function GET(context: APIContext) {
  const posts = getAllPosts();
  return rss({
    title: "Gotas Cultas",
    description: "Pequenas reflexões sobre as grandes questões.",
    site: context.site ?? "https://example.com",
    xmlns: { dc: "http://purl.org/dc/elements/1.1/" },
    items: posts.map((post) => ({
      title: post.title,
      description: post.description,
      pubDate: post.publishAt ? new Date(post.publishAt) : new Date(post.createdAt),
      link: `/post/${post.slug}/`,
      customData: `<dc:creator>${escapeXml(post.author.name)}</dc:creator>`,
    })),
  });
}
