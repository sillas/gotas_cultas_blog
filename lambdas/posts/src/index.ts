import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AdminPostListStatus, CoverImage, Post, PostAuthor, PostInput } from "@blog/shared";
import { ADMIN_POSTS_INDEX_NAME, adminPostIndexKeys, hasAdminGroup, imageKey, parsePostInput, postKey, statusDateIndexKeys, ValidationError } from "@blog/shared";
import { deletePublishSchedule, upsertPublishSchedule } from "./scheduler.js";
import { triggerSiteRebuild } from "./github.js";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const TABLE_NAME = process.env.TABLE_NAME!;
const BLOG_AUTHOR_NAME = process.env.BLOG_AUTHOR_NAME ?? "Autor do Blog";
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});

function parseInput(body: string | undefined): PostInput {
  return parsePostInput(JSON.parse(body ?? "{}"));
}

function parseUpdateInput(body: string | undefined): { input: PostInput; expectedUpdatedAt: string } {
  const value = JSON.parse(body ?? "{}") as { expectedUpdatedAt?: unknown };
  if (typeof value.expectedUpdatedAt !== "string" || !value.expectedUpdatedAt) {
    throw new ValidationError(["expectedUpdatedAt is required"]);
  }
  return { input: parsePostInput(value), expectedUpdatedAt: value.expectedUpdatedAt };
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function authenticatedAuthor(event: APIGatewayProxyEventV2WithJWTAuthorizer): PostAuthor {
  const sub = event.requestContext.authorizer?.jwt?.claims.sub;
  if (typeof sub !== "string" || !sub) throw new Error("Authenticated token is missing sub");
  return { id: sub, name: BLOG_AUTHOR_NAME };
}

function toItem(input: PostInput, author: PostAuthor, existing?: Post): Record<string, unknown> {
  const now = new Date().toISOString();
  const dateForIndex = input.publishAt ?? existing?.createdAt ?? now;

  return {
    ...postKey(input.slug),
    ...input,
    author: existing?.author ?? author,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    viewCount: existing?.viewCount ?? 0,
    sideEffects: { status: "pending", updatedAt: now },
    sideEffectsPreviousStatus: existing?.status ?? null,
    ...statusDateIndexKeys(input.status, dateForIndex, input.slug),
    ...adminPostIndexKeys(input.status, input.publishAt, now, input.slug),
  };
}

async function withTrustedCover(input: PostInput): Promise<PostInput> {
  if (!input.coverImage) return { ...input, coverImage: null };
  const result = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: imageKey(input.coverImage.id) }));
  if (!result.Item) throw new ValidationError(["coverImage was not found"]);
  const { id, status, width, height, aspectRatio, variants, fallbackUrl, error } = result.Item as CoverImage;
  const coverImage: CoverImage = { id, status, width, height, aspectRatio, variants, ...(fallbackUrl ? { fallbackUrl } : {}), ...(error ? { error } : {}) };
  if ((input.status === "scheduled" || input.status === "published") && coverImage.status !== "ready") {
    throw new ValidationError(["coverImage must be ready before publication"]);
  }
  return { ...input, coverImage };
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
    if (previousStatus !== "published" && process.env.NEWSLETTER_CAMPAIGN_QUEUE_URL) {
      await sqs.send(new SendMessageCommand({ QueueUrl: process.env.NEWSLETTER_CAMPAIGN_QUEUE_URL, MessageBody: JSON.stringify({ postId: input.slug, slug: input.slug, title: input.title, excerpt: input.description }) }));
    }
  }
}

async function finalizeSideEffects(input: PostInput, previousStatus?: string): Promise<Post["sideEffects"]> {
  const updatedAt = new Date().toISOString();
  try {
    await reconcileSideEffects(input, previousStatus);
    const state = { status: "ready" as const, updatedAt };
    await doc.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: postKey(input.slug),
      UpdateExpression: "SET sideEffects = :state REMOVE sideEffectsPreviousStatus",
      ExpressionAttributeValues: { ":state": state },
    }));
    return state;
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(JSON.stringify({ event: "post_side_effect_failed", slug: input.slug, status: input.status, previousStatus, error: message }));
    const state = { status: "failed" as const, updatedAt, error: message.slice(0, 500) };
    await doc.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: postKey(input.slug),
      UpdateExpression: "SET sideEffects = :state",
      ExpressionAttributeValues: { ":state": state },
    }));
    return state;
  }
}

async function listPosts(status: AdminPostListStatus | undefined, yearValue: string | undefined): Promise<APIGatewayProxyResultV2> {
  if (!status || !["draft", "scheduled", "published"].includes(status)) {
    return json(400, { message: "status must be draft, scheduled or published" });
  }
  const year = status === "published" ? Number(yearValue) : undefined;
  if (status === "published" && (!Number.isInteger(year) || year! < 2000 || year! > 9999)) {
    return json(400, { message: "year is required for published posts" });
  }
  const partition = status === "published" ? `ADMIN#PUBLISHED#${year}` : `ADMIN#${status.toUpperCase()}`;
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: ADMIN_POSTS_INDEX_NAME,
      ExclusiveStartKey,
      KeyConditionExpression: "GSI1PK = :partition",
      ExpressionAttributeValues: { ":partition": partition },
      ScanIndexForward: status === "scheduled",
    }));
    items.push(...(result.Items ?? []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const summaries = items.map(({ slug, title, status: itemStatus, category, publishAt, updatedAt }) => ({
    slug, title, status: itemStatus, category, publishAt, updatedAt,
  }));
  return json(200, { items: summaries, count: summaries.length, ...(year ? { year } : {}) });
}

async function getPost(slug: string): Promise<APIGatewayProxyResultV2> {
  const result = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  if (!result.Item) return json(404, { message: "Post not found" });
  return json(200, result.Item);
}

async function createPost(rawInput: PostInput, author: PostAuthor): Promise<APIGatewayProxyResultV2> {
  const input = await withTrustedCover(rawInput);
  const item = toItem(input, author);
  await doc.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
  const sideEffects = await finalizeSideEffects(input);
  return json(201, { ...item, sideEffects });
}

async function updatePost(slug: string, rawInput: PostInput, author: PostAuthor, expectedUpdatedAt: string): Promise<APIGatewayProxyResultV2> {
  const existingResult = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  if (!existingResult.Item) return json(404, { message: "Post not found" });
  const existing = existingResult.Item as Post;
  const input = await withTrustedCover(rawInput);

  const item = toItem({ ...input, slug }, author, existing);
  await doc.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: item,
    ConditionExpression: "#updatedAt = :expectedUpdatedAt",
    ExpressionAttributeNames: { "#updatedAt": "updatedAt" },
    ExpressionAttributeValues: { ":expectedUpdatedAt": expectedUpdatedAt },
  }));
  const sideEffects = await finalizeSideEffects({ ...input, slug }, existing.status);
  return json(200, { ...item, sideEffects });
}

async function retrySideEffects(slug: string): Promise<APIGatewayProxyResultV2> {
  const result = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  if (!result.Item) return json(404, { message: "Post not found" });
  const post = result.Item as Post & { sideEffectsPreviousStatus?: string };
  const sideEffects = await finalizeSideEffects(post, post.sideEffectsPreviousStatus);
  return json(200, { ...post, sideEffects });
}

async function deletePost(slug: string): Promise<APIGatewayProxyResultV2> {
  const existingResult = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: postKey(slug) }));
  const existing = existingResult.Item as Post | undefined;
  if (!existing) return json(404, { message: "Post not found" });

  await doc.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: postKey(slug),
    ConditionExpression: "attribute_exists(PK)",
  }));

  if (existing?.status === "scheduled") await deletePublishSchedule(slug);
  if (existing?.status === "published") await triggerSiteRebuild(`post ${slug} deleted`);

  return { statusCode: 204 };
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  if (!hasAdminGroup(event)) return json(403, { message: "Administrator group required" });
  const method = event.requestContext.http.method;
  const slug = event.pathParameters?.slug;

  try {
    if (method === "GET" && !slug) {
      const status = event.queryStringParameters?.status as AdminPostListStatus | undefined;
      return listPosts(status, event.queryStringParameters?.year);
    }
    if (method === "GET" && slug) return getPost(slug);
    if (method === "POST" && !slug) return createPost(parseInput(event.body), authenticatedAuthor(event));
    if (method === "POST" && slug) return retrySideEffects(slug);
    if (method === "PUT" && slug) {
      const { input, expectedUpdatedAt } = parseUpdateInput(event.body);
      return updatePost(slug, input, authenticatedAuthor(event), expectedUpdatedAt);
    }
    if (method === "DELETE" && slug) return deletePost(slug);
    return json(405, { message: "Method not allowed" });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof SyntaxError) {
      return json(400, { message: "Invalid request", issues: err instanceof ValidationError ? err.issues : ["body must be valid JSON"] });
    }
    if (err instanceof ConditionalCheckFailedException) {
      return json(409, { message: "Post changed since it was opened; reload before saving" });
    }
    console.error(err);
    return json(500, { message: "Internal error" });
  }
}
