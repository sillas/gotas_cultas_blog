import test from "node:test";
import assert from "node:assert/strict";
import { metricDayKey, metricPostDayKey, metricDayPartitionKey, metricDateFromInstant } from "../packages/shared/dist/dynamo.js";

test("metric day keys share one partition per UTC date", () => {
  assert.deepEqual(metricDayKey("2026-07-22"), { PK: "METRIC#2026-07-22", SK: "TOTAL" });
  assert.deepEqual(metricPostDayKey("2026-07-22", "primeiro-post"), {
    PK: "METRIC#2026-07-22",
    SK: "POST#primeiro-post",
  });
  assert.equal(metricDayKey("2026-07-22").PK, metricPostDayKey("2026-07-22", "primeiro-post").PK);
  assert.equal(metricDayPartitionKey("2026-07-22"), "METRIC#2026-07-22");
});

test("metricDateFromInstant always uses the UTC calendar day", () => {
  assert.equal(metricDateFromInstant(new Date("2026-07-22T23:59:59.000Z")), "2026-07-22");
  assert.equal(metricDateFromInstant(new Date("2026-07-23T00:00:00.000Z")), "2026-07-23");
});
