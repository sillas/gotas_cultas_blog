import type { S3Event } from "aws-lambda";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { imageKey, type ImageFormat, type ImageVariant } from "@blog/shared";
import sharp from "sharp";

const s3 = new S3Client({});
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME!;
const PUBLIC_IMAGES_BASE_URL = process.env.PUBLIC_IMAGES_BASE_URL!.replace(/\/$/, "");
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const TARGET_WIDTHS = [480, 880, 1200] as const;
const CONTENT_FORMATS: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "heif",
};

async function fail(id: string, reason: string): Promise<void> {
  console.error(JSON.stringify({ event: "cover_processing_failed", imageId: id, reason }));
  await doc.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: imageKey(id),
    UpdateExpression: "SET #status = :failed, #error = :error",
    ExpressionAttributeNames: { "#status": "status", "#error": "error" },
    ExpressionAttributeValues: { ":failed": "failed", ":error": "A imagem enviada não pôde ser processada." },
  }));
}

function orientedDimensions(width: number, height: number, orientation?: number): [number, number] {
  return orientation && orientation >= 5 && orientation <= 8 ? [height, width] : [width, height];
}

async function processRecord(bucket: string, key: string): Promise<void> {
  const match = /^incoming\/([0-9a-f-]{36})\/original\.[a-z0-9]+$/i.exec(key);
  if (!match) return;
  const id = match[1];
  const state = await doc.send(new GetCommand({ TableName: TABLE_NAME, Key: imageKey(id) }));
  if (!state.Item || state.Item.status === "ready") return;

  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body || !object.ContentLength || object.ContentLength > MAX_BYTES) throw new Error("invalid byte length");
    const input = Buffer.from(await object.Body.transformToByteArray());
    const metadata = await sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) throw new Error("missing image metadata");
    if (metadata.pages && metadata.pages > 1) throw new Error("animated images are not accepted");
    const expectedFormat = CONTENT_FORMATS[String(state.Item.declaredContentType)];
    if (!expectedFormat || metadata.format !== expectedFormat) throw new Error("declared content type does not match bytes");

    const [width, height] = orientedDimensions(metadata.width, metadata.height, metadata.orientation);
    const widths: number[] = TARGET_WIDTHS.filter((target) => target <= width);
    const largest = Math.min(width, TARGET_WIDTHS.at(-1)!);
    if (!widths.includes(largest)) widths.push(largest);

    const variants: ImageVariant[] = [];
    for (const targetWidth of [...new Set(widths)].sort((a, b) => a - b)) {
      for (const format of ["avif", "webp"] as ImageFormat[]) {
        const pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_PIXELS })
          .rotate()
          .resize({ width: targetWidth, withoutEnlargement: true });
        const output = format === "avif"
          ? await pipeline.avif({ quality: 55, effort: 5 }).toBuffer({ resolveWithObject: true })
          : await pipeline.webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
        const outputKey = `covers/${id}/${output.info.width}.${format}`;
        await s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: outputKey,
          Body: output.data,
          ContentType: `image/${format}`,
          CacheControl: "public, max-age=31536000, immutable",
        }));
        variants.push({ format, width: output.info.width, height: output.info.height, url: `${PUBLIC_IMAGES_BASE_URL}/${outputKey}` });
      }
    }

    await doc.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: imageKey(id),
      UpdateExpression: "SET #status = :ready, width = :width, height = :height, aspectRatio = :ratio, variants = :variants REMOVE #error",
      ExpressionAttributeNames: { "#status": "status", "#error": "error" },
      ExpressionAttributeValues: { ":ready": "ready", ":width": width, ":height": height, ":ratio": width / height, ":variants": variants },
    }));
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    await fail(id, error instanceof Error ? error.message : String(error));
  }
}

export async function handler(event: S3Event): Promise<void> {
  for (const record of event.Records) {
    await processRecord(record.s3.bucket.name, decodeURIComponent(record.s3.object.key.replace(/\+/g, " ")));
  }
}
