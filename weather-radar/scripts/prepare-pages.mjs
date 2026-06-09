import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/public");

copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));
writeFileSync(resolve(outDir, ".nojekyll"), "");
