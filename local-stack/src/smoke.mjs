import { readFile } from "node:fs/promises";

const base = process.env.LOCAL_BASE_URL ?? "http://localhost:8080";
const checks = [
  ["/", 200],
  ["/blog/", 200],
  ["/privacidade/", 200],
  ["/sobre/", 200],
  ["/busca/", 200],
  ["/post/bem-vindo/", 200],
  ["/admin/login", 200],
  ["/api/health", 200],
];

for (const [path, expected] of checks) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  console.log(`OK ${response.status} ${path}`);
}

const homeHtml = await (await fetch(`${base}/`)).text();
for (const path of ["/blog/", "/privacidade/", "/sobre/", "/busca/", "/post/bem-vindo/"]) {
  if (!homeHtml.includes(`href="${path}"`)) {
    throw new Error(`Homepage does not contain the canonical local link ${path}`);
  }
}
console.log("OK canonical internal links");

const posts = await fetch(`${base}/api/posts`, { headers: { Authorization: "Bearer local-dev-token" } });
if (!posts.ok || !(await posts.json()).some((post) => post.slug === "bem-vindo")) {
  throw new Error("Seeded post was not available through the local API");
}
console.log("OK local API authentication and seed data");

const authHeaders = { Authorization: "Bearer local-dev-token", "Content-Type": "application/json" };
const presign = await fetch(`${base}/api/uploads/presign`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ fileName: "logo-social.png", contentType: "image/png" }),
});
if (!presign.ok) throw new Error(`Presign failed with ${presign.status}`);
const upload = await presign.json();
const form = new FormData();
for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
form.append("file", new Blob([await readFile(new URL("../../site/public/logo-social.png", import.meta.url))], { type: "image/png" }), "logo-social.png");
const uploaded = await fetch(new URL(upload.uploadUrl, base), { method: "POST", body: form });
if (!uploaded.ok) throw new Error(`Upload failed with ${uploaded.status}`);
const state = await fetch(`${base}/api/uploads/${upload.image.id}`, { headers: { Authorization: "Bearer local-dev-token" } });
const image = await state.json();
if (!state.ok || image.status !== "ready" || !image.fallbackUrl) throw new Error("Local image processing state did not become ready");
console.log("OK local presigned POST and image state");
