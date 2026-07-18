import test from "node:test";
import assert from "node:assert/strict";
import { hasAdminGroup } from "../packages/shared/dist/auth.js";

const event = (groups) => ({ requestContext: { authorizer: { jwt: { claims: { "cognito:groups": groups } } } } });

test("requires the Cognito administrator group", () => {
  assert.equal(hasAdminGroup(event(["blog-admins"])), true);
  assert.equal(hasAdminGroup(event('["blog-admins"]')), true);
  assert.equal(hasAdminGroup(event(["readers"])), false);
  assert.equal(hasAdminGroup({}), false);
});
