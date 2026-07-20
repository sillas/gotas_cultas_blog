import { createHash } from "node:crypto";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { doc, ensureTable, TABLE_NAME } from "./dynamo.mjs";

const CONTENT_DIR = resolve("site/src/content/posts");
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "/tmp/blog-local-web";
let lastHash = "";
let building = false;

async function publishedPosts() {
  const result = await doc.send(new QueryCommand({ TableName: TABLE_NAME, IndexName: "StatusDateIndex", KeyConditionExpression: "GSI2PK = :status", ExpressionAttributeValues: { ":status": "STATUS#published" } }));
  return (result.Items ?? []).sort((a, b) => a.slug.localeCompare(b.slug));
}

function contentHash(posts) {
  return createHash("sha256").update(JSON.stringify(posts.map(({ viewCount: _ignored, ...post }) => post))).digest("hex");
}

async function build(posts) {
  await rm(CONTENT_DIR, { recursive: true, force: true });
  await mkdir(CONTENT_DIR, { recursive: true });
  for (const post of posts) await writeFile(resolve(CONTENT_DIR, `${post.slug}.json`), JSON.stringify(post, null, 2));
  execFileSync("npm", ["run", "build:site"], { stdio: "inherit", env: { ...process.env, SITE_URL: "http://localhost:8080", PUBLIC_API_BASE_URL: "/api" } });
  execFileSync("npm", ["run", "build:admin"], { stdio: "inherit", env: { ...process.env, VITE_AUTH_MODE: "local", VITE_API_BASE_URL: "/api" } });
  for (const entry of await readdir(OUTPUT_DIR).catch(() => [])) {
    await rm(resolve(OUTPUT_DIR, entry), { recursive: true, force: true });
  }
  await mkdir(resolve(OUTPUT_DIR, "admin"), { recursive: true });
  await cp("site/dist", OUTPUT_DIR, { recursive: true });
  await cp("admin/dist", resolve(OUTPUT_DIR, "admin"), { recursive: true });
  await writeFile(resolve(OUTPUT_DIR, ".publisher-ready"), new Date().toISOString());
  console.log(`[local-publisher] Published ${posts.length} post(s)`);
}

async function tick() {
  if (building) return;
  const posts = await publishedPosts();
  const hash = contentHash(posts);
  const outputEmpty = !(await readdir(OUTPUT_DIR).catch(() => [])).length;
  if (hash !== lastHash || outputEmpty) {
    building = true;
    try { await build(posts); lastHash = hash; }
    finally { building = false; }
  }
}

async function start() {
  await rm(resolve(OUTPUT_DIR, ".publisher-ready"), { force: true });
  for (let attempt = 1; ; attempt++) {
    try { await ensureTable(); break; }
    catch (error) { if (attempt === 30) throw error; await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  await tick();
  setInterval(() => tick().catch(console.error), 3000);
}

start().catch((error) => { console.error(error); process.exit(1); });
