#!/usr/bin/env node
import { createHmac, timingSafeEqual } from "node:crypto";

const { STAGE, REASON, TIMESTAMP, SIGNATURE, HMAC_SECRET } = process.env;
if (STAGE !== "homolog" && STAGE !== "production") throw new Error("Invalid content dispatch stage");
if (!REASON || !TIMESTAMP || !SIGNATURE || !HMAC_SECRET) throw new Error("Incomplete signed content dispatch");

const age = Math.abs(Date.now() - Number(TIMESTAMP));
if (!Number.isFinite(age) || age > 5 * 60 * 1000) throw new Error("Expired content dispatch");

const expected = createHmac("sha256", HMAC_SECRET)
  .update(`${TIMESTAMP}.${STAGE}.${REASON}`)
  .digest("hex");
const providedBuffer = Buffer.from(SIGNATURE, "hex");
const expectedBuffer = Buffer.from(expected, "hex");
if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
  throw new Error("Invalid content dispatch signature");
}

console.log(`Validated signed content dispatch for ${STAGE}`);
