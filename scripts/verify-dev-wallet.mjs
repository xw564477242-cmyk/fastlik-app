import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiClient = readFileSync(join(root, "src/apiClient.ts"), "utf8");
const index = readFileSync(join(root, "index.html"), "utf8");
const vite = readFileSync(join(root, "vite.config.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(index.includes('src="./runtime-config.js"'), "runtime config must resolve from the deployment base");
assert(vite.includes("VITE_PUBLIC_BASE"), "Vite public base must be deployment-configurable");
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
