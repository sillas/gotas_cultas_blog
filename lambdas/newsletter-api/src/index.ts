import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { createHash, randomBytes } from "node:crypto";
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { ACTIVE_SUBSCRIPTIONS_PK, isValidEmail, normalizeEmail, subscriberKey, tokenKey } from "@blog/shared";

const TABLE_NAME = process.env.TABLE_NAME!;
const SITE_URL = process.env.SITE_URL!.replace(/\/$/, "");
const SENDER_EMAIL = process.env.SENDER_EMAIL!;
const CONSENT_VERSION = process.env.CONSENT_VERSION!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const DAY = 86_400;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const nowSeconds = () => Math.floor(Date.now() / 1000);
const neutral = () => json(202, { message: "Se o endereço puder ser inscrito, enviaremos uma confirmação." });

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
function redirect(result: string): APIGatewayProxyResultV2 {
  return { statusCode: 303, headers: { location: `${SITE_URL}/?newsletter=${result}`, "cache-control": "no-store" } };
}
function requestToken(event: APIGatewayProxyEventV2): string | undefined {
  if (event.queryStringParameters?.token) return event.queryStringParameters.token;
  if (!event.body) return undefined;
  try { return (JSON.parse(event.body) as { token?: string }).token; } catch { return undefined; }
}

async function subscribe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let body: { email?: unknown; consent?: unknown; website?: unknown };
  try { body = JSON.parse(event.body ?? "{}"); } catch { return json(400, { message: "Requisição inválida." }); }
  if (body.website) return neutral();
  if (body.consent !== true || typeof body.email !== "string") return json(400, { message: "E-mail e consentimento são obrigatórios." });
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return json(400, { message: "Informe um e-mail válido." });
  const emailHash = hash(email);
  const profileKey = subscriberKey(emailHash);
  const existing = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: profileKey, ProjectionExpression: "#status", ExpressionAttributeNames: { "#status": "status" } }));
  if (existing.Item?.status === "CONFIRMED") return neutral();

  const confirmationToken = token();
  const confirmationHash = hash(confirmationToken);
  const requestedAt = new Date().toISOString();
  try {
    await doc.send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: TABLE_NAME, Item: { ...profileKey, email, emailHash, status: "PENDING", consentVersion: CONSENT_VERSION, requestedAt, currentConfirmationTokenHash: confirmationHash, expiresAt: nowSeconds() + 7 * DAY }, ConditionExpression: "attribute_not_exists(PK) OR #status <> :confirmed", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":confirmed": "CONFIRMED" } } },
      { Put: { TableName: TABLE_NAME, Item: { ...tokenKey("CONFIRM", confirmationHash), subscriberPK: profileKey.PK, expiresAt: nowSeconds() + DAY } } },
    ] }));
  } catch (error) { if (error instanceof TransactionCanceledException) return neutral(); throw error; }
  const confirmUrl = `${SITE_URL}/api/newsletter/confirm?token=${encodeURIComponent(confirmationToken)}`;
  await ses.send(new SendEmailCommand({
    FromEmailAddress: SENDER_EMAIL, Destination: { ToAddresses: [email] },
    Content: { Simple: { Subject: { Data: "Confirme sua inscrição no Gotas Cultas", Charset: "UTF-8" }, Body: {
      Text: { Data: `Confirme sua inscrição acessando: ${confirmUrl}\n\nSe você não solicitou, ignore esta mensagem.`, Charset: "UTF-8" },
      Html: { Data: `<p>Confirme sua inscrição no Gotas Cultas:</p><p><a href="${confirmUrl}">Confirmar inscrição</a></p><p>Se você não solicitou, ignore esta mensagem.</p>`, Charset: "UTF-8" },
    } } },
  }));
  return neutral();
}

async function confirm(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const raw = requestToken(event);
  if (!raw || raw.length > 128) return redirect("invalid");
  const tokenHash = hash(raw);
  const lookupKey = tokenKey("CONFIRM", tokenHash);
  const lookup = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: lookupKey, ConsistentRead: true }));
  if (!lookup.Item || lookup.Item.expiresAt <= nowSeconds()) return redirect("invalid");
  const unsubscribeToken = token();
  const unsubscribeHash = hash(unsubscribeToken);
  try {
    await doc.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: TABLE_NAME, Key: { PK: lookup.Item.subscriberPK, SK: "PROFILE" }, ConditionExpression: "#status = :pending AND currentConfirmationTokenHash = :token", UpdateExpression: "SET #status = :confirmed, confirmedAt = :now, ActivePK = :active, ActiveSK = emailHash, unsubscribeToken = :unsubscribe REMOVE expiresAt, currentConfirmationTokenHash", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":pending": "PENDING", ":confirmed": "CONFIRMED", ":token": tokenHash, ":now": new Date().toISOString(), ":active": ACTIVE_SUBSCRIPTIONS_PK, ":unsubscribe": unsubscribeToken } } },
      { Delete: { TableName: TABLE_NAME, Key: lookupKey } },
      { Put: { TableName: TABLE_NAME, Item: { ...tokenKey("UNSUBSCRIBE", unsubscribeHash), subscriberPK: lookup.Item.subscriberPK } } },
    ] }));
  } catch (error) { if (error instanceof TransactionCanceledException) return redirect("invalid"); throw error; }
  return redirect("confirmed");
}

async function unsubscribe(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const raw = requestToken(event);
  if (!raw || raw.length > 128) return redirect("invalid");
  const lookupKey = tokenKey("UNSUBSCRIBE", hash(raw));
  const lookup = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: lookupKey, ConsistentRead: true }));
  if (!lookup.Item) return redirect("unsubscribed");
  try {
    await doc.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: TABLE_NAME, Key: { PK: lookup.Item.subscriberPK, SK: "PROFILE" }, ConditionExpression: "attribute_exists(PK)", UpdateExpression: "SET #status = :status, unsubscribedAt = :now, expiresAt = :expires REMOVE ActivePK, ActiveSK, unsubscribeToken", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":status": "UNSUBSCRIBED", ":now": new Date().toISOString(), ":expires": nowSeconds() + 30 * DAY } } },
      { Delete: { TableName: TABLE_NAME, Key: lookupKey } },
    ] }));
  } catch (error) { if (!(error instanceof TransactionCanceledException)) throw error; }
  return redirect("unsubscribed");
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const route = event.rawPath;
    if (event.requestContext.http.method === "POST" && route.endsWith("/subscriptions")) return subscribe(event);
    if (event.requestContext.http.method === "GET" && route.endsWith("/confirm")) return confirm(event);
    if (["GET", "POST"].includes(event.requestContext.http.method) && route.endsWith("/unsubscribe")) return unsubscribe(event);
    return json(405, { message: "Método não permitido." });
  } catch (error) { console.error(JSON.stringify({ event: "newsletter_api_failed", error: error instanceof Error ? error.message : String(error) })); return json(500, { message: "Não foi possível concluir a solicitação." }); }
}
