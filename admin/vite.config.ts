import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served by CloudFront under the /admin/* behavior (PROJECT_SPEC.md section 8).
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
