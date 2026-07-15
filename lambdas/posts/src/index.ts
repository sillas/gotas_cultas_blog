import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Post, PostInput } from "@blog/shared";
import { parsePostInput, postKey, statusDateIndexKeys, ValidationError } from "@blog/shared";
import { deletePublishSchedule, upsertPublishSchedule } from "./scheduler.js";
import { triggerSiteRebuild } from "./github.js";

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function toItem(input: PostInput, existing?: Post): Record<string, unknown> {
  const now = new Date().toISOString();
  const dateForIndex = input.publishAt ?? existing?.createdAt ?? now;

  return {
    ...postKey(input.slug),
    ...input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    viewCount: existing?.viewCount ?? 0,
    ...statusDateIndexKeys(input.status, dateForIndex, input.slug),
  };
}

/** Keeps the EventBridge Scheduler and the GitHub Actions rebuild in sync with a status change. */
async function reconcileSideEffects(input: PostInput, previousStatus?: string) {
  if (previousStatus === "scheduled" && input.status !== "scheduled") {
    await deletePublishSchedule(input.slug);
  }
  if (input.status === "scheduled") {
    if (!input.publishAt) throw new Error("publishAt is required when status is 'scheduled'");
    await upsertPublishSchedule(input.slug, input.publishAt);
  }
  if (input.status === "published") {
    await triggerSiteRebuild(`post ${input.slug} published/updated`);
  }
}

async function listPosts(): Promise<APIGatewayProxyResultV2> {
  // Admin-only, low post volume for a single-author blog — a full Scan here
  // is simpler and cheap enough that a GSI isn't worth it (PROJECT_SPEC.md
  // reasoning in section 4 applies the same way here).
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return json(200, items);
}

async function getPost(slug: string): Promise<APIGatewayProxyResultV2> {
  const result = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  if (!result.Item) return json(404, { message: "Post not found" });
  return json(200, result.Item);
}

async function createPost(input: PostInput): Promise<APIGatewayProxyResultV2> {
  const item = toItem(input);
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
  await reconcileSideEffects(input);
  return json(201, item);
}

async function updatePost(slug: string, input: PostInput): Promise<APIGatewayProxyResultV2> {
  const existingResult = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  if (!existingResult.Item) return json(404, { message: "Post not found" });
  const existing = existingResult.Item as Post;

  const item = toItem({ ...input, slug }, existing);
  await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  await reconcileSideEffects({ ...input, slug }, existing.status);
  return json(200, item);
}

async function deletePost(slug: string): Promise<APIGatewayProxyResultV2> {
  const existingResult = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  const existing = existingResult.Item as Post | undefined;

  await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));

  if (existing?.status === "scheduled") await deletePublishSchedule(slug);
  if (existing?.status === "published") await triggerSiteRebuild(`post ${slug} deleted`);

  return { statusCode: 204 };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const slug = event.pathParameters?.slug;

  try {
    if (method === "GET" && !slug) return listPosts();
    if (method === "GET" && slug) return getPost(slug);
    if (method === "POST") return createPost(parsePostInput(JSON.parse(event.body ?? "{}")));
    if (method === "PUT" && slug) return updatePost(slug, parsePostInput(JSON.parse(event.body ?? "{}")));
    if (method === "DELETE" && slug) return deletePost(slug);
    return json(405, { message: "Method not allowed" });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof SyntaxError) {
      return json(400, { message: "Invalid request", issues: err instanceof ValidationError ? err.issues : ["body must be valid JSON"] });
    }
    console.error(err);
    return json(500, { message: "Internal error" });
  }
}
