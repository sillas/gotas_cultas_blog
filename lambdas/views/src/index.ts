import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { postKey, metricDayKey, metricPostDayKey, metricDateFromInstant } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Public, unauthenticated endpoint — the CloudFront cache stays valid because
// this call happens client-side, after the HTML has already loaded from cache
// (PROJECT_SPEC.md section 4). Kept as a single atomic ADD for correctness;
// no GSI to keep in sync here (see packages/shared/src/dynamo.ts comment on
// ViewsIndex — the metrics Lambda uses a Scan instead, which is simpler and
// cheap enough at this post volume).
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const slug = event.pathParameters?.slug;
  if (!slug) return { statusCode: 400, body: "Missing slug" };

  try {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: postKey(slug),
        UpdateExpression: "ADD viewCount :inc",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeValues: { ":inc": 1 },
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      return { statusCode: 404, body: "Post not found" };
    }
    console.error(err);
    return { statusCode: 500, body: "Internal error" };
  }

  // Best-effort daily aggregates for the admin metrics panel
  // (ADSENSE_READINESS_AND_RECOMMENDATIONS.md #5/#7). The visitor's view is
  // already durably counted on the post above; a failure here must not turn
  // into a 500 for the visitor, so log and move on.
  const date = metricDateFromInstant(new Date());
  try {
    await Promise.all([
      doc.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: metricDayKey(date),
          UpdateExpression: "ADD qualifiedViews :inc",
          ExpressionAttributeValues: { ":inc": 1 },
        })
      ),
      doc.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: metricPostDayKey(date, slug),
          UpdateExpression: "ADD qualifiedViews :inc",
          ExpressionAttributeValues: { ":inc": 1 },
        })
      ),
    ]);
  } catch (err) {
    console.error(err);
  }

  return { statusCode: 204 };
}
