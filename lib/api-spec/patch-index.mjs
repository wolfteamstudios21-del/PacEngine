import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, "../../lib/api-zod/src/index.ts");

let content = readFileSync(indexPath, "utf8");
content = content.replace(
  /^export (?:type )?\* from "\.\/generated\/types";\n?/m,
  "",
);
writeFileSync(indexPath, content, "utf8");
console.log("Patched api-zod index.ts: removed types re-export");
