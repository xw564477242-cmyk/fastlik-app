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
const cardBalance = read("src/cardBalance.ts");
const cardLimits = read("src/cardLimits.ts");
const walletData = read("src/walletData.ts");
const walletTransfer = read("src/walletTransfer.ts");
const walletTransactions = read("src/walletTransactions.ts");
const walletOperations = read("src/walletOperations.ts");
const virtualCardCreate = read("src/virtualCardCreate.ts");
const index = read("index.html");

assert(index.includes('src="./runtime-config.js"'), "runtime config must load before the Wallet app");
assert(apiClient.includes("Cloudflare Wallet must use same-origin /api"), "Wallet must require same-origin Cloudflare /api");
assert(apiClient.includes("credentials:'include'"), "Wallet must retain HttpOnly Cookie sessions");
assert(apiClient.includes("fastlink_csrf"), "Wallet must retain the CSRF cookie/header contract");
assert(walletTransfer.includes('WALLET_TRANSFER_ACCOUNTS_PATH = "/v1/wallet/accounts"'), "Wallet must read persisted wallet accounts");
assert(walletTransfer.includes('WALLET_TRANSFER_PATH = "/v1/wallet/transfers"'), "Wallet must use the authenticated internal-transfer contract");
assert(apiClient.includes("readWalletTransferAccounts(walletTransferTransport,session,walletRuntime.environment)"), "Wallet account reads must use the bounded session-gated transfer contract");
assert(apiClient.includes("submitWalletTransfer(walletTransferTransport,session,walletRuntime.environment,accounts,input,idempotencyKey)"), "Wallet transfer writes must use the bounded exact contract");
assert(apiClient.includes("readWalletTransactionHistory(walletTransactionTransport,session,walletRuntime.environment,filters,previous,signal)"), "Wallet must use the bounded session-gated public customer history path with caller cancellation");
assert(apiClient.includes("walletTransactionDetail:async"), "Wallet must use the public selected transaction detail endpoint");
assert(apiClient.includes("walletOperations:async"), "Wallet must use the public all-account operation activity endpoint");
assert(apiClient.includes("walletOperationDetail:async"), "Wallet must use the public selected operation detail endpoint");
assert(apiClient.includes("createVirtualCard:async"), "Wallet must use the typed public Virtual Card creation endpoint");
assert(virtualCardCreate.includes('sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST"'), "Virtual Card creation must remain non-production only");
assert(virtualCardCreate.includes("virtualCardCreateRequestIsCurrent"), "Virtual Card creation must remain session-scope and generation isolated");
assert(walletOperations.includes("/v1/wallet/operations?"), "Wallet activity must use the public bounded operation contract");
assert(walletOperations.includes("walletOperationActivityRequestIsCurrent"), "Wallet activity must remain scope, cursor and generation isolated");
assert(walletOperations.includes("parseWalletOperationDetail"), "Wallet operation detail must bind its immutable public summary fields");
assert(walletOperations.includes("walletOperationDetailRequestIsCurrent"), "Wallet operation detail must remain scope, selection and generation isolated");
assert(apiClient.includes("parseCardBalance(await request<unknown>(cardBalancePath(id)),id)"), "Card balance must use the strict public response parser");
assert(cardBalance.includes("cardBalanceRequestIsCurrent"), "Card balance must remain scope, selected-card and generation isolated");
assert(apiClient.includes("parseCardLimits(await request<unknown>(cardLimitsPath(id)),id)"), "Card limits must use the strict public response parser");
assert(cardLimits.includes("cardLimitsRequestIsCurrent"), "Card limits must remain scope, selected-card and generation isolated");
assert(walletTransactions.includes("WALLET_TRANSACTION_PAGE_SIZE = 25"), "Wallet transaction pages must remain consumer-bounded");
assert(walletTransactions.includes('WALLET_TRANSACTION_PATH = "/v1/wallet/transactions"'), "Wallet history must use the public customer transaction contract");
assert(walletTransactions.includes("walletTransactionDetailPath"), "Wallet detail must use a validated public transaction path");
assert(!walletData.includes("/v1/wallet/accounts/${encodeURIComponent(accountId)}/transactions"), "Wallet history must not use the legacy account transaction route");
assert(walletTransactions.includes("walletTransactionHistoryRequestIsCurrent"), "Wallet history must be isolated by scope, filters, cursor and generation");
assert(walletTransactions.includes("throwIfWalletTransactionRequestAborted(signal)"), "Wallet history and detail must reject responses after caller cancellation");
assert(walletData.includes("walletTransactionDetailRequestIsCurrent"), "Wallet detail must remain scope, asset, transaction and generation isolated");
assert(walletData.includes("walletRequestIsCurrent"), "Wallet async responses must remain scope and account isolated");
assert(walletData.includes("walletOperationPath"), "Wallet transfer status must use the existing safe operation endpoint");
assert(walletData.includes("WALLET_TRANSFER_STATUS_REFRESH_LIMIT = 5"), "Wallet transfer status refresh must remain bounded");
assert(app.includes("Real wallet balances"), "Wallet UI must expose Backend wallet balances");
assert(app.includes("Internal transfer"), "Wallet UI must expose internal transfers");
assert(app.includes("Customer Wallet history"), "Wallet UI must expose public customer Wallet history");
assert(app.includes("Transaction detail unavailable for this session"), "Wallet detail errors must remain safely normalized");
assert(app.includes("Selected transaction"), "Wallet UI must expose the validated selected transaction detail");
assert(app.includes("walletHistoryAbortController.current?.abort()") && app.includes("walletTransactionDetailAbortController.current?.abort()"), "Wallet transaction requests must actively cancel on invalidation or unmount");
assert(app.includes("Wallet transaction type filter") && app.includes("Wallet transaction status filter"), "Wallet history must expose closed Type and Status filter controls");
assert(walletTransactions.includes("walletTransactionFiltersForSelectedAsset") && walletTransactions.includes("limit: WALLET_TRANSACTION_PAGE_SIZE"), "Wallet history filters must retain selected-asset and fixed-limit boundaries");
assert(app.includes("walletTransactionFilterRequestAllowed") && walletTransactions.includes("ownedAccounts.some"), "Wallet history filters must reject unowned or cross-scope account requests");
assert(app.includes("All-account Wallet activity · read only"), "Wallet UI must expose read-only all-account operation activity");
assert(app.includes("Selected operation · read only"), "Wallet UI must expose read-only selected operation detail");
assert(app.includes("Create virtual card"), "Wallet UI must expose the gated non-production Virtual Card form");
assert(app.includes("Automatic retries are disabled"), "Wallet UI must retain the one-submit no-retry boundary");
assert(app.includes("No unvalidated or cross-card balance displayed"), "Card balance UI must fail closed for stale or invalid responses");
assert(app.includes("No unvalidated or cross-card limits displayed"), "Card limits UI must fail closed for stale or invalid responses");
assert(app.includes("Card limits · read only"), "Card limits UI must remain read only");
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
