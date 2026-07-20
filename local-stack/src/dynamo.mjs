import { CreateTableCommand, DescribeTableCommand, DynamoDBClient, UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = process.env.TABLE_NAME ?? "BlogLocal";
const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT ?? "http://localhost:8000",
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
export const doc = DynamoDBDocumentClient.from(client);

const ADMIN_INDEX = {
  IndexName: "AdminPostsIndex",
  KeySchema: [{ AttributeName: "GSI1PK", KeyType: "HASH" }, { AttributeName: "GSI1SK", KeyType: "RANGE" }],
  Projection: {
    ProjectionType: "INCLUDE",
    NonKeyAttributes: ["slug", "title", "status", "category", "publishAt", "updatedAt"],
  },
};

async function waitForAdminIndex() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    const index = result.Table?.GlobalSecondaryIndexes?.find(({ IndexName }) => IndexName === ADMIN_INDEX.IndexName);
    if (index?.IndexStatus === "ACTIVE") return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("AdminPostsIndex did not become active");
}

export async function ensureTable() {
  try {
    const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    if (!result.Table?.GlobalSecondaryIndexes?.some(({ IndexName }) => IndexName === ADMIN_INDEX.IndexName)) {
      await client.send(new UpdateTableCommand({
        TableName: TABLE_NAME,
        AttributeDefinitions: [
          { AttributeName: "GSI1PK", AttributeType: "S" },
          { AttributeName: "GSI1SK", AttributeType: "S" },
        ],
        GlobalSecondaryIndexUpdates: [{ Create: ADMIN_INDEX }],
      }));
      await waitForAdminIndex();
    }
    return;
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
  }

  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" }, { AttributeName: "SK", AttributeType: "S" },
      { AttributeName: "GSI1PK", AttributeType: "S" }, { AttributeName: "GSI1SK", AttributeType: "S" },
      { AttributeName: "GSI2PK", AttributeType: "S" }, { AttributeName: "GSI2SK", AttributeType: "S" },
    ],
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
    GlobalSecondaryIndexes: [
      {
        IndexName: "StatusDateIndex",
        KeySchema: [{ AttributeName: "GSI2PK", KeyType: "HASH" }, { AttributeName: "GSI2SK", KeyType: "RANGE" }],
        Projection: { ProjectionType: "ALL" },
      },
      ADMIN_INDEX,
    ],
  }));
}
