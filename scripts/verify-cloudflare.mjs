import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const worker = read("worker.js");
const testConfig = read("wrangler.test.jsonc");
const devConfig = read("wrangler.dev.jsonc");
const apiClient = read("src/apiClient.ts");
const app = read("src/App.tsx");
const index = read("index.html");

assert(index.includes('src="./runtime-config.js"'), "runtime config must load before the Wallet app");
assert(apiClient.includes("Cloudflare Wallet must use same-origin /api"), "Wallet must require same-origin Cloudflare /api");
assert(apiClient.includes("credentials:'include'"), "Wallet must retain HttpOnly Cookie sessions");
assert(apiClient.includes("fastlink_csrf"), "Wallet must retain the CSRF cookie/header contract");
assert(apiClient.includes("'/v1/wallet/accounts'"), "Wallet must read persisted wallet accounts");
assert(apiClient.includes("'/v1/wallet/transfers'"), "Wallet must use the authenticated internal-transfer contract");
assert(apiClient.includes("/transactions?limit=100"), "Wallet must read persisted wallet transactions");
assert(app.includes("Real wallet balances"), "Wallet UI must expose Backend wallet balances");
assert(app.includes("Internal transfer"), "Wallet UI must expose internal transfers");
assert(app.includes("Card transactions"), "Wallet UI must expose card transaction history");
assert(!app.includes("mock") && !app.includes("Mock"), "Wallet UI must not contain a Mock fallback");
assert(worker.includes('url.pathname === "/runtime-config.js"'), "Worker must provide runtime config");
assert(worker.includes('"x-fastlink-api-proxy"'), "Worker must expose its proxy identity");
assert(worker.includes('headers.delete("x-forwarded-host")'), "Worker must remove spoofed forwarding headers");
assert(worker.includes("FASTLINK_BACKEND_ORIGIN"), "Worker must require an explicit Backend origin");
assert(!worker.includes("production-309d") && !worker.includes("fastlink-backend-dev-development-a"), "Worker must not embed Backend hosts");
assert(testConfig.includes('"name": "fastlink-wallet-test"'), "Test Worker name must be isolated");
assert(testConfig.includes('"FASTLINK_ENVIRONMENT": "TEST"'), "Test Worker must declare TEST");
assert(testConfig.includes('"FASTLINK_PROXY_ID": "wallet-test"'), "Test proxy identity must be wallet-test");
assert(devConfig.includes('"name": "fastlink-wallet-dev"'), "Dev Worker name must be isolated");
assert(devConfig.includes('"FASTLINK_ENVIRONMENT": "SANDBOX"'), "Dev Worker must declare SANDBOX");
assert(devConfig.includes('"FASTLINK_PROXY_ID": "wallet-dev"'), "Dev proxy identity must be wallet-dev");

const dist = join(root, "dist");
if (statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
  const files = [];
  const collect = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) collect(path);
      else files.push(path);
    }
  };
  collect(dist);
  const artifact = files
    .filter((path) => /\.(?:html|js|css)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert(!artifact.includes("production-309d"), "Cloudflare artifact must not contain the Production Backend marker");
  assert(!artifact.includes("fastlink-backend-dev"), "Cloudflare artifact must not contain the Dev Backend marker");
}

console.log("Wallet Cloudflare runtime, proxy identity, Cookie/CSRF, and isolation contract PASS");
