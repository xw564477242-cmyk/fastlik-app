import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiClient = readFileSync(join(root, "src/apiClient.ts"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const cardBalance = readFileSync(join(root, "src/cardBalance.ts"), "utf8");
const cardLimits = readFileSync(join(root, "src/cardLimits.ts"), "utf8");
const walletData = readFileSync(join(root, "src/walletData.ts"), "utf8");
const walletTransfer = readFileSync(join(root, "src/walletTransfer.ts"), "utf8");
const walletOperations = readFileSync(join(root, "src/walletOperations.ts"), "utf8");
const virtualCardCreate = readFileSync(join(root, "src/virtualCardCreate.ts"), "utf8");
const cardReplacement = readFileSync(join(root, "src/cardReplacement.ts"), "utf8");
const cardRenewal = readFileSync(join(root, "src/cardRenewal.ts"), "utf8");
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
assert(apiClient.includes("readWalletTransferAccounts(walletTransferTransport,session,walletRuntime.environment)"), "Wallet account responses must use the bounded session-gated transfer consumer");
assert(apiClient.includes("parseCardBalance(await request<unknown>(cardBalancePath(id)),id)"), "Card balance must be reconstructed from the public typed contract");
assert(!apiClient.includes("balance:(id:string)=>request<Record<string,unknown>>"), "Card balance must not expose a raw response record");
assert(cardBalance.includes("CardBalanceRecord"), "Card balance must expose a strict typed record");
assert(cardBalance.includes("parseCardBalance"), "Card balance must use a public allowlist parser");
assert(cardBalance.includes("cardBalanceRequestIsCurrent"), "Card balance must be isolated by scope, selected card and generation");
assert(apiClient.includes("parseCardLimits(await request<unknown>(cardLimitsPath(id)),id)"), "Card limits must be reconstructed from the public typed contract");
assert(cardLimits.includes("CardLimitsRecord"), "Card limits must expose a strict typed record");
assert(cardLimits.includes("parseCardLimits"), "Card limits must use a public allowlist parser");
assert(cardLimits.includes("cardLimitsRequestIsCurrent"), "Card limits must be isolated by scope, selected card and generation");
assert(apiClient.includes("internalTransfer:async") && apiClient.includes("Promise<WalletTransferReceipt>"), "Internal transfer must expose only the typed public receipt");
assert(apiClient.includes("submitWalletTransfer(walletTransferTransport,session,walletRuntime.environment,accounts,input,idempotencyKey)"), "Transfer responses must pass through the bounded exact consumer");
assert(app.includes("const idempotencyKey=crypto.randomUUID();const request=createWalletTransferRequestIdentity"), "Each user transfer submission must generate one caller-owned idempotency key");
assert(apiClient.includes("walletTransferStatus:async"), "Wallet must consume the existing safe operation status endpoint");
assert(walletTransfer.includes("WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES = 65_536") && walletTransfer.includes("WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES = 16_384"), "Wallet transfer raw JSON responses must remain bounded");
assert(walletTransfer.includes("walletTransferSessionScope") && walletTransfer.includes("session.expiresAt"), "Wallet transfer scope must bind identity, environment, and session expiry");
assert(walletTransfer.includes('runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST"'), "Wallet transfer must remain limited to matching SANDBOX and TEST sessions");
assert(walletTransfer.includes("exactDataRecord(value, receiptFields") && walletTransfer.includes("exactDataRecord(value, accountFields"), "Wallet transfer responses must use exact public field allowlists");
assert(walletTransfer.includes("rejectDuplicateJsonObjectKeys(raw, name)") && walletTransfer.indexOf("rejectDuplicateJsonObjectKeys(raw, name)") < walletTransfer.indexOf("return JSON.parse(raw)"), "Wallet transfer raw JSON must reject duplicate and escaped-equivalent object keys before parsing");
assert(walletTransfer.includes("value !== value.trim()") && walletTransfer.includes("new TextEncoder().encode(value).byteLength > maximum"), "Wallet transfer public text must be trimmed and bounded by UTF-8 bytes");
assert(walletTransfer.includes("available.scaled !== posted.scaled"), "Wallet transfer accounts must require availableBalance to equal postedBalance");
assert(walletTransfer.includes("beginWalletTransferSubmit") && walletTransfer.includes("activeRequestId !== null"), "Wallet transfer must synchronously reject duplicate submissions");
assert(app.includes("walletTransferSubmitGate.current.activeRequestId=null") && app.includes("walletTransferStatusInFlight.current=false"), "Wallet transfer busy and status state must clear synchronously with scope invalidation");
assert(app.includes("setTransferReceipt(null)") && app.includes("replaceAccounts([])"), "Wallet transfer receipt and account data must clear on session changes and logout");
assert(app.includes("useEffect(()=>{if(!session)return;const expiresAt=") && app.includes("window.setTimeout(()=>clear()"), "Wallet must clear transfer state when the session expires");
assert(app.includes("const isCurrent=()=>walletTransferSessionScope(session,walletRuntime.environment)===scope"), "Wallet transfer completions must re-check session expiry before every write");
assert(app.includes("catch{if(isCurrent())setWalletError(describeWalletTransfer())}"), "Wallet transfer errors must remain Provider, trace, and internal-detail neutral");
assert(apiClient.includes("walletTransactionPath(selectedAsset,cursor)"), "Wallet must consume bounded public customer Wallet history");
assert(apiClient.includes("walletTransactionDetail:async"), "Wallet must consume the public selected transaction detail endpoint");
assert(apiClient.includes("walletOperations:async") && apiClient.includes("parseWalletOperationPage(await request<unknown>(walletOperationActivityPath(cursor)))"), "Wallet must consume typed all-account operation activity");
assert(apiClient.includes("walletOperationDetail:async") && apiClient.includes("parseWalletOperationDetail(await request<unknown>(walletOperationDetailPath(selected.id)),selected)"), "Wallet must consume typed selected operation detail");
assert(apiClient.includes("createVirtualCard:async") && apiClient.includes("virtualCardCreateDecision(sessionEnvironment,walletRuntime.environment)"), "Virtual Card creation must fail closed against both session and runtime environment");
assert(apiClient.includes("request<unknown>(virtualCardCreatePath(),'POST',normalized,validateVirtualCardIdempotencyKey(idempotencyKey))"), "Virtual Card creation must make one typed request with the caller-owned idempotency key");
assert(virtualCardCreate.includes('sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST"'), "Virtual Card creation must be limited to SANDBOX and TEST");
assert(virtualCardCreate.includes("parseVirtualCardCreateInput"), "Virtual Card request must use an exact public input parser");
assert(virtualCardCreate.includes("parseVirtualCardCreateResponse"), "Virtual Card response must use an exact public Card parser");
assert(virtualCardCreate.includes("virtualCardCreateRequestIsCurrent"), "Virtual Card creation must be isolated by session scope and generation");
assert(apiClient.includes("replaceCard:async") && apiClient.includes("cardReplacementDecision(card,sessionEnvironment,walletRuntime.environment"), "Card replacement must fail closed against capability, selection, session and runtime environment");
assert(apiClient.includes("request<unknown>(cardReplacementPath(card.id),'POST',normalized,validateCardReplacementIdempotencyKey(idempotencyKey))"), "Card replacement must make one typed request with the caller-owned idempotency key");
assert(cardReplacement.includes('sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST"'), "Card replacement must be limited to SANDBOX and TEST");
assert(cardReplacement.includes("card.capabilities.replace"), "Card replacement must require the Backend replace capability");
assert(cardReplacement.includes('Object.getPrototypeOf(value) !== Object.prototype'), "Card replacement response must accept only ordinary JSON objects");
assert(cardReplacement.includes("Object.getOwnPropertyDescriptor"), "Card replacement response must read only own data descriptors");
assert(cardReplacement.includes("Card replacement did not return a distinct Card identity"), "Card replacement must require a new Card identity");
assert(cardReplacement.includes("cardReplacementRequestIsCurrent"), "Card replacement must bind scope, selected old Card and request generation");
assert(cardReplacement.includes("hasAvailableBalanceMinor") && cardReplacement.includes('hasOwnProperty.call(card, "availableBalanceMinor")'), "Card replacement must version optional balance presence and value");
assert(cardReplacement.includes("request.reason === currentReason") && cardReplacement.includes("cardReplacementVersionMatches(request.oldCardVersion, currentOldCard)"), "Card replacement must bind reason and every selected old Card version field");
assert(cardReplacement.includes("replaceCardInCollection") && cardReplacement.includes("collides with an existing Card"), "Card replacement must atomically replace the old Card and reject identity collisions");
assert(walletOperations.includes("/v1/wallet/operations?"), "Wallet activity must use the public operation history contract");
assert(walletOperations.includes("new URLSearchParams({ limit:"), "Wallet activity requests must remain bounded");
assert(!walletOperations.includes("new URLSearchParams({ assetCode"), "Wallet activity must not invent an asset filter");
assert(walletOperations.includes("parseWalletOperationPage"), "Wallet activity must reconstruct the public response allowlist");
assert(walletOperations.includes("walletOperationActivityRequestIsCurrent"), "Wallet activity must be isolated by session scope, cursor and request generation");
assert(walletOperations.includes("parseWalletOperationDetail"), "Wallet operation detail must reconstruct the public response allowlist and bind immutable summary fields");
assert(walletOperations.includes("walletOperationDetailPath"), "Wallet operation detail must use its own validated public path helper");
assert(walletOperations.includes("walletOperationDetailRequestIsCurrent"), "Wallet operation detail must be isolated by session scope, selection and request generation");
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
assert(app.includes("No unvalidated or cross-card balance displayed"), "Card balance UI must fail closed for stale or invalid responses");
assert(app.includes("Card balance unavailable for this session"), "Card balance errors must use one safe public message");
assert(app.includes("No unvalidated or cross-card limits displayed"), "Card limits UI must fail closed for stale or invalid responses");
assert(app.includes("Card limits · read only"), "Card limits UI must remain explicitly read only");
assert(app.includes("Transaction detail unavailable for this session"), "Wallet detail errors must use one safe public message");
assert(app.includes("Selected transaction"), "Wallet UI must expose the validated selected transaction detail");
assert(app.includes("All-account Wallet activity · read only"), "Wallet activity UI must remain explicitly read only");
assert(app.includes("No unvalidated or cross-session activity displayed"), "Wallet activity UI must fail closed for stale or invalid responses");
assert(app.includes("Selected operation · read only"), "Wallet operation detail UI must remain explicitly read only");
assert(app.includes("Wallet operation detail unavailable for this session"), "Wallet operation detail errors must use one safe public message");
assert(app.includes("clearWalletOperationDetail();const request={requestId:++walletOperationRequestSequence.current"), "Wallet pagination must synchronously clear selected operation detail");
assert(app.includes("virtualCardDecision.allowed&&<form"), "Virtual Card creation UI must be hidden unless the environment decision allows it");
assert(app.includes("const idempotencyKey=crypto.randomUUID();try{const created=await walletApi.createVirtualCard(input,idempotencyKey"), "Each Virtual Card submission must generate and reuse exactly one idempotency key");
assert(app.includes("Automatic retries are disabled"), "Virtual Card UI must state the no-retry boundary");
assert(app.includes("No Provider or internal error details displayed"), "Virtual Card errors must remain provider-neutral");
assert(app.includes("replacementDecision?.allowed&&<form"), "Card replacement UI must be hidden unless capability, environment, scope and selection allow it");
assert(app.includes("if(!session||!selectedCard||cardReplacementInFlight.current||virtualCardCreateInFlight.current||cardRenewalInFlight.current)return"), "Card replacement must synchronously block duplicate or conflicting submissions");
assert(app.includes("reason:input.reason,oldCardVersion:captureCardReplacementVersion(oldCard)") && app.includes("cardReplacementReasonRef.current,selectedCardRef.current"), "Card replacement completion must use reason and selected Card version refs");
assert(app.includes("replaceCardInCollection(knownCards,oldCard.id,replacement)") && app.includes("card.id!==oldCard.id&&card.id!==replacement.id"), "Card replacement UI must commit one collision-checked atomic replacement");
assert(app.includes("const idempotencyKey=crypto.randomUUID();try{const replacement=await walletApi.replaceCard"), "Each Card replacement submission must generate and reuse exactly one idempotency key");
assert(app.includes("One user submission, one canonical UUIDv4 idempotency key. Automatic retries are disabled."), "Card replacement UI must state the canonical UUIDv4 and no-retry boundary");
assert(app.includes("Card replacement unavailable for this session · Trace"), "Card replacement errors must remain Provider and internal-detail neutral");
assert(apiClient.includes("renewCard:async") && apiClient.includes("cardRenewalDecision(card,sessionEnvironment,walletRuntime.environment"), "Card renewal must fail closed against capability, selection, session and runtime environment");
assert(apiClient.includes("request<unknown>(cardRenewalPath(card.id),'POST',undefined,validateCardRenewalIdempotencyKey(idempotencyKey))"), "Card renewal must make one typed request with the caller-owned idempotency key");
assert(cardRenewal.includes('sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST"'), "Card renewal must be limited to SANDBOX and TEST");
assert(cardRenewal.includes("card.capabilities.renew"), "Card renewal must require the Backend renew capability");
assert(cardRenewal.includes("Number.isInteger(card.expiryMonth)") && cardRenewal.includes("Number.isInteger(card.expiryYear)"), "Card renewal must strictly validate the current expiry version");
assert(cardRenewal.includes('Object.getPrototypeOf(value) !== Object.prototype'), "Card renewal response must accept only ordinary JSON objects");
assert(cardRenewal.includes("Object.getOwnPropertyDescriptor"), "Card renewal response must read only own data descriptors");
assert(cardRenewal.includes("id !== expectedCardId"), "Card renewal must require the same selected Card identity");
assert(cardRenewal.includes("renewedExpiry <= currentExpiry"), "Card renewal must require expiry year and month to advance strictly");
assert(cardRenewal.includes("cardRenewalRequestIsCurrent"), "Card renewal must bind scope, selected Card and request generation");
assert(cardRenewal.includes("request.expiryMonth === currentCard.expiryMonth") && cardRenewal.includes("request.expiryYear === currentCard.expiryYear"), "Card renewal must reject stale same-ID Card versions");
assert(app.includes("renewalDecision?.allowed&&<form"), "Card renewal UI must be hidden unless capability, environment, scope and selection allow it");
assert(app.includes("if(!session||!selectedCard||cardRenewalInFlight.current||virtualCardCreateInFlight.current||cardReplacementInFlight.current)return"), "Card renewal must synchronously block duplicate or conflicting submissions");
assert(app.includes("expiryMonth:card.expiryMonth as number,expiryYear:card.expiryYear as number") && app.includes("selectedCardRef.current"), "Card renewal must capture and compare the selected Card expiry version");
assert(app.includes("const idempotencyKey=crypto.randomUUID();try{const renewed=await walletApi.renewCard"), "Each Card renewal submission must generate and reuse exactly one idempotency key");
assert(app.includes("One user submission, one canonical UUIDv4 idempotency key. Automatic retries are disabled."), "Card renewal UI must state its canonical UUIDv4 and no-retry boundary");
assert(app.includes("Card renewal unavailable for this session · Trace"), "Card renewal errors must remain Provider and internal-detail neutral");

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
