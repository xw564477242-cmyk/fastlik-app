import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiClient = readFileSync(join(root, "src/apiClient.ts"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const walletData = readFileSync(join(root, "src/walletData.ts"), "utf8");
const index = readFileSync(join(root, "index.html"), "utf8");
const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
const runtimeTemplate = readFileSync(join(root, "runtime-config.template.js"), "utf8");
const entrypoint = readFileSync(join(root, "docker-entrypoint.sh"), "utf8");
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(index.includes('src="./runtime-config.js"'), "runtime config must resolve from the deployment base");
assert(vite.includes("VITE_PUBLIC_BASE"), "Vite public base must be deployment-configurable");
assert(apiClient.includes("window.__FASTLINK_RUNTIME__?.environment"), "Wallet must accept the runtime environment");
assert(apiClient.includes("window.__FASTLINK_RUNTIME__?.apiUrl"), "Wallet must accept the runtime API URL");
assert(apiClient.includes("window.__FASTLINK_RUNTIME__?.buildSha"), "Wallet must accept the runtime Build SHA");
assert(apiClient.includes("Cloudflare Wallet must use same-origin /api"), "Wallet browser runtime must require the Cloudflare same-origin API");
assert(app.includes("walletRuntime.apiUrl"), "Wallet UI must expose the runtime API base");
assert(runtimeTemplate.includes("$VITE_FASTLINK_ENVIRONMENT"), "runtime template must expose the environment");
assert(runtimeTemplate.includes("$VITE_FASTLINK_API_URL"), "runtime template must expose the API URL");
assert(runtimeTemplate.includes("$RAILWAY_GIT_COMMIT_SHA"), "runtime template must expose the Railway Release SHA");
assert(entrypoint.includes("VITE_FASTLINK_ENVIRONMENT is required"), "container startup must fail closed without environment");
assert(entrypoint.includes("VITE_FASTLINK_API_URL is required"), "container startup must fail closed without API URL");
assert(entrypoint.includes("RAILWAY_GIT_COMMIT_SHA is required"), "container startup must fail closed without Release SHA");
assert(entrypoint.includes("SANDBOX Wallet must use the approved Backend Dev API"), "container startup must reject a non-Dev Backend");
assert(dockerfile.includes("/docker-entrypoint.d/40-fastlink-runtime.sh"), "runtime generation must execute before nginx starts");
assert(apiClient.includes("credentials:'include'"), "Wallet API must include Cookie credentials");
assert(apiClient.includes("fastlink_csrf"), "Wallet API must use the CSRF cookie/header contract");
assert(!apiClient.includes("Authorization"), "Wallet API must not send a Bearer token");
assert(!apiClient.includes("localStorage"), "Wallet authentication must not use localStorage");
assert(!apiClient.includes("sessionStorage"), "Wallet authentication must not use sessionStorage");
assert(!apiClient.includes("supabase"), "Wallet authentication must not use Supabase frontend sessions");
assert(!apiClient.includes("mock") && !apiClient.includes("Mock"), "Wallet API must not contain a Mock fallback");
assert(!apiClient.includes("exquisite-surprise-production"), "Wallet source must not hard-code the Production Backend");
assert(apiClient.includes("VITE_FASTLINK_API_URL"), "Wallet API must require an explicit build API URL");
assert(apiClient.includes("VITE_FASTLINK_ENVIRONMENT"), "Wallet must require an explicit environment");
assert(apiClient.includes("VITE_FASTLINK_BUILD_SHA"), "Wallet must expose the build SHA");
assert(apiClient.includes("parseWalletAccounts(await request<unknown>"), "Wallet account responses must be reconstructed from a public allowlist");
assert(apiClient.includes("internalTransfer:async") && apiClient.includes("Promise<WalletTransferReceipt>"), "Internal transfer must expose only the typed public receipt");
assert(apiClient.includes("parseWalletTransferReceipt(await request<unknown>"), "Transfer and status responses must pass through the public allowlist parser");
assert(apiClient.includes("const idempotencyKey=crypto.randomUUID()"), "Each transfer invocation must retain one generated idempotency key");
assert(apiClient.includes("walletTransferStatus:async"), "Wallet must consume the existing safe operation status endpoint");
assert(apiClient.includes("walletTransactionPath(selectedAsset,cursor)"), "Wallet must consume bounded public customer Wallet history");
assert(apiClient.includes("walletTransactionDetail:async"), "Wallet must consume the public selected transaction detail endpoint");
assert(walletData.includes("walletTransactionDetailPath"), "Wallet detail must use a validated public transaction path");
assert(walletData.includes("parseWalletTransactionDetail"), "Wallet detail must be reconstructed from the public transaction allowlist");
assert(walletData.includes("walletRequestIsCurrent"), "Wallet responses must be isolated by scope, account and request generation");
assert(walletData.includes("walletHistoryRequestIsCurrent"), "Wallet history must be isolated by scope, selected asset, cursor and request generation");
assert(walletData.includes("walletTransactionDetailRequestIsCurrent"), "Wallet detail must be isolated by scope, asset, transaction and request generation");
assert(walletData.includes("/v1/wallet/transactions?"), "Wallet history must use the public customer contract");
assert(!walletData.includes("/v1/wallet/accounts/${encodeURIComponent(accountId)}/transactions"), "Legacy account history must remain removed");
assert(walletData.includes("walletTransferStatusRequestIsCurrent"), "Transfer status must be isolated by scope, source account, operation and request generation");
assert(walletData.includes("WALLET_TRANSFER_STATUS_REFRESH_LIMIT = 5"), "Transfer status refresh must remain bounded");
assert(app.includes("No unvalidated or cross-account response displayed"), "Wallet UI must fail closed for stale or invalid responses");
assert(app.includes("Transaction detail unavailable for this session"), "Wallet detail errors must use one safe public message");
assert(app.includes("Selected transaction"), "Wallet UI must expose the validated selected transaction detail");

const excluded = new Set([".git", "node_modules", "dist", "docs"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i,
  /\b(?:password|token|secret)\s*[:=]\s*["'][^"']{20,}["']/i,
];
const violations = [];
function scan(directory) {
  for (const name of readdirSync(directory)) {
    if (excluded.has(name)) continue;
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) scan(path);
    else if (stat.size <= 1_000_000 && /\.(?:ts|tsx|js|mjs|json|html|md|ya?ml|env|example)$/.test(name)) {
      const content = readFileSync(path, "utf8");
      for (const pattern of secretPatterns) if (pattern.test(content)) violations.push(`${relative(root, path)}:${pattern}`);
    }
  }
}
scan(root);
assert(violations.length === 0, `Potential committed secrets: ${violations.join(", ")}`);
console.log("Wallet Dev runtime, authentication, no-fallback, and secret verification passed.");
