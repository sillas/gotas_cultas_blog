#!/usr/bin/env node
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { adminPostIndexKeys, postKey } from "../packages/shared/dist/index.js";

const tableName = process.env.BLOG_TABLE_NAME;
if (!tableName) throw new Error("BLOG_TABLE_NAME is required");

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
let cursor;
let updated = 0;

do {
  const result = await doc.send(new ScanCommand({
    TableName: tableName,
    ExclusiveStartKey: cursor,
    FilterExpression: "begins_with(#pk, :postPrefix)",
    ExpressionAttributeNames: { "#pk": "PK" },
    ExpressionAttributeValues: { ":postPrefix": "POST#" },
  }));

  for (const post of result.Items ?? []) {
    const keys = adminPostIndexKeys(post.status, post.publishAt ?? null, post.updatedAt ?? post.createdAt, post.slug);
    if (post.GSI1PK === keys.GSI1PK && post.GSI1SK === keys.GSI1SK) continue;
    await doc.send(new UpdateCommand({
      TableName: tableName,
      Key: postKey(post.slug),
      UpdateExpression: "SET GSI1PK = :pk, GSI1SK = :sk",
      ExpressionAttributeValues: { ":pk": keys.GSI1PK, ":sk": keys.GSI1SK },
    }));
    updated += 1;
  }
  cursor = result.LastEvaluatedKey;
} while (cursor);

console.log(`[backfill-admin-index] Updated ${updated} post(s) in ${tableName}.`);
