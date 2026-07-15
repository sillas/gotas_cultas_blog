import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { MetricsSummary, Post } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const TOP_N = 10;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Admin-only, called from a single dashboard page — a full Scan is the
// simplest correct option at this post volume (PROJECT_SPEC.md section 4).
export async function handler(): Promise<APIGatewayProxyResultV2> {
  const posts: Post[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(new ScanCommand({ TableName: TABLE_NAME, ExclusiveStartKey }));
    posts.push(...((result.Items ?? []) as Post[]));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const summary: MetricsSummary = {
    totalViews: posts.reduce((sum, post) => sum + (post.viewCount ?? 0), 0),
    totalPosts: posts.length,
    postsByViews: posts
      .slice()
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, TOP_N)
      .map((post) => ({ slug: post.slug, title: post.title, viewCount: post.viewCount })),
  };

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(summary) };
}
