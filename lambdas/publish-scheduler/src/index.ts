import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { postKey, statusDateIndexKeys } from "@blog/shared";
import { triggerSiteRebuild } from "./github.js";

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

interface SchedulerEvent {
  slug: string;
}

// Invoked by EventBridge Scheduler at the post's publishAt instant
// (PROJECT_SPEC.md section 5). Flips a "scheduled" post to "published" and
// triggers the same GitHub Actions rebuild that an immediate publish would.
export async function handler(event: SchedulerEvent): Promise<void> {
  const { slug } = event;
  const now = new Date().toISOString();

  try {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: postKey(slug),
        ConditionExpression: "#status = :scheduled",
        UpdateExpression: "SET #status = :published, updatedAt = :now, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":scheduled": "scheduled",
          ":published": "published",
          ":now": now,
          ...(() => {
            const keys = statusDateIndexKeys("published", now, slug);
            return { ":gsi2pk": keys.GSI2PK, ":gsi2sk": keys.GSI2SK };
          })(),
        },
      })
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      console.warn(`[publish-scheduler] Post ${slug} was no longer "scheduled" — skipping (edited or deleted).`);
      return;
    }
    throw err;
  }

  await triggerSiteRebuild(`scheduled post ${slug} published`);
}
