#!/usr/bin/env node
import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { CopyObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const value = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const tableName = value("table");
const bucketName = value("bucket");
const region = value("region") ?? process.env.AWS_REGION;
const rollback = process.argv.includes("--rollback");
if (!tableName || !bucketName || !region) {
  throw new Error("Usage: npm run migrate:covers -- --table TABLE --bucket BUCKET --region REGION [--rollback]");
}

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const s3 = new S3Client({ region });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const postKey = (slug) => ({ PK: `POST#${slug}`, SK: "METADATA" });
const imageKey = (id) => ({ PK: `IMAGE#${id}`, SK: "METADATA" });
const imageId = (slug) => {
  const hex = createHash("sha256").update(`legacy-cover:${slug}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
};

function sourceKey(url) {
  const pathname = new URL(url, "https://migration.invalid").pathname;
  const relative = pathname.replace(/^\/images\//, "");
  return relative.startsWith("covers/") ? relative : `covers/${relative}`;
}

async function posts() {
  const result = [];
  let ExclusiveStartKey;
  do {
    const page = await doc.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    result.push(...(page.Items ?? []).filter((item) => item.PK?.startsWith("POST#")));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return result;
}

async function migrate(post) {
  if (!post.coverImageKey || post.coverImage?.status === "ready") return;
  const id = imageId(post.slug);
  const key = imageKey(id);
  let state = (await doc.send(new GetCommand({ TableName: tableName, Key: key }))).Item;
  if (!state) {
    const legacyKey = sourceKey(post.coverImageKey);
    const source = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: legacyKey }));
    if (!source.ContentType) throw new Error(`${post.slug}: legacy object has no Content-Type`);
    const extension = legacyKey.split(".").at(-1)?.toLowerCase() ?? "bin";
    const inputKey = `incoming/${id}/original.${extension}`;
    await doc.send(new PutCommand({
      TableName: tableName,
      Item: { ...key, id, status: "processing", width: null, height: null, aspectRatio: null, variants: [], inputKey, declaredContentType: source.ContentType, createdAt: new Date().toISOString(), expiresAt: Math.floor(Date.now() / 1_000) + 86_400 },
      ConditionExpression: "attribute_not_exists(PK)",
    }));
    await s3.send(new CopyObjectCommand({ Bucket: bucketName, Key: inputKey, CopySource: encodeURIComponent(`${bucketName}/${legacyKey}`).replaceAll("%2F", "/"), ContentType: source.ContentType, MetadataDirective: "REPLACE" }));
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    state = (await doc.send(new GetCommand({ TableName: tableName, Key: key }))).Item;
    if (state?.status === "failed") throw new Error(`${post.slug}: image processing failed`);
    if (state?.status === "ready") break;
    await sleep(1_000);
  }
  if (state?.status !== "ready") throw new Error(`${post.slug}: image processing timed out`);
  const { PK, SK, inputKey, declaredContentType, createdAt, expiresAt, ...coverImage } = state;
  await doc.send(new UpdateCommand({
    TableName: tableName,
    Key: postKey(post.slug),
    UpdateExpression: "SET coverImage = :cover, legacyCoverImageKey = :legacy, coverImageKey = :fallback",
    ConditionExpression: "updatedAt = :expectedUpdatedAt",
    ExpressionAttributeValues: { ":cover": coverImage, ":legacy": post.coverImageKey, ":fallback": coverImage.fallbackUrl, ":expectedUpdatedAt": post.updatedAt },
  }));
  console.log(`Migrated ${post.slug}`);
}

async function restore(post) {
  if (!post.legacyCoverImageKey) return;
  await doc.send(new UpdateCommand({
    TableName: tableName,
    Key: postKey(post.slug),
    UpdateExpression: "SET coverImageKey = :legacy REMOVE coverImage",
    ExpressionAttributeValues: { ":legacy": post.legacyCoverImageKey },
  }));
  console.log(`Restored ${post.slug}`);
}

for (const post of await posts()) {
  if (rollback) await restore(post);
  else await migrate(post);
}
