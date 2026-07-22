import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { MetricsSummary, MetricsPeriod, Post } from "@blog/shared";
import { hasAdminGroup, metricDayPartitionKey } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const TOP_N = 10;
const PERIOD_TOP_N = 5;
const PERIOD_LENGTHS_DAYS = [7, 30, 90] as const;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface MetricDayItem {
  SK: string;
  qualifiedViews: number;
}

// Admin-only, called from a single dashboard page — a full Scan is the
// simplest correct option at this post volume (PROJECT_SPEC.md section 4).
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (!hasAdminGroup(event)) return { statusCode: 403, body: JSON.stringify({ message: "Administrator group required" }) };

  const posts = await scanPublishedPosts();

  const summary: MetricsSummary = {
    totalViews: posts.reduce((sum, post) => sum + (post.viewCount ?? 0), 0),
    totalPosts: posts.length,
    postsByViews: posts
      .slice()
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, TOP_N)
      .map((post) => ({ slug: post.slug, title: post.title, viewCount: post.viewCount })),
    periods: await buildPeriods(posts),
  };

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(summary) };
}

// Draft/scheduled posts are never served publicly, so their (necessarily
// zero) views would only distort totalPosts/totalViews/postsByViews —
// ADSENSE_READINESS_AND_RECOMMENDATIONS.md #6 flags this specifically for
// totalPosts, and the same reasoning extends to the other two fields here.
async function scanPublishedPosts(): Promise<Post[]> {
  const posts: Post[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await doc.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey,
      FilterExpression: "begins_with(#pk, :postPrefix) AND #status = :published",
      ExpressionAttributeNames: { "#pk": "PK", "#status": "status" },
      ExpressionAttributeValues: { ":postPrefix": "POST#", ":published": "published" },
    }));
    posts.push(...((result.Items ?? []) as Post[]));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return posts;
}

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function queryMetricDay(date: string): Promise<MetricDayItem[]> {
  const result = await doc.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "PK" },
    ExpressionAttributeValues: { ":pk": metricDayPartitionKey(date) },
  }));
  return (result.Items ?? []) as MetricDayItem[];
}

function sumWindow(dates: string[], byDate: Map<string, MetricDayItem[]>) {
  let total = 0;
  const bySlug = new Map<string, number>();
  for (const date of dates) {
    for (const item of byDate.get(date) ?? []) {
      if (item.SK === "TOTAL") total += item.qualifiedViews;
      else if (item.SK.startsWith("POST#")) {
        const slug = item.SK.slice("POST#".length);
        bySlug.set(slug, (bySlug.get(slug) ?? 0) + item.qualifiedViews);
      }
    }
  }
  return { total, bySlug };
}

// Daily aggregates (ADSENSE_READINESS_AND_RECOMMENDATIONS.md #5) live one
// DynamoDB partition per UTC day, so covering the largest period (90 days)
// plus its comparison window means querying up to 180 distinct partitions.
// Each query is small (one row per post that got a qualified view that
// day) and this endpoint is admin-only and low-frequency, so a flat
// Promise.all over 180 requests stays simple and fast enough without
// needing a batching/backfill strategy.
async function buildPeriods(posts: Post[]): Promise<MetricsPeriod[]> {
  const titleBySlug = new Map(posts.map((post) => [post.slug, post.title]));
  const maxDays = Math.max(...PERIOD_LENGTHS_DAYS);
  const dates = Array.from({ length: maxDays * 2 }, (_, i) => isoDateDaysAgo(i));
  const dayItems = await Promise.all(dates.map(queryMetricDay));
  const byDate = new Map(dates.map((date, i) => [date, dayItems[i]]));

  return PERIOD_LENGTHS_DAYS.map((days) => {
    const currentDates = dates.slice(0, days);
    const previousDates = dates.slice(days, days * 2);
    const current = sumWindow(currentDates, byDate);
    const previous = sumWindow(previousDates, byDate);
    const changeRatio = previous.total === 0 ? null : (current.total - previous.total) / previous.total;

    const topPosts = [...current.bySlug.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, PERIOD_TOP_N)
      .map(([slug, qualifiedViews]) => ({ slug, title: titleBySlug.get(slug) ?? slug, qualifiedViews }));

    return { days, qualifiedViews: current.total, previousQualifiedViews: previous.total, changeRatio, topPosts };
  });
}
