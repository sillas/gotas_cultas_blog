import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { deliveryKey, subscriberKey } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const SITE_URL = process.env.SITE_URL!.replace(/\/$/, "");
const SENDER_EMAIL = process.env.SENDER_EMAIL!;
const CONFIGURATION_SET_NAME = process.env.CONFIGURATION_SET_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

interface Delivery { postId: string; slug: string; title: string; excerpt?: string; emailHash: string; }

async function deliver(message: Delivery): Promise<void> {
  const profile = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: subscriberKey(message.emailHash), ConsistentRead: true }));
  if (profile.Item?.status !== "CONFIRMED" || !profile.Item.email || !profile.Item.unsubscribeToken) return;
  const email = profile.Item.email as string;
  const unsubscribeToken = profile.Item.unsubscribeToken as string;
  const key = deliveryKey(message.postId, message.emailHash);
  const lockExpiresAt = Math.floor(Date.now() / 1000) + 60;
  try {
    await doc.send(new PutCommand({ TableName: TABLE_NAME, Item: { ...key, status: "SENDING", createdAt: new Date().toISOString(), lockExpiresAt, expiresAt: Math.floor(Date.now() / 1000) + 90 * 86_400 }, ConditionExpression: "attribute_not_exists(PK) OR (#status = :sending AND lockExpiresAt < :now)", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":sending": "SENDING", ":now": Math.floor(Date.now() / 1000) } }));
  } catch (error) { if (error instanceof ConditionalCheckFailedException) return; throw error; }
  const postUrl = `${SITE_URL}/post/${encodeURIComponent(message.slug)}/`;
  const unsubscribeUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  try {
    const result = await ses.send(new SendEmailCommand({ FromEmailAddress: SENDER_EMAIL, Destination: { ToAddresses: [email] }, ConfigurationSetName: CONFIGURATION_SET_NAME,
      EmailTags: [{ Name: "subscriber", Value: message.emailHash }],
      Content: { Simple: { Headers: [{ Name: "List-Unsubscribe", Value: `<${unsubscribeUrl}>` }, { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }], Subject: { Data: message.title, Charset: "UTF-8" }, Body: {
        Text: { Data: `${message.title}\n\n${message.excerpt ?? "Uma nova reflexão foi publicada."}\n\nLeia: ${postUrl}\n\nCancelar inscrição: ${unsubscribeUrl}`, Charset: "UTF-8" },
        Html: { Data: `<h1>${escapeHtml(message.title)}</h1><p>${escapeHtml(message.excerpt ?? "Uma nova reflexão foi publicada.")}</p><p><a href="${postUrl}">Ler no Gotas Cultas</a></p><hr><p><a href="${unsubscribeUrl}">Cancelar inscrição</a></p>`, Charset: "UTF-8" },
      } } },
    }));
    await doc.send(new UpdateCommand({ TableName: TABLE_NAME, Key: key, UpdateExpression: "SET #status = :sent, sentAt = :now, sesMessageId = :id REMOVE lockExpiresAt", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":sent": "SENT", ":now": new Date().toISOString(), ":id": result.MessageId ?? "unknown" } }));
  } catch (error) {
    await doc.send(new DeleteCommand({ TableName: TABLE_NAME, Key: key }));
    throw error;
  }
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];
  await Promise.all(event.Records.map(async record => { try { await deliver(JSON.parse(record.body) as Delivery); } catch (error) { console.error(JSON.stringify({ event: "newsletter_delivery_failed", messageId: record.messageId, error: error instanceof Error ? error.message : String(error) })); failures.push({ itemIdentifier: record.messageId }); } }));
  return { batchItemFailures: failures };
}
