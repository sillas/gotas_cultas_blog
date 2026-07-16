#!/usr/bin/env node
import { readFileSync } from "node:fs";

const stage = process.argv[2];
if (stage !== "homolog" && stage !== "production") throw new Error("Expected homolog or production stage");
const accounts = JSON.parse(readFileSync(new URL("../deploy-accounts.json", import.meta.url), "utf8"));
const accountId = String(accounts[stage] ?? "");
if (!/^\d{12}$/.test(accountId) || accountId === "111111111111" || accountId === "222222222222") {
  throw new Error(`Replace the placeholder ${stage} account in deploy-accounts.json`);
}
if (accounts.homolog === accounts.production) throw new Error("Homologation and production accounts must differ");
process.stdout.write(accountId);
