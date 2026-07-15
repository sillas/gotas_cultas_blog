import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { parsePostInput, postKey, statusDateIndexKeys, ValidationError } from "../../packages/shared/dist/index.js";
import { doc, ensureTable, TABLE_NAME } from "./dynamo.mjs";

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN = process.env.LOCAL_ADMIN_TOKEN ?? "local-dev-token";
const IMAGES_DIR = process.env.IMAGES_DIR ?? "/tmp/blog-local-images";
const ALLOWED_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"], ["image/gif", "gif"], ["image/avif", "avif"]]);

function send(res, status, body, headers = {}) {
  const value = body === undefined ? undefined : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { ...(value && !Buffer.isBuffer(value) ? { "Content-Type": "application/json; charset=utf-8" } : {}), ...headers });
  res.end(value);
}

async function body(req, limit = 512_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function jsonBody(req) {
  const raw = await body(req);
  return JSON.parse(raw.toString("utf8") || "{}");
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

async function allPosts() {
  const posts = [];
  let ExclusiveStartKey;
  do {
    const result = await doc.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    posts.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return posts;
}

function itemFrom(input, existing) {
  const now = new Date().toISOString();
  const date = input.publishAt ?? existing?.createdAt ?? now;
  return { ...postKey(input.slug), ...input, createdAt: existing?.createdAt ?? now, updatedAt: now, viewCount: existing?.viewCount ?? 0, ...statusDateIndexKeys(input.status, date, input.slug) };
}

async function seed() {
  if (process.env.SEED_LOCAL_DATA !== "true" || (await allPosts()).length) return;
  const now = new Date().toISOString();
  const samples = [
    { slug: "bem-vindo", title: "Bem-vindo ao blog local", description: "Post publicado para validar a stack local.", category: "Geral", tags: ["local"], coverImageKey: null, contentMarkdown: "# Ambiente local\n\nEste post foi criado automaticamente e pode ser editado no painel.", status: "published", publishAt: now },
    { slug: "rascunho-local", title: "Rascunho local", description: "Exemplo de rascunho.", category: "Geral", tags: ["rascunho"], coverImageKey: null, contentMarkdown: "Este conteúdo ainda não está publicado.", status: "draft", publishAt: null },
  ];
  for (const sample of samples) await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: itemFrom(parsePostInput(sample)) }));
}

async function publishScheduled() {
  const now = new Date();
  for (const post of await allPosts()) {
    if (post.status === "scheduled" && post.publishAt && new Date(post.publishAt) <= now) {
      const input = { ...post, status: "published" };
      await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: itemFrom(input, post) }));
      console.log(`[local-scheduler] Published ${post.slug}`);
    }
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/api/health") return send(res, 200, { status: "ok" });

  if (parts[0] === "images" && req.method === "GET") {
    const name = basename(parts.slice(1).join("/"));
    try { return send(res, 200, await readFile(join(IMAGES_DIR, name)), { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" }); }
    catch { return send(res, 404, { message: "Image not found" }); }
  }

  if (parts[0] !== "api") return send(res, 404, { message: "Not found" });
  if (parts[1] === "views" && parts[2] && req.method === "POST") {
    try {
      await doc.send(new UpdateCommand({ TableName: TABLE_NAME, Key: postKey(decodeURIComponent(parts[2])), UpdateExpression: "ADD viewCount :one", ConditionExpression: "attribute_exists(PK)", ExpressionAttributeValues: { ":one": 1 } }));
      return send(res, 204);
    } catch { return send(res, 404, { message: "Post not found" }); }
  }
  // Equivalent to a presigned S3 URL: the unguessable UUID is the capability,
  // so the browser upload itself does not carry the admin Authorization header.
  if (parts[1] === "uploads" && parts[2] === "files" && parts[3] && req.method === "PUT") {
    const name = basename(parts[3]);
    await mkdir(IMAGES_DIR, { recursive: true });
    await writeFile(join(IMAGES_DIR, name), await body(req, 8 * 1024 * 1024));
    return send(res, 204);
  }
  if (!authorized(req)) return send(res, 401, { message: "Use the local admin login" });

  if (parts[1] === "posts" && !parts[2] && req.method === "GET") return send(res, 200, await allPosts());
  if (parts[1] === "posts" && parts[2] && req.method === "GET") {
    const result = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(decodeURIComponent(parts[2])) }));
    return result.Item ? send(res, 200, result.Item) : send(res, 404, { message: "Post not found" });
  }
  if (parts[1] === "posts" && req.method === "POST") {
    const input = parsePostInput(await jsonBody(req));
    const item = itemFrom(input);
    await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: item, ConditionExpression: "attribute_not_exists(PK)" }));
    return send(res, 201, item);
  }
  if (parts[1] === "posts" && parts[2] && req.method === "PUT") {
    const slug = decodeURIComponent(parts[2]);
    const found = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
    if (!found.Item) return send(res, 404, { message: "Post not found" });
    const input = parsePostInput({ ...await jsonBody(req), slug });
    const item = itemFrom(input, found.Item);
    await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    return send(res, 200, item);
  }
  if (parts[1] === "posts" && parts[2] && req.method === "DELETE") {
    await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: postKey(decodeURIComponent(parts[2])) }));
    return send(res, 204);
  }
  if (parts[1] === "metrics" && req.method === "GET") {
    const posts = await allPosts();
    return send(res, 200, { totalViews: posts.reduce((sum, post) => sum + (post.viewCount ?? 0), 0), totalPosts: posts.length, postsByViews: posts.slice().sort((a, b) => b.viewCount - a.viewCount).slice(0, 10).map(({ slug, title, viewCount }) => ({ slug, title, viewCount })) });
  }
  if (parts[1] === "uploads" && parts[2] === "presign" && req.method === "POST") {
    const { fileName, contentType } = await jsonBody(req);
    const ext = ALLOWED_TYPES.get(contentType);
    if (!fileName || !ext) return send(res, 400, { message: "Invalid image" });
    const name = `${randomUUID()}.${ext}`;
    return send(res, 200, { uploadUrl: `/api/uploads/files/${name}`, objectKey: `covers/${name}`, publicUrl: `/images/${name}` });
  }
  return send(res, 404, { message: "Not found" });
}

async function start() {
  for (let attempt = 1; ; attempt++) {
    try { await ensureTable(); break; }
    catch (error) { if (attempt === 30) throw error; await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  await mkdir(IMAGES_DIR, { recursive: true });
  await seed();
  setInterval(() => publishScheduled().catch(console.error), 5000);
  createServer((req, res) => route(req, res).catch((error) => {
    console.error(error);
    if (error instanceof ValidationError || error instanceof SyntaxError) return send(res, 400, { message: error.message, issues: error.issues });
    return send(res, error.status ?? 500, { message: error.message ?? "Internal error" });
  })).listen(PORT, "0.0.0.0", () => console.log(`[local-api] Listening on ${PORT}`));
}

start().catch((error) => { console.error(error); process.exit(1); });
