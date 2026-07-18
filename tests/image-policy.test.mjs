import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const fixture = await readFile(new URL("./fixtures/cover-gradient.svg", import.meta.url));

test("cover policy generates bounded AVIF and WebP without metadata", async () => {
  for (const [format, quality] of [["avif", 55], ["webp", 82]]) {
    const pipeline = sharp(fixture, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 880, withoutEnlargement: true });
    const output = format === "avif"
      ? await pipeline.avif({ quality, effort: 5 }).toBuffer()
      : await pipeline.webp({ quality, effort: 4 }).toBuffer();
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 880);
    assert.equal(metadata.height, 495);
    assert.equal(metadata.format, format === "avif" ? "heif" : "webp");
    assert.equal(metadata.exif, undefined);
  }
});

test("cover policy does not enlarge a small fixture and rejects corrupt bytes", async () => {
  const small = await sharp(fixture).resize({ width: 320 }).png().toBuffer();
  const output = await sharp(small, { failOn: "error", limitInputPixels: 40_000_000 })
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  assert.equal((await sharp(output).metadata()).width, 320);
  await assert.rejects(() => sharp(Buffer.from("not-an-image"), { failOn: "error", limitInputPixels: 40_000_000 }).metadata());
});
