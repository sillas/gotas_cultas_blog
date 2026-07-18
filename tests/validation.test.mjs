import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parsePostInput, ValidationError } from "../packages/shared/dist/validation.js";

const valid = {
  slug: "primeiro-post", title: "Primeiro post", description: "Resumo",
  category: "Tecnologia", tags: ["aws"], coverImage: null,
  contentMarkdown: "# Conteúdo", status: "draft", publishAt: null,
};

test("accepts and normalizes a valid post", () => {
  assert.deepEqual(parsePostInput({ ...valid, tags: [" aws ", "aws"] }).tags, ["aws"]);
});

test("rejects malformed slugs", () => {
  assert.throws(() => parsePostInput({ ...valid, slug: "Slug inválido" }), ValidationError);
});

test("requires a valid publication date", () => {
  assert.throws(() => parsePostInput({ ...valid, status: "scheduled" }), /publishAt/);
  assert.equal(parsePostInput({ ...valid, status: "published", publishAt: "2026-07-15T12:00:00.000Z" }).status, "published");
});

test("requires a null cover or a valid image ID", () => {
  assert.equal(parsePostInput(valid).coverImage, null);
  assert.throws(() => parsePostInput({ ...valid, coverImage: undefined }), /coverImage/);
  assert.throws(() => parsePostInput({ ...valid, coverImage: { id: "not-an-image-id" } }), /valid image ID/);
});

test("CDK and shared package use the same DynamoDB schema names", () => {
  const shared = readFileSync(new URL("../packages/shared/src/dynamo.ts", import.meta.url), "utf8");
  const infra = readFileSync(new URL("../infra/lib/data-stack.ts", import.meta.url), "utf8");
  const names = [
    "TABLE_PARTITION_KEY",
    "TABLE_SORT_KEY",
    "STATUS_DATE_INDEX_NAME",
    "STATUS_DATE_INDEX_PARTITION_KEY",
    "STATUS_DATE_INDEX_SORT_KEY",
  ];
  const value = (source, name) => source.match(new RegExp(`const\\s+${name}\\s*=\\s*"([^"]+)"`))?.[1];
  for (const name of names) {
    assert.ok(value(shared, name), `${name} missing from shared schema`);
    assert.equal(value(infra, name), value(shared, name), `${name} differs between CDK and shared schema`);
  }
});

test("content dispatch accepts a valid signature and rejects tampering", () => {
  const timestamp = String(Date.now());
  const stage = "homolog";
  const reason = "post-published";
  const hmacSecret = "test-secret-not-used-outside-this-process";
  const signature = createHmac("sha256", hmacSecret)
    .update(`${timestamp}.${stage}.${reason}`)
    .digest("hex");
  const script = fileURLToPath(new URL("../scripts/validate-content-dispatch.mjs", import.meta.url));
  const baseEnv = {
    ...process.env,
    STAGE: stage,
    REASON: reason,
    TIMESTAMP: timestamp,
    HMAC_SECRET: hmacSecret,
  };
  const validResult = spawnSync(process.execPath, [script], {
    env: { ...baseEnv, SIGNATURE: signature },
    encoding: "utf8",
  });
  assert.equal(validResult.status, 0, validResult.stderr);

  const invalidResult = spawnSync(process.execPath, [script], {
    env: { ...baseEnv, SIGNATURE: `${signature[0] === "0" ? "1" : "0"}${signature.slice(1)}` },
    encoding: "utf8",
  });
  assert.notEqual(invalidResult.status, 0);
});
