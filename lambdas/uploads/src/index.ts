import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { PresignedUpload } from "@blog/shared";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const IMAGES_BUCKET_NAME = process.env.IMAGES_BUCKET_NAME!;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// Admin-only (behind the Cognito authorizer on the API route). S3 validates
// the signed POST policy before accepting any bytes.
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const parsed: unknown = JSON.parse(event.body ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { message: "Request body must be a JSON object" });
    }
    const { fileName, contentType } = parsed as {
      fileName?: string;
      contentType?: string;
    };

    const extension = fileName?.split(".").pop()?.toLowerCase();
    if (!fileName || fileName.length > 180 || !contentType || !ALLOWED_TYPES.has(contentType) || !extension || !ALLOWED_EXTENSIONS.has(extension)) {
      return json(400, { message: "A valid JPEG, PNG, WebP, GIF or AVIF file is required" });
    }

    const imageId = randomUUID();
    const objectKey = `incoming/${imageId}/original.${extension}`;

    const presigned = await createPresignedPost(s3, {
      Bucket: IMAGES_BUCKET_NAME,
      Key: objectKey,
      Fields: { "Content-Type": contentType },
      Conditions: [
        ["content-length-range", 1, 8 * 1024 * 1024],
        ["eq", "$Content-Type", contentType],
        ["eq", "$key", objectKey],
      ],
      Expires: 120,
    });

    const result: PresignedUpload = {
      uploadUrl: presigned.url,
      fields: presigned.fields,
      image: {
        id: imageId,
        status: "processing",
        width: null,
        height: null,
        aspectRatio: null,
        variants: [],
      },
    };

    return json(200, result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json(400, { message: "Request body must be valid JSON" });
    }
    console.error("Failed to create presigned upload", error);
    return json(500, { message: "Internal error" });
  }
}
