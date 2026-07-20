import test from "node:test";
import assert from "node:assert/strict";
import { adminPostIndexKeys } from "../packages/shared/dist/dynamo.js";

test("admin index separates drafts, scheduled posts and published years", () => {
  const updatedAt = "2026-07-20T12:00:00.000Z";
  assert.deepEqual(adminPostIndexKeys("draft", null, updatedAt, "draft-post"), {
    GSI1PK: "ADMIN#DRAFT",
    GSI1SK: `${updatedAt}#draft-post`,
  });
  assert.deepEqual(adminPostIndexKeys("scheduled", "2026-08-02T10:00:00.000Z", updatedAt, "scheduled-post"), {
    GSI1PK: "ADMIN#SCHEDULED",
    GSI1SK: "2026-08-02T10:00:00.000Z#scheduled-post",
  });
  assert.deepEqual(adminPostIndexKeys("published", "2025-12-31T23:00:00.000Z", updatedAt, "published-post"), {
    GSI1PK: "ADMIN#PUBLISHED#2025",
    GSI1SK: "2025-12-31T23:00:00.000Z#published-post",
  });
});

test("changing status replaces the logical admin partition", () => {
  const updatedAt = "2026-07-20T12:00:00.000Z";
  const draft = adminPostIndexKeys("draft", null, updatedAt, "post");
  const scheduled = adminPostIndexKeys("scheduled", "2026-08-01T12:00:00.000Z", updatedAt, "post");
  const published = adminPostIndexKeys("published", "2026-08-01T12:00:00.000Z", updatedAt, "post");
  assert.notEqual(draft.GSI1PK, scheduled.GSI1PK);
  assert.notEqual(scheduled.GSI1PK, published.GSI1PK);
});
