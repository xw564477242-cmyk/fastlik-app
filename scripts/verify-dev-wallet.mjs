import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const apiClient = readFileSync(join(root, "src/apiClient.ts"), "utf8");
const app = readFileSync(join(root, "src/App.tsx"), "utf8");
const sessionLifecycle = readFileSync(join(root, "src/sessionLifecycle.ts"), "utf8");
const cardDetailRefresh = readFileSync(join(root, "src/cardDetailRefresh.ts"), "utf8");
const cardTransactions = readFileSync(join(root, "src/cardTransactions.ts"), "utf8");
const cardTransactionHistory = readFileSync(join(root, "src/cardTransactionHistory.ts"), "utf8");
const cardTransactionRefresh = readFileSync(join(root, "src/cardTransactionRefresh.ts"), "utf8");
const cardTransactionDetail = readFileSync(join(root, "src/cardTransactionDetail.ts"), "utf8");
const cardTransactionDetailRefresh = readFileSync(join(root, "src/cardTransactionDetailRefresh.ts"), "utf8");
const cardBalance = readFileSync(join(root, "src/cardBalance.ts"), "utf8");
const cardLimits = readFileSync(join(root, "src/cardLimits.ts"), "utf8");
const cardLimitsUpdate = readFileSync(join(root, "src/cardLimitsUpdate.ts"), "utf8");
const cardStatusAction = readFileSync(join(root, "src/cardStatusAction.ts"), "utf8");
const walletData = readFileSync(join(root, "src/walletData.ts"), "utf8");
const walletTransfer = readFileSync(join(root, "src/walletTransfer.ts"), "utf8");
const walletTransactions = readFileSync(join(root, "src/walletTransactions.ts"), "utf8");
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
assert(apiClient.includes("sessionFailureRequiresClear(error)") && apiClient.includes("fastlink:session-invalid"), "Only explicit authentication failures may broadcast global session invalidation");
assert(sessionLifecycle.includes("error?.status === 401") && sessionLifecycle.includes("SESSION_INVALIDATION_MESSAGE"), "Session invalidation must remain restricted to explicit authentication failure evidence");
assert(app.includes("setSession(current)") && app.includes("runSessionInitializationModule"), "A validated session must be committed before independent business initialization modules settle");
assert(app.includes("sessionInitializationRequestIsCurrent") && app.includes("sessionInitializationSequence.current+=1"), "Late initialization work must be generation and scope bound");
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
assert(apiClient.includes("parseCardBalance(await request<unknown>(cardBalancePath(id),'GET',undefined,undefined,'json',signal),id)"), "Card balance must be reconstructed from the public typed contract with active cancellation");
assert(!apiClient.includes("balance:(id:string)=>request<Record<string,unknown>>"), "Card balance must not expose a raw response record");
assert(cardBalance.includes("CardBalanceRecord"), "Card balance must expose a strict typed record");
assert(cardBalance.includes("parseCardBalance"), "Card balance must use a public allowlist parser");
assert(cardBalance.includes("cardBalanceRequestIsCurrent"), "Card balance must be isolated by scope, selected card and generation");
assert(apiClient.includes("parseCardLimits(await request<unknown>(cardLimitsPath(id),'GET',undefined,undefined,'json',signal),id)"), "Card limits must be reconstructed from the public typed contract with active cancellation");
assert(cardLimits.includes("CardLimitsRecord"), "Card limits must expose a strict typed record");
assert(cardLimits.includes("parseCardLimits"), "Card limits must use a public allowlist parser");
assert(cardLimits.includes("cardLimitsRequestIsCurrent"), "Card limits must be isolated by scope, selected card and generation");
assert(cardLimitsUpdate.includes("CARD_LIMIT_UPDATE_MAX_MINOR = 9_000_000_000_000") && cardLimitsUpdate.includes("Number.isSafeInteger"), "Card limits mutation must retain the Backend ceiling and safe integer contract");
assert(cardLimitsUpdate.includes("Single transaction limit cannot exceed daily spend limit") && cardLimitsUpdate.includes("Daily spend limit cannot exceed monthly spend limit"), "Card limits mutation must retain the Backend relationship rules");
assert(cardLimitsUpdate.includes('sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST"') && cardLimitsUpdate.includes("card.capabilities.updateLimits"), "Card limits mutation must remain capability-gated to matching SANDBOX/TEST");
assert(cardLimitsUpdate.includes("beginCardLimitsUpdate") && cardLimitsUpdate.includes("gate.activeRequestId !== null"), "Card limits mutation must synchronously reject double submit");
assert(cardLimitsUpdate.includes("cardLimitsUpdateRequestIsCurrent") && cardLimitsUpdate.includes("limitsKey(currentLimits) !== request.limitsKey"), "Card limits mutation must bind session, Card, limits, input and generation");
assert(apiClient.includes("submitCardLimitsUpdate(cardLimitsUpdateTransport") && apiClient.includes("cardLimitsUpdateTransport=({path,method,body,idempotencyKey}"), "Card limits mutation must use one typed POST transport");
assert(cardStatusAction.includes('runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST"') && cardStatusAction.includes("session.expiresAt"), "Card status mutation must require an unexpired matching SANDBOX/TEST session");
assert(cardStatusAction.includes("card.capabilities.freeze") && cardStatusAction.includes("card.capabilities.unfreeze"), "Card status mutation must require the exact current status capability");
assert(cardStatusAction.includes("cardVersionKey") && cardStatusAction.includes('hasOwnProperty.call(card, "availableBalanceMinor")'), "Card status completion must bind the complete public Card version");
assert(cardStatusAction.includes("beginCardStatusAction") && cardStatusAction.includes("gate.activeRequestId !== null"), "Card status mutation must synchronously reject double click");
assert(cardStatusAction.includes("cardStatusRequestIsCurrent") && cardStatusAction.includes("cardStatusSessionScope(currentSession, runtimeEnvironment, now)"), "Card status completion must revalidate generation, session, scope, selection, and Card version");
assert(cardStatusAction.includes("Object.getOwnPropertyDescriptor") && cardStatusAction.includes("parseCardStatusResponse"), "Card status response must reconstruct only safe public own-data fields");
assert(cardStatusAction.includes("method: \"POST\"") && !cardStatusAction.includes("body:"), "Card freeze and unfreeze transport must be a bodyless POST");
assert(apiClient.includes("submitCardStatusAction(cardStatusTransport") && apiClient.includes("cardStatusTransport=({path,method,idempotencyKey}"), "Card status mutation must use one typed bodyless POST transport");
assert(app.includes("createCardStatusRequestIdentity(requestId,decision.scopeKey,decision.operation,card,crypto.randomUUID())"), "Every Card status click must create a caller-owned UUIDv4 after gating");
assert(app.includes("cardStatusInFlight.current") && app.includes("cardStatusSubmitGate.current.activeRequestId=null"), "Card status mutation must synchronously block duplicate submits and clear its gate on invalidation");
assert(app.includes("walletRequestMounted.current&&") && app.includes("cardStatusRequestIsCurrent(request,cardActionRequestSequence.current"), "Card status mutation must make late unmounted or stale completions write nothing");
assert(app.includes("Manual SANDBOX/TEST action · one bodyless POST per click · no automatic retries."), "Card status UI must state its manual non-production no-retry boundary");
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
assert(apiClient.includes("readWalletTransactionHistory(walletTransactionTransport,session,walletRuntime.environment,filters,previous,signal)"), "Wallet must consume bounded session-gated customer Wallet history with caller cancellation");
assert(apiClient.includes("walletTransactionDetail:async"), "Wallet must consume the public selected transaction detail endpoint");
assert(apiClient.includes("walletTransactionTransport=({path,method,signal}") && apiClient.includes("externalSignal?.addEventListener('abort',cancel,{once:true})"), "Wallet transaction fetches must compose timeout and caller cancellation signals");
assert(apiClient.includes("walletOperations:async") && apiClient.includes("readWalletOperationActivity(walletOperationTransport,session,walletRuntime.environment,scopeKey,filters,cursor,signal)"), "Wallet must consume typed, session-gated and caller-cancelled all-account operation activity");
assert(apiClient.includes("walletOperationDetail:async") && apiClient.includes("readWalletOperationDetail(walletOperationTransport,session,walletRuntime.environment,scopeKey,selected,signal)"), "Wallet must consume typed, session-gated and caller-cancelled selected operation detail");
assert(apiClient.includes("createVirtualCard:async") && apiClient.includes("virtualCardCreateDecision(sessionEnvironment,walletRuntime.environment)"), "Virtual Card creation must fail closed against both session and runtime environment");
assert(apiClient.includes("request<unknown>(virtualCardCreatePath(),'POST',normalized,validateVirtualCardIdempotencyKey(idempotencyKey))"), "Virtual Card creation must make one typed request with the caller-owned idempotency key");
assert(virtualCardCreate.includes('sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST"'), "Virtual Card creation must be limited to SANDBOX and TEST");
assert(virtualCardCreate.includes("parseVirtualCardCreateInput"), "Virtual Card request must use an exact public input parser");
assert(virtualCardCreate.includes("parseVirtualCardCreateResponse"), "Virtual Card response must use an exact public Card parser");
assert(virtualCardCreate.includes("virtualCardCreateRequestIsCurrent"), "Virtual Card creation must be isolated by session scope and generation");
assert(apiClient.includes("submitCardReplacement(cardReplacementTransport,session,walletRuntime.environment"), "Card replacement must fail closed through the typed session-gated consumer");
assert(apiClient.includes("cardReplacementTransport=({path,method,body,idempotencyKey}"), "Card replacement must make one typed POST with the caller-owned idempotency key");
assert(cardReplacement.includes('runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST"') && cardReplacement.includes("session.expiresAt"), "Card replacement must require an unexpired matching SANDBOX or TEST session");
assert(cardReplacement.includes("card.capabilities.replace"), "Card replacement must require the Backend replace capability");
assert(cardReplacement.includes('Object.getPrototypeOf(value) !== Object.prototype'), "Card replacement response must accept only ordinary JSON objects");
assert(cardReplacement.includes("Object.getOwnPropertyDescriptor"), "Card replacement response must read only own data descriptors");
assert(cardReplacement.includes("Card replacement did not return a distinct Card identity"), "Card replacement must require a new Card identity");
assert(cardReplacement.includes("cardReplacementRequestIsCurrent"), "Card replacement must bind scope, selected old Card and request generation");
assert(cardReplacement.includes("hasAvailableBalanceMinor") && cardReplacement.includes('hasOwnProperty.call(card, "availableBalanceMinor")'), "Card replacement must version optional balance presence and value");
assert(cardReplacement.includes("request.reason !== currentReason") && cardReplacement.includes("cardReplacementVersionMatches(request.oldCardVersion, currentOldCard)"), "Card replacement must bind reason and every selected old Card version field");
assert(cardReplacement.includes("beginCardReplacement") && cardReplacement.includes("gate.activeRequestId !== null"), "Card replacement must synchronously reject double click");
assert(cardReplacement.includes("createCardReplacementCommit") && cardReplacement.includes("collides with an existing Card"), "Card replacement must atomically replace the old Card and reject identity collisions");
assert(walletOperations.includes("/v1/wallet/operations?"), "Wallet activity must use the public operation history contract");
assert(walletOperations.includes('query.set("limit", String(WALLET_OPERATION_PAGE_SIZE))'), "Wallet activity requests must remain bounded");
assert(!walletOperations.includes("new URLSearchParams({ assetCode"), "Wallet activity must not invent an asset filter");
assert(walletOperations.includes("WALLET_OPERATION_TYPES") && walletOperations.includes("WALLET_OPERATION_STATUSES"), "Wallet activity must use only the Backend canonical type and status filters");
assert(walletOperations.includes("exactDataRecord(value, operationFields") && walletOperations.includes("exactDataRecord(value, pageFields"), "Wallet activity must reject non-public list and item DTO fields");
assert(walletOperations.includes("readWalletOperationActivity") && walletOperations.includes('method: "GET"'), "Wallet activity and detail must remain caller-cancelled GET-only reads");
assert(walletOperations.includes("parseWalletOperationPage"), "Wallet activity must reconstruct the public response allowlist");
assert(walletOperations.includes("walletOperationActivityRequestIsCurrent"), "Wallet activity must be isolated by session scope, cursor and request generation");
assert(walletOperations.includes("parseWalletOperationDetail"), "Wallet operation detail must reconstruct the public response allowlist and bind immutable summary fields");
assert(walletOperations.includes("walletOperationDetailPath"), "Wallet operation detail must use its own validated public path helper");
assert(walletOperations.includes("walletOperationDetailRequestIsCurrent"), "Wallet operation detail must be isolated by session scope, selection and request generation");
assert(walletTransactions.includes("walletTransactionDetailPath"), "Wallet detail must use a validated public transaction path");
assert(walletTransactions.includes("parseWalletTransactionDetailRaw"), "Wallet detail must be reconstructed from the exact bounded public transaction allowlist");
assert(walletData.includes("walletRequestIsCurrent"), "Wallet responses must be isolated by scope, account and request generation");
assert(walletTransactions.includes("walletTransactionHistoryRequestIsCurrent"), "Wallet history must be isolated by session scope, filters, opaque cursor and request generation");
assert(walletTransactions.includes("throwIfWalletTransactionRequestAborted(signal)") && walletTransactions.includes("walletTransactionRequestWasAborted"), "Wallet history and detail must fail closed before committing an aborted response");
assert(walletData.includes("walletTransactionDetailRequestIsCurrent"), "Wallet detail must be isolated by scope, asset, transaction and request generation");
assert(walletTransactions.includes("createWalletTransactionDetailRequestIdentity") && walletTransactions.includes("request.accountId !== currentAccountId") && walletTransactions.includes("request.filterKey === currentHistory?.filterKey"), "Wallet detail refresh must bind generation, scope, account, filter and exact transaction version");
assert(walletTransactions.includes("walletTransactionDetailRefreshAllowed") && walletTransactions.includes("history.items.some(item => walletTransactionRecordKey(item) === selectedKey)"), "Wallet detail refresh must allow only the exact selected item in the current filtered public history");
assert(walletTransactions.includes('WALLET_TRANSACTION_PATH = "/v1/wallet/transactions"'), "Wallet history must use the public customer contract");
assert(walletTransactions.includes("WALLET_TRANSACTION_MAX_JSON_BYTES = 131_072"), "Wallet history raw JSON must remain bounded");
assert(walletTransactions.includes("exactDataRecord(value, transactionFields") && walletTransactions.includes("exactDataRecord(boundedRawJson(raw), pageFields"), "Wallet history must reject every non-public response field");
assert(walletTransactions.includes("rejectDuplicateJsonObjectKeys(raw)"), "Wallet history must reject duplicate and escaped-equivalent JSON keys before parsing");
assert(walletTransactions.includes("walletTransactionSessionScope(session, runtimeEnvironment)"), "Wallet history must require a matching unexpired SANDBOX or TEST session");
assert(walletTransactions.includes("Duplicate Wallet transaction id across pages") && walletTransactions.includes("cursor loop or rollback") && walletTransactions.includes("pages are not strictly monotonic"), "Wallet history pagination must fail closed on duplicate IDs, cursor regression, and ordering regression");
assert(walletTransactions.includes("\\.\\d{0,17}[1-9]") && walletTransactions.includes("finalAlphabetIndex % 16") && walletTransactions.includes("finalAlphabetIndex % 4"), "Wallet history amounts and opaque cursors must use unique canonical representations");
assert(app.includes("walletHistoryInFlight.current=false") && app.includes("replaceWalletTransactions(null)"), "Wallet identity and filter changes must synchronously clear Wallet history state");
assert(app.includes("walletHistoryAbortController.current?.abort()") && app.includes("walletTransactionDetailAbortController.current?.abort()"), "Wallet history and detail invalidation must actively cancel transport");
assert(app.includes("walletRequestMounted.current=false") && app.includes("walletHistoryRequestSequence.current+=1;walletTransactionDetailRequestSequence.current+=1"), "Wallet unmount must invalidate and cancel every Wallet transaction request");
assert(app.includes("walletApi.walletTransactions(activeSession,filters,null,historyController.signal)") && app.includes("walletApi.walletTransactions(session,filters,previous,historyController.signal)"), "Wallet list and next-page requests must carry their active cancellation signal");
assert(app.includes("walletApi.walletTransactionDetail(activeSession,transaction,detailController.signal)"), "Wallet detail requests must carry their active cancellation signal");
assert(
  apiClient.includes("card:async(id:string,signal?:AbortSignal)") &&
    apiClient.includes("balance:async(id:string,signal?:AbortSignal)") &&
    apiClient.includes("limits:async(id:string,signal?:AbortSignal)") &&
    apiClient.includes("transactions:async(id:string,query:CardTransactionQuery,signal?:AbortSignal)") &&
    apiClient.includes("request<unknown>(cardTransactionPath(id,query),'GET',undefined,undefined,'json',signal)"),
  "Every Card detail GET must accept an active AbortSignal",
);
assert(
  app.includes("walletApi.transactions(id,{filter:transactionFilter},signal)") &&
    app.includes("walletApi.transactions(cardId,{filter,cursor},controller.signal)"),
  "Card transaction first-page and pagination GETs must carry the active filter, cursor and AbortSignal",
);
assert(
  cardTransactions.includes('if (filter !== "ALL") params.set("status", filter)') &&
    cardTransactions.includes('if (nextCursor) params.set("cursor", nextCursor)') &&
    cardTransactionHistory.includes("request.filter === currentFilter") &&
    cardTransactionHistory.includes("request.cursor === currentCursor"),
  "Card transaction requests must remain bound to the active status filter and opaque cursor",
);
assert(
  app.includes("refreshCardTransactions=async") &&
    app.includes("walletApi.transactions(card.id,{filter},controller.signal)") &&
    app.includes("cardTransactionAbortController.current===controller&&walletTransferSessionScope(activeSession,walletRuntime.environment)===scope&&card.id===cardDetailTarget.current") &&
    app.includes("commitCardTransactionRefreshPage(request,page)") &&
    app.includes("replaceCardTransactionHistory(refreshed)"),
  "Manual Card transaction refresh must issue one filter-bound cancellable GET, revalidate live session expiry, and atomically replace the first page",
);
assert(
    cardTransactionRefresh.includes("CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS = 3") &&
    cardTransactionRefresh.includes('sessionEnvironment === "SANDBOX" || sessionEnvironment === "TEST"') &&
    cardTransactionRefresh.includes("request.snapshot === currentHistory") &&
    cardTransactionDetail.includes("transaction.currency !== selection.transaction.currency") &&
    cardTransactionDetail.includes("transaction.occurredAt !== selection.transaction.occurredAt") &&
    app.includes("Keeping the last verified snapshot until completion") &&
    app.includes("no automatic retries"),
  "Card transaction refresh must retain the same-filter snapshot and expose only bounded manual SANDBOX/TEST retries",
);
assert(
  cardTransactionDetailRefresh.includes('method: "GET"') &&
    cardTransactionDetailRefresh.includes("CARD_TRANSACTION_PUBLIC_FIELDS") &&
    cardTransactionDetailRefresh.includes("Reflect.ownKeys(value)") &&
    cardTransactionDetailRefresh.includes("parsed.id !== requested.id"),
  "Card transaction detail refresh must use one GET and reconstruct exactly the 13-field public DTO for the requested ID",
);
assert(
  cardTransactionDetailRefresh.includes("request.listSnapshot === currentHistory") &&
    cardTransactionDetailRefresh.includes("request.transactionId === currentTransactionId") &&
    cardTransactionDetailRefresh.includes("walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey"),
  "Card transaction detail completion must bind the exact list snapshot, selection and live unexpired actor scope",
);
assert(
  apiClient.includes("readCardTransactionDetailRefresh(cardTransactionDetailTransport,session,walletRuntime.environment,scopeKey,cardId,selected,signal)") &&
    app.includes("refreshSelectedCardTransactionDetail=async") &&
    app.includes("walletApi.cardTransactionDetail(activeSession,card.id,listRow,scope,controller.signal)") &&
    app.includes("cardTransactionDetailAbortController.current===controller") &&
    app.includes("one GET per click · no automatic retries") &&
    app.match(/walletApi\.cardTransactionDetail\(/g)?.length === 1,
  "App must expose one manual selected Card transaction detail GET with cancellation, no retries and no automatic call site",
);
assert(
  cardDetailRefresh.includes("readers.card(selectedCardId, signal)") &&
    cardDetailRefresh.includes("readers.balance(selectedCardId, signal)") &&
    cardDetailRefresh.includes("readers.limits(selectedCardId, signal)") &&
    cardDetailRefresh.includes("readers.transactions(selectedCardId, signal)"),
  "One shared active AbortSignal must reach all four atomic Card detail readers",
);
assert(
  app.includes("cardDetailAbortController.current===detailController") &&
    app.includes("},card.id,detailController.signal)"),
  "Card detail completion must remain bound to the active cancellation domain",
);
assert(app.includes("refreshSelectedWalletTransaction") && app.includes("Manual only · one GET per click · no automatic retries."), "Wallet selected transaction detail must expose an explicit one-GET manual refresh with no retries");
assert(app.includes("resetWalletTransactionDetailRequest();const request=createWalletTransactionDetailRequestIdentity") && app.includes("walletTransactionDetailAbortController.current===detailController"), "Each detail refresh must cancel its predecessor before creating one newly bound request");
assert(app.includes("selectedWalletTransactionRef.current") && app.includes("walletTransactionDetailRequestIsCurrent(request,walletTransactionDetailRequestSequence.current,walletScope.current,currentAccount.id,currentFilters,walletTransactionsRef.current,selectedWalletTransactionRef.current)"), "Wallet detail refresh must reject stale session, account, filter, selection and generation completions");
assert(app.includes("!walletTransactionRequestWasAborted") && !app.includes("describe(value instanceof DOMException"), "Wallet cancellation must never reflect upstream abort data");
assert(app.includes("Wallet transaction type filter") && app.includes("Wallet transaction status filter") && app.includes("WALLET_TRANSACTION_TYPES.map") && app.includes("WALLET_TRANSACTION_STATUSES.map"), "Wallet history UI filters must be closed selects sourced from the public allowlists");
assert(walletTransactions.includes("walletTransactionFiltersForSelectedAsset") && walletTransactions.includes("limit: WALLET_TRANSACTION_PAGE_SIZE"), "Wallet UI filters must bind the selected asset and fixed page limit through typed helpers");
assert(app.includes("if(selection.type===walletTransactionTypeFilterTarget.current&&selection.status===walletTransactionStatusFilterTarget.current)return"), "Wallet filter duplicate events must be synchronously gated");
assert(app.includes("walletTransactionFilterRequestAllowed(account,accountsRef.current,selectedAccountRef.current,scope,walletScope.current)") && walletTransactions.includes("ownedAccounts.some(row => row.id === account.id && row.assetCode === account.assetCode)"), "Wallet filter changes must reject unowned accounts and cross-scope requests");
assert(app.includes("clearWalletTransactions();") && app.includes("void loadWalletTransactionHistory(account,scope,activeSession,selection)"), "Wallet filter changes must synchronously clear cursor, selection, errors and stale requests before one new history load");
assert(walletTransactions.includes("exactDataRecord(") && walletTransactions.includes("filterSelectionFields"), "Wallet filter controls must reject internal and unknown fields without reflection");
assert(!walletData.includes("/v1/wallet/accounts/${encodeURIComponent(accountId)}/transactions"), "Legacy account history must remain removed");
assert(walletData.includes("walletTransferStatusRequestIsCurrent"), "Transfer status must be isolated by scope, source account, operation and request generation");
assert(walletData.includes("WALLET_TRANSFER_STATUS_REFRESH_LIMIT = 5"), "Transfer status refresh must remain bounded");
assert(app.includes("No unvalidated or cross-account response displayed"), "Wallet UI must fail closed for stale or invalid responses");
assert(app.includes("No unvalidated or cross-card balance displayed"), "Card balance UI must fail closed for stale or invalid responses");
assert(app.includes("Card balance unavailable for this session"), "Card balance errors must use one safe public message");
assert(app.includes("No unvalidated or cross-card limits displayed"), "Card limits UI must fail closed for stale or invalid responses");
assert(app.includes("Card limits · public contract") && app.includes("Update selected Card limits"), "Card limits UI must expose only the gated public update contract");
assert(app.includes("submitSelectedCardLimits") && app.includes("Apply limits once") && app.includes("at most one POST, no automatic retries"), "Card limits UI must expose one manual no-retry submission");
assert(app.includes("cardLimitsUpdateSubmitGate.current.activeRequestId=null") && app.includes("cardLimitsUpdateRequestSequence.current+=1"), "Card limits update invalidation and unmount must make late completions stale");
assert(app.includes("Transaction detail unavailable for this session"), "Wallet detail errors must use one safe public message");
assert(app.includes("Selected transaction"), "Wallet UI must expose the validated selected transaction detail");
assert(app.includes("All-account Wallet activity · read only"), "Wallet activity UI must remain explicitly read only");
assert(app.includes("No unvalidated or cross-session activity displayed"), "Wallet activity UI must fail closed for stale or invalid responses");
assert(app.includes("Selected operation · read only"), "Wallet operation detail UI must remain explicitly read only");
assert(app.includes("Wallet operation detail unavailable for this session"), "Wallet operation detail errors must use one safe public message");
assert(app.includes("clearWalletOperationDetail();const controller=new AbortController()") && app.includes("appendWalletOperationPage(snapshot,page,cursor)"), "Wallet pagination must synchronously clear selected operation detail and commit only the exact current cursor page");
assert(app.includes("walletOperationAbortController.current?.abort()") && app.includes("walletOperationDetailAbortController.current?.abort()"), "Wallet operation list and detail invalidation must actively cancel transport");
assert(app.includes("walletTransferSessionScope(activeSession,walletRuntime.environment)===expectedScope") && app.includes("walletOperationFilterKey({type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current})"), "Wallet operation completion must bind unexpired actor/session/tenant/customer/environment and filter scope");
assert(app.includes("Refresh activity") && app.includes("wallet-operation-filters"), "Wallet activity must expose one manual refresh and closed type/status controls");
assert(app.includes("virtualCardDecision.allowed&&<form"), "Virtual Card creation UI must be hidden unless the environment decision allows it");
assert(app.includes("const idempotencyKey=crypto.randomUUID();try{const created=await walletApi.createVirtualCard(input,idempotencyKey"), "Each Virtual Card submission must generate and reuse exactly one idempotency key");
assert(app.includes("Automatic retries are disabled"), "Virtual Card UI must state the no-retry boundary");
assert(app.includes("No Provider or internal error details displayed"), "Virtual Card errors must remain provider-neutral");
assert(app.includes("replacementDecision?.allowed&&<form"), "Card replacement UI must be hidden unless capability, environment, scope and selection allow it");
assert(app.includes("beginCardReplacement(cardReplacementSubmitGate.current,requestId)"), "Card replacement must synchronously block duplicate submissions");
assert(app.includes("createCardReplacementRequestIdentity(requestId,decision.scopeKey,input.reason,oldCard,crypto.randomUUID())"), "Each accepted Card replacement submission must generate one fresh UUIDv4");
assert(app.includes("cardReplacementReasonRef.current,selectedCardRef.current") && app.includes("walletRequestMounted.current&&"), "Card replacement completion must bind reason, selection, session and mounted state");
assert(app.includes("createCardReplacementCommit(cardsRef.current,selectedCardRef.current,request.oldCardVersion,replacement)"), "Card replacement UI must commit one collision-checked atomic list and selection update");
assert(app.includes("Manual SANDBOX/TEST only · one canonical UUIDv4 Idempotency-Key · at most one POST · no automatic retries."), "Card replacement UI must state the non-production one-POST no-retry boundary");
assert(app.includes("Card replacement unavailable for this session · Trace"), "Card replacement errors must remain Provider and internal-detail neutral");
assert(apiClient.includes("submitCardRenewal(cardRenewalTransport,session,walletRuntime.environment"), "Card renewal must fail closed through the typed session-gated consumer");
assert(apiClient.includes("cardRenewalTransport=({path,method,idempotencyKey}") && apiClient.includes("request<unknown>(path,method,undefined,idempotencyKey)"), "Card renewal must make one typed bodyless POST with the caller-owned idempotency key");
assert(cardRenewal.includes('runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST"') && cardRenewal.includes("session.expiresAt"), "Card renewal must require an unexpired matching SANDBOX or TEST session");
assert(cardRenewal.includes("card.capabilities.renew"), "Card renewal must require the Backend renew capability");
assert(cardRenewal.includes("Number.isInteger(card.expiryMonth)") && cardRenewal.includes("Number.isInteger(card.expiryYear)"), "Card renewal must strictly validate the current expiry version");
assert(cardRenewal.includes('Object.getPrototypeOf(value) !== Object.prototype'), "Card renewal response must accept only ordinary JSON objects");
assert(cardRenewal.includes("Object.getOwnPropertyDescriptor"), "Card renewal response must read only own data descriptors");
assert(cardRenewal.includes("id !== expectedCardId"), "Card renewal must require the same selected Card identity");
assert(cardRenewal.includes("renewedExpiry <= currentExpiry"), "Card renewal must require expiry year and month to advance strictly");
assert(cardRenewal.includes("renewed.createdAt !== currentCard.createdAt") && cardRenewal.includes("changed immutable public Card fields"), "Card renewal must reject responses that change immutable public Card fields");
assert(cardRenewal.includes("cardRenewalRequestIsCurrent") && cardRenewal.includes("cardRenewalSessionScope(currentSession, runtimeEnvironment, now)"), "Card renewal must bind unexpired session scope, selected Card and request generation");
assert(cardRenewal.includes("hasAvailableBalanceMinor") && cardRenewal.includes('hasOwnProperty.call(card, "availableBalanceMinor")'), "Card renewal must version optional balance presence and value");
assert(cardRenewal.includes("cardRenewalVersionMatches(request.oldCardVersion, currentCard)"), "Card renewal must bind every selected Card public version field");
assert(cardRenewal.includes("beginCardRenewal") && cardRenewal.includes("gate.activeRequestId !== null"), "Card renewal must synchronously reject double click");
assert(cardRenewal.includes("createCardRenewalCommit") && cardRenewal.includes("unavailable or duplicated"), "Card renewal must atomically update one listed and selected Card");
assert(app.includes("renewalDecision?.allowed&&<form"), "Card renewal UI must be hidden unless capability, environment, scope and selection allow it");
assert(app.includes("beginCardRenewal(cardRenewalSubmitGate.current,requestId)"), "Card renewal must synchronously block duplicate submissions");
assert(app.includes("createCardRenewalRequestIdentity(requestId,decision.scopeKey,card,crypto.randomUUID())"), "Each accepted Card renewal submission must generate one fresh UUIDv4");
assert(app.includes("cardRenewalRequestIsCurrent(request,cardRenewalRequestSequence.current,activeSession,walletRuntime.environment") && app.includes("walletRequestMounted.current&&"), "Card renewal completion must bind selection, session and mounted state");
assert(app.includes("createCardRenewalCommit(cardsRef.current,selectedCardRef.current,request.oldCardVersion,renewed)"), "Card renewal UI must commit one atomic list and selection update");
assert(app.includes("Manual SANDBOX/TEST only · one canonical UUIDv4 Idempotency-Key · at most one bodyless POST · no automatic retries."), "Card renewal UI must state the non-production bodyless one-POST no-retry boundary");
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
