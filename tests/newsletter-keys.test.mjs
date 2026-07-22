import test from "node:test";
import assert from "node:assert/strict";
import { deliveryKey, isValidEmail, normalizeEmail, subscriberKey, tokenKey } from "../packages/shared/dist/index.js";

test("newsletter normalization and keys support direct DynamoDB access", () => {
  assert.equal(normalizeEmail("  Reader@Example.COM "), "reader@example.com");
  assert.equal(isValidEmail("reader@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.deepEqual(subscriberKey("abc"), { PK: "SUBSCRIBER#abc", SK: "PROFILE" });
  assert.deepEqual(tokenKey("CONFIRM", "def"), { PK: "TOKEN#CONFIRM#def", SK: "TOKEN" });
  assert.deepEqual(deliveryKey("post", "abc"), { PK: "CAMPAIGN#post", SK: "RECIPIENT#abc" });
});
