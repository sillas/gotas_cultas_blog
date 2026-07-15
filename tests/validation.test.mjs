import test from "node:test";
import assert from "node:assert/strict";
import { parsePostInput, ValidationError } from "../packages/shared/dist/validation.js";

const valid = {
  slug: "primeiro-post", title: "Primeiro post", description: "Resumo",
  category: "Tecnologia", tags: ["aws"], coverImageKey: null,
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
