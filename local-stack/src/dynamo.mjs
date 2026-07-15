import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.TABLE_NAME ?? "BlogLocal";
const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000",
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
export const doc = DynamoDBDocumentClient.from(client);

export async function ensureTable() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    return;
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
  }

  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" }, { AttributeName: "SK", AttributeType: "S" },
      { AttributeName: "GSI2PK", AttributeType: "S" }, { AttributeName: "GSI2SK", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
    GlobalSecondaryIndexes: [{
      IndexName: "StatusDateIndex",
      KeySchema: [{ AttributeName: "GSI2PK", KeyType: "HASH" }, { AttributeName: "GSI2SK", KeyType: "RANGE" }],
      Projection: { ProjectionType: "ALL" },
    }],
  }));
}
