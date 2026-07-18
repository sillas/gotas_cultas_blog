import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const contentDir = resolve("site/src/content/posts");

for (const entry of await readdir(contentDir, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name.endsWith(".json") || entry.name === ".dev-ready")) {
    await rm(resolve(contentDir, entry.name));
  }
}
