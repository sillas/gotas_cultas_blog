import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignedUpload } from "@blog/shared";
import { randomUUID } from "node:crypto";

const s3 = new S3Client({});
const IMAGES_BUCKET_NAME = process.env.IMAGES_BUCKET_NAME!;
const PUBLIC_IMAGES_BASE_URL = process.env.PUBLIC_IMAGES_BASE_URL!;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function sanitizeFileName(fileName: string): string {
  return fileName.toLowerCase().replace(/[^a-z0-9.-]/g, "-");
}

// Admin-only (behind the Cognito authorizer on the API route). The browser
// uploads straight to S3 with this URL — the file never passes through Lambda.
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

    const objectKey = `covers/${randomUUID()}-${sanitizeFileName(fileName)}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: IMAGES_BUCKET_NAME,
        Key: objectKey,
        ContentType: contentType,
        // Object keys are UUID-based and never overwritten, so browsers and
        // CloudFront can safely retain an uploaded image indefinitely.
        CacheControl: "public, max-age=31536000, immutable",
      }),
      { expiresIn: 300 }
    );

    const result: PresignedUpload = {
      uploadUrl,
      objectKey,
      publicUrl: `${PUBLIC_IMAGES_BASE_URL}/${objectKey}`,
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
