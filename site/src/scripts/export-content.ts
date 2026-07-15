/**
 * Runs before `astro build`. Reads every published post straight from
 * DynamoDB (the source of truth — see PROJECT_SPEC.md section 13.1) and
 * materializes one JSON file per post under src/content/posts/, which the
 * Astro pages then read at build time via src/lib/content.ts.
 *
 * DynamoDB is never written here — only read — so this step is safe to
 * re-run for every deploy, including pure layout/bug-fix deploys that
 * don't touch content at all.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STATUS_DATE_INDEX_NAME,
  STATUS_DATE_INDEX_PARTITION_KEY,
} from "@blog/shared";

const TABLE_NAME = process.env.BLOG_TABLE_NAME;
const OUT_DIR = resolve(process.cwd(), "src/content/posts");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  if (!TABLE_NAME) {
    console.warn(
      "[export-content] BLOG_TABLE_NAME not set — skipping export, building with whatever is already in src/content/posts (empty on a fresh checkout, since posts are gitignored)."
    );
    return;
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  let exported = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await doc.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: STATUS_DATE_INDEX_NAME,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": STATUS_DATE_INDEX_PARTITION_KEY },
        ExpressionAttributeValues: { ":pk": "STATUS#published" },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const item of result.Items ?? []) {
      writeFileSync(resolve(OUT_DIR, `${item.slug}.json`), JSON.stringify(item, null, 2));
      exported += 1;
    }

    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  console.log(`[export-content] Exported ${exported} published post(s) from ${TABLE_NAME}.`);
}

main().catch((err) => {
  console.error("[export-content] Failed:", err);
  process.exit(1);
});
