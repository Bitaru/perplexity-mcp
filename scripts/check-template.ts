import { access, readFile } from "node:fs/promises";

const required = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "wrangler.jsonc",
  ".dev.vars.example",
  "README.md",
  "docs/deployment.md",
  "docs/access-setup.md",
  "docs/compatibility.md",
];

for (const file of required) await access(file);

const readme = await readFile("README.md", "utf8");
if (!readme.includes("https://deploy.workers.cloudflare.com/button")) {
  throw new Error("Deploy Button link missing");
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const bindings = packageJson.cloudflare?.bindings;
for (const name of ["OWNER_STATE", "OWNER_EMAIL"]) {
  if (!bindings?.[name]?.type || !bindings[name].description) {
    throw new Error(`Cloudflare binding metadata missing for ${name}`);
  }
}

const wrangler = await readFile("wrangler.jsonc", "utf8");
if (!wrangler.includes('"preview_urls": false') || !wrangler.includes('"OWNER_STATE"')) {
  throw new Error("Worker protection config missing");
}

console.log(`template ok (${required.length} files)`);
