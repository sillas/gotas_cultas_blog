import { createHash } from "node:crypto";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { doc, ensureTable, TABLE_NAME } from "./dynamo.mjs";

const contentDir = resolve("site/src/content/posts");
const contentModule = resolve("site/src/lib/content.ts");
let lastHash = "";
let initialized = false;

async function publishedPosts() {
  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "StatusDateIndex",
    KeyConditionExpression: "GSI2PK = :status",
    ExpressionAttributeValues: { ":status": "STATUS#published" },
  }));
  return (result.Items ?? []).sort((a, b) => a.slug.localeCompare(b.slug));
}

function contentHash(posts) {
  return createHash("sha256")
    .update(JSON.stringify(posts.map(({ viewCount: _ignored, ...post }) => post)))
    .digest("hex");
}

async function sync() {
  const posts = await publishedPosts();
  const hash = contentHash(posts);
  if (initialized && hash === lastHash) return;

  await rm(contentDir, { recursive: true, force: true });
  await mkdir(contentDir, { recursive: true });
  await writeFile(resolve(contentDir, ".gitkeep"), "");
  for (const post of posts) {
    await writeFile(resolve(contentDir, `${post.slug}.json`), JSON.stringify(post, null, 2));
  }
  await writeFile(resolve(contentDir, ".dev-ready"), new Date().toISOString());
  // Astro caches getStaticPaths() results in development. The JSON files are
  // read through node:fs, so Vite cannot associate their changes with the
  // dynamic post/category routes. Touch their imported module to invalidate
  // the route cache whenever the synchronized content snapshot changes.
  const now = new Date();
  await utimes(contentModule, now, now);
  lastHash = hash;
  initialized = true;
  console.log(`[local-content-sync] Synchronized ${posts.length} published post(s)`);
}

async function start() {
  await rm(resolve(contentDir, ".dev-ready"), { force: true });
  for (let attempt = 1; ; attempt += 1) {
    try {
      await ensureTable();
      break;
    } catch (error) {
      if (attempt === 30) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    }
  }

  await sync();
  setInterval(() => sync().catch(console.error), 3000);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
