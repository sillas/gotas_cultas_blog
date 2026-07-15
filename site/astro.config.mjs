import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// SITE_URL is set to the real domain at deploy time (GitHub Actions env).
// Falls back to a placeholder so local `astro build` works before the
// domain is registered in Route 53 (see PROJECT_SPEC.md, section 13.6).
const SITE_URL = process.env.SITE_URL ?? "https://example.com";

export default defineConfig({
  site: SITE_URL,
  output: "static",
  integrations: [sitemap()],
});
