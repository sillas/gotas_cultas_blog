import type { SNSEvent } from "aws-lambda";
import { createHash } from "node:crypto";
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { subscriberKey, tokenKey } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
interface SesFeedback { eventType?: string; mail?: { tags?: Record<string, string[]> }; }

export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    const feedback = JSON.parse(record.Sns.Message) as SesFeedback;
    const emailHash = feedback.mail?.tags?.subscriber?.[0];
    const status = feedback.eventType === "COMPLAINT" ? "COMPLAINED" : feedback.eventType === "BOUNCE" ? "BOUNCED" : undefined;
    if (!emailHash || !status) continue;
    try {
      const key = subscriberKey(emailHash);
      const profile = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: key, ConsistentRead: true }));
      if (!profile.Item) continue;
      const unsubscribeHash = typeof profile.Item.unsubscribeToken === "string" ? createHash("sha256").update(profile.Item.unsubscribeToken).digest("hex") : undefined;
      await doc.send(new TransactWriteCommand({ TransactItems: [
        { Update: { TableName: TABLE_NAME, Key: key, ConditionExpression: "attribute_exists(PK)", UpdateExpression: "SET #status = :status, feedbackAt = :now, expiresAt = :expires REMOVE ActivePK, ActiveSK, unsubscribeToken", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":status": status, ":now": new Date().toISOString(), ":expires": Math.floor(Date.now() / 1000) + 180 * 86_400 } } },
        ...(unsubscribeHash ? [{ Delete: { TableName: TABLE_NAME, Key: tokenKey("UNSUBSCRIBE", unsubscribeHash) } }] : []),
      ] }));
    } catch (error) { if (!(error instanceof TransactionCanceledException)) throw error; }
  }
}
