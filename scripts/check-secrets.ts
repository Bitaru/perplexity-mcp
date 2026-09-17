import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path));
    else if (entry.name === ".dev.vars.example" || /\.(ts|json|jsonc|md|yml|yaml|env|txt)$/.test(entry.name)) out.push(path);
  }
  return out;
}

// This is a review aid, not proof that a repository contains no credentials.
const patterns = [
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /(?:session[_-]?token|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
];

for (const file of await files(".")) {
  const text = await readFile(file, "utf8");
  if (patterns.some((pattern) => pattern.test(text))) throw new Error(`possible secret in ${file}`);
}
console.log("secret scan ok (heuristic; review credentials separately)");
