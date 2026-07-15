export interface SeoProps {
  title: string;
  description: string;
  canonicalPath: string;
  image?: string;
  type?: "website" | "article";
  publishedAt?: string;
}

/** Builds the canonical absolute URL from Astro.site + a path (see PROJECT_SPEC.md section 11.2). */
export function canonicalUrl(siteUrl: URL | string, path: string): string {
  return new URL(path, siteUrl).toString();
}
