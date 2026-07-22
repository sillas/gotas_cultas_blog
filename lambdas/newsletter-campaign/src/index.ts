import type { SQSEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import { ACTIVE_SUBSCRIPTIONS_INDEX, ACTIVE_SUBSCRIPTIONS_PK } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const DELIVERY_QUEUE_URL = process.env.DELIVERY_QUEUE_URL!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqs = new SQSClient({});
export interface Campaign { postId: string; slug: string; title: string; excerpt?: string; }

export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const campaign = JSON.parse(record.body) as Campaign;
    if (!campaign.postId || !campaign.slug || !campaign.title) throw new Error("Invalid campaign message");
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await doc.send(new QueryCommand({ TableName: TABLE_NAME, IndexName: ACTIVE_SUBSCRIPTIONS_INDEX, ExclusiveStartKey: cursor, KeyConditionExpression: "ActivePK = :active", ExpressionAttributeValues: { ":active": ACTIVE_SUBSCRIPTIONS_PK }, ProjectionExpression: "emailHash" }));
      const items = page.Items ?? [];
      for (let offset = 0; offset < items.length; offset += 10) {
        const batch = items.slice(offset, offset + 10);
        const result = await sqs.send(new SendMessageBatchCommand({ QueueUrl: DELIVERY_QUEUE_URL, Entries: batch.map((subscriber, index) => ({ Id: `${offset + index}`, MessageBody: JSON.stringify({ ...campaign, emailHash: subscriber.emailHash }) })) }));
        if (result.Failed?.length) throw new Error(`Failed to queue ${result.Failed.length} newsletter deliveries`);
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
}
