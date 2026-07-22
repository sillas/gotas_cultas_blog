import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ADSENSE_READINESS_AND_RECOMMENDATIONS.md, "Preparação sem ativar
// anúncios": a build with the monetization flag off must not ship any
// Google/AdSense host in the HTML. This guards the gates added in
// site/src/lib/flags.ts, CookieConsent.astro and AdSlot.astro — if someone
// removes the flag check by accident, this test catches it in CI, which
// always builds site/dist with PUBLIC_ADSENSE_ENABLED unset (see ci.yml).
const FORBIDDEN_HOSTS = [
  "googlesyndication",
  "doubleclick.net",
  "adsbygoogle",
  "google-analytics.com",
  "googletagmanager.com",
  "pagead2.google",
];

const distDir = fileURLToPath(new URL("../site/dist", import.meta.url));

function listHtmlFiles(dir) {
  let files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files = files.concat(listHtmlFiles(full));
    else if (entry.endsWith(".html")) files.push(full);
  }
  return files;
}

test("no Google/AdSense host is present in the built site while PUBLIC_ADSENSE_ENABLED is off", (t) => {
  let htmlFiles;
  try {
    htmlFiles = listHtmlFiles(distDir);
  } catch {
    t.skip("site/dist not built — run `npm run build:site` first (CI always does).");
    return;
  }

  assert.ok(htmlFiles.length > 0, "expected at least one built HTML page");

  for (const file of htmlFiles) {
    const html = readFileSync(file, "utf8").toLowerCase();
    for (const host of FORBIDDEN_HOSTS) {
      assert.ok(!html.includes(host), `${file} must not reference "${host}" while the AdSense flag is off`);
    }
  }
});
