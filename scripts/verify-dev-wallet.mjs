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
const cardTimeline = readFileSync(join(root, "src/cardTimeline.ts"), "utf8");
const cardTimelineRefresh = readFileSync(join(root, "src/cardTimelineRefresh.ts"), "utf8");
const cardBalance = readFileSync(join(root, "src/cardBalance.ts"), "utf8");
const cardLimits = readFileSync(join(root, "src/cardLimits.ts"), "utf8");
const cardLimitsUpdate = readFileSync(join(root, "src/cardLimitsUpdate.ts"), "utf8");
const cardStatusAction = readFileSync(join(root, "src/cardStatusAction.ts"), "utf8");
const cardActivation = readFileSync(join(root, "src/cardActivation.ts"), "utf8");
const cardActivationIntegrationTests = readFileSync(join(root, "tests/cardActivation.integration.test.ts"), "utf8");
const cardStatusPostChain = readFileSync(join(root, "src/cardStatusPostChain.ts"), "utf8");
const cardStatusPostChainIntegrationTests = readFileSync(join(root, "tests/cardStatusPostChain.integration.test.ts"), "utf8");
const walletData = readFileSync(join(root, "src/walletData.ts"), "utf8");
const walletTransfer = readFileSync(join(root, "src/walletTransfer.ts"), "utf8");
const walletTransferPostChain = readFileSync(join(root, "src/walletTransferPostChain.ts"), "utf8");
const walletTransferPostChainIntegrationTests = readFileSync(join(root, "tests/walletTransferPostChain.integration.test.ts"), "utf8");
const fxQuote = readFileSync(join(root, "src/fxQuote.ts"), "utf8");
const fxQuotePreview = readFileSync(join(root, "src/FxQuotePreview.tsx"), "utf8");
const fxQuoteMountedTests = readFileSync(join(root, "tests/fxQuote.mounted.integration.test.ts"), "utf8");
const consumerTransferFlow = readFileSync(join(root, "src/ConsumerTransferFlow.tsx"), "utf8");
const consumerOverview = readFileSync(join(root, "src/consumerOverviewState.ts"), "utf8");
const consumerOverviewView = readFileSync(join(root, "src/ConsumerOverview.tsx"), "utf8");
const consumerOverviewTests = readFileSync(join(root, "tests/consumerOverview.test.ts"), "utf8");
const styles = readFileSync(join(root, "src/styles.css"), "utf8");
const walletTransactions = readFileSync(join(root, "src/walletTransactions.ts"), "utf8");
const walletOperations = readFileSync(join(root, "src/walletOperations.ts"), "utf8");
const virtualCardCreate = readFileSync(join(root, "src/virtualCardCreate.ts"), "utf8");
const virtualCardCreatePostChain = readFileSync(join(root, "src/virtualCardCreatePostChain.ts"), "utf8");
const virtualCardCreatePostChainIntegrationTests = readFileSync(join(root, "tests/virtualCardCreatePostChain.integration.test.ts"), "utf8");
const cardReplacement = readFileSync(join(root, "src/cardReplacement.ts"), "utf8");
const cardReplacementPostChain = readFileSync(join(root, "src/cardReplacementPostChain.ts"), "utf8");
const cardReplacementPostChainIntegrationTests = readFileSync(join(root, "tests/cardReplacementPostChain.integration.test.ts"), "utf8");
const cardRenewal = readFileSync(join(root, "src/cardRenewal.ts"), "utf8");
const cardRenewalPostChain = readFileSync(join(root, "src/cardRenewalPostChain.ts"), "utf8");
const cardRenewalPostChainIntegrationTests = readFileSync(join(root, "tests/cardRenewalPostChain.integration.test.ts"), "utf8");
const kycStatus = readFileSync(join(root, "src/kycStatus.ts"), "utf8");
const kycStatusPanel = readFileSync(join(root, "src/KycStatusPanel.tsx"), "utf8");
const kycStatusTests = readFileSync(join(root, "tests/kycStatus.mounted.integration.test.ts"), "utf8");
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
assert(app.includes("<ConsumerOverview") && app.includes('id="wallet-assets"') && app.includes('id="wallet-cards"') && app.includes('id="wallet-activity"') && app.includes('id="wallet-kyc"'), "The real-data consumer overview must remain mounted and link only to reachable Wallet sections");
assert(consumerOverview.includes("accounts.includes(selectedAccount)") && consumerOverview.includes("cards.includes(selectedCard)"), "Consumer overview selections must be exact members of the current normalized snapshots");
assert(consumerOverview.includes("CONSUMER_OVERVIEW_RECENT_OPERATION_LIMIT = 3") && consumerOverview.includes("operations.items.slice"), "Consumer overview activity must remain a bounded projection of the current Backend page");
assert(!consumerOverview.includes("reduce(") && !consumerOverviewView.includes("Number(") && !consumerOverviewView.includes("Intl.NumberFormat"), "Consumer overview must not calculate or combine balances across assets");
assert(!consumerOverviewView.includes("fetch(") && !consumerOverviewView.includes("walletApi") && consumerOverviewView.includes("Current Backend data only"), "Consumer overview must remain a presentation-only consumer of existing Backend snapshots");
assert(consumerOverviewTests.includes("invents no fallback balance") && consumerOverviewTests.includes("suppresses stale selections"), "Consumer overview tests must prove zero fallback data and stale-selection suppression");
assert(styles.includes(".consumer-overview{grid-column:1/-1") && styles.includes('.wallet-grid [id^="wallet-"]'), "Consumer overview and its reachable section navigation must remain responsive and visible");
assert(runtimeTemplate.includes("$VITE_FASTLINK_ENVIRONMENT"), "runtime template must expose the environment");
assert(runtimeTemplate.includes("$VITE_FASTLINK_API_URL"), "runtime template must expose the API URL");
assert(runtimeTemplate.includes("$RAILWAY_GIT_COMMIT_SHA"), "runtime template must expose the Railway Release SHA");
assert(entrypoint.includes("VITE_FASTLINK_ENVIRONMENT is required"), "container startup must fail closed without environment");
assert(entrypoint.includes("VITE_FASTLINK_API_URL is required"), "container startup must fail closed without API URL");
assert(entrypoint.includes("RAILWAY_GIT_COMMIT_SHA is required"), "container startup must fail closed without Release SHA");
assert(entrypoint.includes("SANDBOX Wallet must use the same-origin /api proxy"), "container startup must require the same-origin Dev API proxy");
assert(dockerfile.includes("/docker-entrypoint.d/40-fastlink-runtime.sh"), "runtime generation must execute before nginx starts");
assert(apiClient.includes("credentials:'include'"), "Wallet API must include Cookie credentials");
assert(apiClient.includes("sessionFailureRequiresClear(error)") && apiClient.includes("fastlink:session-invalid"), "Only explicit authentication failures may broadcast global session invalidation");
assert(kycStatus.includes("kycStatusFailureCanInvalidateSession") && kycStatus.includes("kycStatusFailureClearsSnapshot") && kycStatus.includes("status === 401 || status === 403 || status === 404"), "KYC failures must invalidate only on current 401 and clear only the current 401/403/404 snapshot");
assert(kycStatusPanel.includes("kycStatusFailureCanInvalidateSession(value, current, controller.signal)") && kycStatusPanel.includes('fastlink:session-invalid'), "Only a current non-aborted KYC 401 may clear the snapshot and join global session invalidation");
assert(kycStatusPanel.includes("sessionGenerationRef.current === expectedSessionGeneration") && kycStatusPanel.includes("sessionRef.current === activeSession") && kycStatusPanel.includes("!controller.signal.aborted"), "KYC completion must bind the exact session generation and reject stale writes");
assert(kycStatusPanel.includes("setSnapshot(null)") && kycStatusPanel.includes("The last verified same-session snapshot remains unchanged"), "KYC authorization failures must clear the snapshot while transient failures retain only a same-session snapshot");
assert(kycStatusTests.includes("current explicit 401") && kycStatusTests.includes("current 403 or 404") && kycStatusTests.includes("same-field session replacement") && kycStatusTests.includes("late 401, error and finally") && kycStatusTests.includes("sessionInvalid: 0"), "KYC mounted tests must prove failure handling, session generation isolation and zero stale writes");
assert(apiClient.includes("sessionInvalidation==='broadcast'&&sessionFailureRequiresClear(error)") && apiClient.includes("WALLET_TRANSFER_ACCOUNTS_PATH?WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES:WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES,'caller'"), "Transfer requests must remain response-bounded and leave session invalidation to their current identity-bound caller");
assert(sessionLifecycle.includes("error?.status === 401") && sessionLifecycle.includes("SESSION_INVALIDATION_MESSAGE"), "Session invalidation must remain restricted to explicit authentication failure evidence");
assert(app.includes("replaceSession(current)") && app.includes("runSessionInitializationModule"), "A validated exact Session object must be committed before independent business initialization modules settle");
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
assert(apiClient.includes("readWalletTransferAccounts(walletTransferTransport,session,walletRuntime.environment,signal)"), "Wallet account responses must use the bounded caller-cancelled transfer consumer");
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
assert(cardStatusAction.includes("request.session !== currentSession") && cardStatusAction.includes("request.card !== currentCard"), "Card status completion must bind the exact Session and selected Card objects");
assert(cardStatusAction.includes("cardStatusFailureIsAmbiguous") && cardStatusAction.includes("cardStatusRetryKey") && cardStatusAction.includes("cardStatusConflictIsCurrent"), "Ambiguous Card status writes must permit one exact same-key retry before blocking the unchanged scope");
assert(cardStatusAction.includes("Object.getOwnPropertyDescriptor") && cardStatusAction.includes("parseCardStatusResponse"), "Card status response must reconstruct only safe public own-data fields");
assert(cardStatusAction.includes("method: \"POST\"") && !cardStatusAction.includes("body:"), "Card freeze and unfreeze transport must be a bodyless POST");
assert(apiClient.includes("submitCardStatusAction(cardStatusTransport") && apiClient.includes("cardStatusTransport=({path,method,idempotencyKey,signal}"), "Card status mutation must use one typed cancellable bodyless POST transport");
assert(apiClient.includes("if(!csrfToken())return Promise.reject") && apiClient.includes("'caller')"), "Card status mutation must fail closed without CSRF and leave exact 401 invalidation to its request owner");
assert(app.includes("retryKey??createCardStatusIdempotencyKey(decision.operation,crypto.randomUUID())") && app.includes("Boolean(retryKey)"), "Every Card status click must use one fresh operation-bound UUIDv4 or the one exact retained retry key");
assert(app.includes("cardStatusInFlight.current") && app.includes("cardStatusSubmitGate.current.activeRequestId=null"), "Card status mutation must synchronously block duplicate submits and clear its gate on invalidation");
assert(app.includes("sessionRef.current") && app.includes("cardStatusRequestIsCurrent(request,cardActionRequestSequence.current"), "Card status mutation must make replacement-Session, replacement-Card, unmounted or stale completions write nothing");
assert(app.includes("cardStatusFailureIsExplicit401(value)") && app.includes("sessionRef.current===activeSession"), "Only an explicit 401 owned by the exact current Card Session may invalidate authentication");
assert(cardStatusAction.includes('return operation === "activate" ? `activate:${randomUuid}` : randomUuid') && cardStatusAction.includes('status !== (operation === "freeze" ? "FROZEN" : "ACTIVE")'), "Card activation must use an operation-bound UUID and only accept an ACTIVE POST response");
assert(cardActivation.includes("CARD_ACTIVATION_LIST_MAX_PAGES = 25") && cardActivation.includes('card.status !== "ACTIVE"') && cardActivation.includes('match.status !== "ACTIVE"'), "Card activation must be confirmed by bounded canonical Card and list reads");
assert(cardActivation.includes("createCardActivationCommit") && cardActivation.includes("CardActivationPostRefreshError") && cardActivation.includes("cardPublicVersion(snapshot.card)"), "Card activation must expose one exact commit-ready complete Card snapshot");
assert(apiClient.includes("confirmCardActivation:async") && apiClient.includes("readCardActivationConfirmation") && apiClient.includes("cardActivationListTransport"), "Card activation confirmation must use typed caller-owned persisted reads");
assert(cardActivation.includes("runCardActivationPostChain") && cardActivation.includes("await input.submit(input.signal)") && cardActivation.includes("readCardDetailRefresh(") && cardActivation.includes("createCardActivationInvalidatedCommit"), "One production Card activation orchestrator must own POST, confirmation, five-resource refresh and fail-closed outcome creation");
assert(app.includes("await runCardActivationPostChain({") && app.includes("if(outcome.status==='CONFIRMED_REFRESH_FAILED')") && app.includes("invalidatedActivationCommit=outcome.commit"), "The production App must call the tested activation orchestrator and consume its exact complete or invalidated commit");
assert(cardActivationIntegrationTests.includes("assert.equal(commits, 0)") && cardActivationIntegrationTests.includes('const invalidations = ["Session", "environment", "Card", "generation"]') && cardActivationIntegrationTests.includes('const completions = ["success", "error", "401"]'), "Executable SANDBOX/TEST activation tests must prove pre-chain zero commits and all stale completion classes write zero");
assert(app.includes("if(confirmedActivation||confirmedStatus)") && app.includes("cardStatusRetryRequest.current=null") && app.includes("Associated Card data was safely cleared") && app.includes("cardDetailTarget.current=null"), "A confirmed Card status change with failed associated reads must retain the confirmed Card, drop retry state and invalidate all dependent Card state");
assert(app.includes("activation, freeze and unfreeze commit Card, list, balance, limits, transactions and timeline only after exact persisted reads agree"), "Card status UI must state its bounded retry and complete status refresh boundary");
assert(cardStatusPostChain.includes("runCardStatusPostChain") && cardStatusPostChain.includes("const submitted = await input.submit(input.signal)") && cardStatusPostChain.includes("await input.confirm(submitted, input.signal)") && cardStatusPostChain.includes("readCardDetailRefresh("), "One tested Card status orchestrator must own the exact POST, confirmation and complete associated refresh");
assert(cardStatusPostChain.includes("CARD_STATUS_CONFIRMATION_MAX_PAGES = 25") && cardStatusPostChain.includes("cardPublicVersion(submitted)") && cardStatusPostChain.includes("cardPublicVersion(match)"), "Freeze/unfreeze confirmation must use bounded exact detail/list public-version agreement");
assert(apiClient.includes("confirmCardStatus:async") && apiClient.includes("readCardStatusConfirmation") && app.includes("await runCardStatusPostChain({"), "The production App must invoke the tested freeze/unfreeze post-chain through caller-owned persisted reads");
assert(cardStatusPostChainIntegrationTests.includes('for (const operation of ["freeze", "unfreeze"]') && cardStatusPostChainIntegrationTests.includes('assert.equal(posts, 1)') && cardStatusPostChainIntegrationTests.includes('assert.equal(await operation, null)'), "Executable SANDBOX/TEST tests must cover both status transitions, one POST and stale zero-commit outcomes");
assert(apiClient.includes("internalTransfer:async") && apiClient.includes("Promise<WalletTransferReceipt>"), "Internal transfer must expose only the typed public receipt");
assert(apiClient.includes("submitWalletTransfer(walletTransferTransport,session,walletRuntime.environment,accounts,input,idempotencyKey,signal)"), "Transfer responses must pass through the bounded caller-cancelled exact consumer");
assert(app.includes("const idempotencyKey=retryKey??crypto.randomUUID()") && app.includes("createWalletTransferRequestIdentity(requestId,scope,account,destination,input,idempotencyKey,Boolean(retryKey))"), "Each new transfer must bind exact source, destination, input and retry generations to one caller-owned key");
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
assert(app.includes("walletTransferSessionScope(activeSession,walletRuntime.environment)===scope") && app.includes("consumerTransferUiRequestIsCurrent(uiRequest") && app.includes("walletRequestMounted.current"), "Wallet transfer completions must re-check session, input generation, selection and mount state before every write");
assert(app.includes("const retryKey=walletTransferRetryKey(retryRequest,scope,accountsRef.current,account,input)") && app.includes("if(retryRequest&&!retryKey)") && app.includes("const idempotencyKey=retryKey??crypto.randomUUID()") && app.includes("walletTransferRetryRequest.current=request"), "Ambiguous transfer retries must reuse one key bound to the exact current session, source version and input, or fail closed without a new transfer");
assert(app.includes("if(walletTransferRetryRequest.current||value===destinationAccountIdRef.current)return") && app.includes("disabled={transferBusy||transferRetryPending}") && consumerTransferFlow.includes("props.loading||props.busy||props.retryPending"), "An uncertain transfer must lock its exact account and input until same-key resolution");
assert(walletTransfer.includes("walletTransferFailureIsAmbiguous") && walletTransfer.includes("descriptor.value === 0 || descriptor.value === 408") && walletTransfer.includes("descriptor.value >= 500 && descriptor.value <= 599"), "Only network, timeout and 5xx transfer failures may retain the idempotency key");
assert(walletTransferPostChain.includes("runWalletTransferPostChain") && walletTransferPostChain.includes("await input.confirm(submitted, input.signal)") && walletTransferPostChain.includes("Promise.all(["), "One tested Wallet transfer orchestrator must own one POST, persisted operation confirmation and complete refresh");
assert(app.includes("await runWalletTransferPostChain({") && app.includes("walletApi.walletTransferBalance") && app.includes("walletApi.walletTransferTransactions"), "The production App must consume the atomic transfer post-chain through caller-owned readers");
assert(walletTransferPostChainIntegrationTests.includes("one POST is persisted-confirmed") && walletTransferPostChainIntegrationTests.includes("TRANSACTIONS:BOTH") && walletTransferPostChainIntegrationTests.includes("late success, error, and 401"), "Executable SANDBOX/TEST evidence must prove one POST, two-sided refresh and zero stale writes");
assert(app.includes("sessionFailureRequiresClear(cause)") && app.includes("sessionRef.current===activeSession"), "Only a current exact-session transfer failure may invalidate authentication");
assert(app.includes("Transfer is confirmed, but the complete source, destination and customer transaction refresh failed") && app.includes("Retry manually once to reuse the exact Idempotency-Key"), "Wallet transfer failures must distinguish confirmed safe invalidation from exact-key manual retry");
assert(walletTransfer.includes("retry.retry") && consumerTransferFlow.includes("Same-key retry exhausted · no third POST"), "An unresolved same-key retry must block every third transfer POST");
assert(app.includes("walletTransferRetryRequest.current&&!walletTransferRetryRequest.current.retry") && app.includes("transferRetryPending&&!transferRetryExhausted"), "Session refresh must remain blocked during the first uncertain result and become the only recovery after retry exhaustion");
assert(apiClient.includes("readFxQuote(fxQuoteTransport,session,walletRuntime.environment,input,signal)"), "FX quote must pass caller cancellation through the strict session-gated consumer");
assert(apiClient.includes("fxQuoteTransport=({path,method,body,signal}:FxQuoteTransportRequest)=>request<string>(path,method,body,undefined,'text',signal,FX_QUOTE_RESPONSE_MAX_JSON_BYTES,'caller')"), "FX quote must use a bounded caller-scoped transport over the Cookie and CSRF aware same-origin API");
assert(fxQuote.includes('FX_QUOTE_PATH = "/v1/wallet/fx/quotes"'), "FX quote must use the exact public Wallet quote path");
assert(fxQuote.includes('method: "POST"') && fxQuote.includes("body: normalized"), "FX quote must issue exactly one typed POST per call");
assert(fxQuote.includes('runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST"'), "FX quote must fail closed outside matching SANDBOX and TEST sessions");
assert(fxQuote.includes("session.actorId") && fxQuote.includes("session.tenantId") && fxQuote.includes("session.customerId") && fxQuote.includes("session.expiresAt"), "FX quote scope must bind actor, tenant, customer, environment and expiry");
assert(fxQuote.includes("exactDataRecord(parseBoundedRawJson(raw), quoteFields") && fxQuote.includes("rejectDuplicateJsonObjectKeys(raw)"), "FX quote must reconstruct only its exact bounded public response allowlist");
assert(fxQuote.includes("FX_QUOTE_RESPONSE_MAX_JSON_BYTES = 4_096") && fxQuote.includes("FX_QUOTE_MAX_VALIDITY_MS = 15 * 60 * 1_000"), "FX quote response size and validity window must remain conservatively bounded");
assert(fxQuote.includes("sourceAssetCode !== input.sourceAssetCode") && fxQuote.includes("targetAssetCode !== input.targetAssetCode") && fxQuote.includes("sourceAmount !== input.sourceAmount"), "FX quote response must bind the exact request inputs");
assert(fxQuote.includes("targetAmount.scaled !== (sourceAmountParts.scaled * rate.scaled) / decimalScale") && fxQuote.includes("10n ** 18n") && !fxQuote.includes("parseFloat"), "FX quote target arithmetic must use exact BigInt multiplication with 18-decimal truncation");
assert(fxQuote.includes("fxQuoteRequestIsCurrent") && fxQuote.includes("request.inputGeneration === currentInputGeneration") && fxQuote.includes("request.requestGeneration === currentRequestGeneration"), "FX quote writes must bind request, input and scope generations");
assert(fxQuote.includes("throwIfFxQuoteRequestAborted(signal)") && fxQuote.includes("fxQuoteFailureCanInvalidateSession"), "FX quote must reject aborted completion and isolate session invalidation to a current explicit 401");
assert(fxQuotePreview.includes("mounted.current=false") && fxQuotePreview.includes("scopeRef.current===expectedScope") && fxQuotePreview.includes("submitGate.current.activeRequestId===requestId") && fxQuotePreview.includes("requestAbortController.current===controller"), "FX quote UI must reject stale, cross-session and unmounted completions");
assert(fxQuotePreview.includes("requestAbortController.current?.abort()") && fxQuotePreview.includes("walletApi.fxQuote(session,input,controller.signal)"), "FX quote scope, account assets, input and unmount invalidation must actively cancel the network request");
assert(fxQuotePreview.includes("fxQuoteFailureCanInvalidateSession(value,current,controller.signal)") && fxQuotePreview.includes("fastlink:session-invalid"), "Only the current non-aborted FX request may publish an explicit 401 session invalidation");
assert(fxQuoteMountedTests.includes("rapid double click") && fxQuoteMountedTests.includes("scope reset aborts") && fxQuoteMountedTests.includes("stale 401 after abort") && fxQuoteMountedTests.includes("globalSessionInvalid: 0"), "FX mounted deferred tests must cover one-flight, abort, stale 401 and zero late/global writes");
assert(fxQuotePreview.includes("one POST per click") && fxQuotePreview.includes("no conversion, funds movement, polling, automatic retry, or direct Provider call"), "FX quote UI must state its manual synthetic non-production boundary");
assert(fxQuotePreview.match(/walletApi\.fxQuote\(/g)?.length === 1, "FX quote must have one explicit click-driven API call site");
assert(fxQuotePreview.includes("if(!retryable(value))replaceQuote(null)"), "Retryable FX quote failures must preserve the same-input verified quote");
assert(apiClient.includes("readWalletTransactionHistory(walletTransactionTransport,session,walletRuntime.environment,filters,previous,signal)"), "Wallet must consume bounded session-gated customer Wallet history with caller cancellation");
assert(apiClient.includes("walletTransactionDetail:async"), "Wallet must consume the public selected transaction detail endpoint");
assert(apiClient.includes("walletTransactionTransport=({path,method,signal}") && apiClient.includes("externalSignal?.addEventListener('abort',cancel,{once:true})"), "Wallet transaction fetches must compose timeout and caller cancellation signals");
assert(apiClient.includes("walletOperations:async") && apiClient.includes("readWalletOperationActivity(walletOperationTransport,session,walletRuntime.environment,scopeKey,filters,cursor,signal)"), "Wallet must consume typed, session-gated and caller-cancelled all-account operation activity");
assert(apiClient.includes("walletOperationDetail:async") && apiClient.includes("readWalletOperationDetail(walletOperationTransport,session,walletRuntime.environment,scopeKey,selected,signal)"), "Wallet must consume typed, session-gated and caller-cancelled selected operation detail");
assert(apiClient.includes("submitVirtualCardCreate(virtualCardCreateTransport,session,walletRuntime.environment") && apiClient.includes("virtualCardCreateTransport=({path,method,body,idempotencyKey,signal}"), "Virtual Card creation must use one caller-cancelled session-gated typed POST");
assert(apiClient.includes("'json',signal,undefined,'caller'") && apiClient.includes("confirmVirtualCardCreate:async"), "Virtual Card create and persisted confirmation must keep 401 handling caller-owned");
assert(apiClient.includes("virtualCardCreateCardRefresh:async") && apiClient.includes("virtualCardCreateBalanceRefresh:async") && apiClient.includes("virtualCardCreateLimitsRefresh:async") && apiClient.includes("virtualCardCreateTransactionsRefresh:async"), "Every Virtual Card post-create resource read must keep 401 handling caller-owned");
assert(virtualCardCreate.includes('runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST"') && virtualCardCreate.includes("session.expiresAt"), "Virtual Card creation must require an unexpired matching SANDBOX or TEST session");
assert(virtualCardCreate.includes("parseVirtualCardCreateInput"), "Virtual Card request must use an exact public input parser");
assert(virtualCardCreate.includes("parseVirtualCardCreateResponse"), "Virtual Card response must use an exact public Card parser");
assert(virtualCardCreate.includes("beginVirtualCardCreate") && virtualCardCreate.includes("createVirtualCardCreateRequestIdentity") && virtualCardCreate.includes("captureVirtualCardGeneration"), "Virtual Card creation must synchronously gate duplicate submit and bind input plus Card generation");
assert(virtualCardCreate.includes("virtualCardCreateRequestIsCurrent") && virtualCardCreate.includes("virtualCardCreateSessionScope(currentSession, runtimeEnvironment, now)"), "Virtual Card creation must be isolated by exact session, input, Card and mounted generations");
assert(virtualCardCreatePostChain.includes("VIRTUAL_CARD_CREATE_CONFIRMATION_MAX_PAGES = 25") && virtualCardCreatePostChain.includes("runVirtualCardCreatePostChain") && virtualCardCreatePostChain.includes("readCardDetailRefresh"), "Virtual Card creation must confirm one exact persisted created Card and bounded list before five-resource refresh");
assert(virtualCardCreatePostChainIntegrationTests.includes('assert.equal(calls.filter(call => call === "POST").length, 1)') && virtualCardCreatePostChainIntegrationTests.includes("assert.equal(pages, 25)") && virtualCardCreatePostChainIntegrationTests.includes("assert.equal(await operation, null)"), "Virtual Card creation evidence must cover one POST, bounded confirmation and stale zero writes");
assert(apiClient.includes("submitCardReplacement(cardReplacementTransport,session,walletRuntime.environment"), "Card replacement must fail closed through the typed session-gated consumer");
assert(apiClient.includes("cardReplacementTransport=({path,method,body,idempotencyKey,signal}") && apiClient.includes("'json',signal,undefined,'caller'"), "Card replacement must make one caller-cancelled typed POST with caller-owned 401 handling");
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
assert(cardReplacementPostChain.includes("CARD_REPLACEMENT_CONFIRMATION_MAX_PAGES = 25") && cardReplacementPostChain.includes('predecessor.status !== "CLOSED"') && cardReplacementPostChain.includes("publicCardVersion(successor) !== publicCardVersion(submitted)"), "Card replacement must confirm the exact closed predecessor and accepted successor through bounded persisted reads");
assert(cardReplacementPostChain.includes("runCardReplacementPostChain") && cardReplacementPostChain.includes("await input.submit(input.signal)") && cardReplacementPostChain.includes("readCardDetailRefresh(") && cardReplacementPostChain.includes("createCardReplacementInvalidatedCommit"), "One Card replacement orchestrator must own the single POST, confirmation, successor refresh and fail-closed outcome");
assert(cardReplacementPostChainIntegrationTests.includes('assert.equal(calls.filter(call => call === "POST").length, 1)') && cardReplacementPostChainIntegrationTests.includes('assert.equal(pages, 25)') && cardReplacementPostChainIntegrationTests.includes('assert.equal(await operation, null)'), "Executable SANDBOX/TEST replacement tests must cover one POST, bounded confirmation and stale zero-commit outcomes");
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
    cardDetailRefresh.includes("readers.transactions(selectedCardId, signal)") &&
    cardDetailRefresh.includes("readers.timeline(selectedCardId, signal)"),
  "One shared active AbortSignal must reach all five atomic Card detail readers",
);
assert(
  app.includes("cardDetailAbortController.current===detailController") &&
    app.includes("},card.id,detailController.signal)"),
  "Card detail completion must remain bound to the active cancellation domain",
);
assert(cardTimeline.includes('EVENT_FIELDS = ["id", "type", "fromStatus", "toStatus", "occurredAt"]') && cardTimeline.includes("ownExact(value, EVENT_FIELDS"), "Card timeline must reconstruct exactly five public event fields");
assert(cardTimeline.includes("CARD_TIMELINE_PAGE_SIZE = 25") && cardTimeline.includes("CARD_TIMELINE_MAX_PAGES = 10") && cardTimeline.includes("CARD_TIMELINE_MAX_EVENTS"), "Card timeline pagination must remain bounded to 10 pages and 250 events");
assert(cardTimeline.includes("CARD_TIMELINE_CURSOR_MAX_BYTES = 2_048") && cardTimeline.includes("Repeated Card timeline cursor"), "Card timeline must treat signed cursors as bounded opaque history");
assert(cardTimeline.includes("walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey") && cardTimeline.includes('method: "GET"'), "Card timeline transport must be GET-only and revalidate the live actor session before and after transport");
assert(cardTimeline.includes("cardTimelineFailureCanInvalidateSession") && cardTimeline.includes("cardTimelineFailureClearsSnapshot"), "Card timeline failures must separate matching-session 401 invalidation from 403/404 snapshot clearing");
assert(cardTimelineRefresh.includes('sessionEnvironment === "SANDBOX" || sessionEnvironment === "TEST"') && cardTimelineRefresh.includes("CARD_TIMELINE_REFRESH_MAX_ATTEMPTS = 3"), "Card timeline manual refresh must remain SANDBOX/TEST-only and bounded without automatic retries");
assert(
  apiClient.includes("readCardTimelinePage(cardTimelineTransport,session,walletRuntime.environment,scopeKey,id,cursor,signal)") &&
    apiClient.includes("cardTimelineTransport=({path,method,signal}:CardTimelineTransportRequest)=>request<unknown>(path,method,undefined,undefined,'json',signal,undefined,'caller')"),
  "Wallet API must leave Card timeline session invalidation to the current request owner while preserving the response-limit parameter",
);
assert(app.includes("walletApi.timeline(activeSession,expectedScope,id,null") && app.includes("walletTransferSessionScope(activeSession,walletRuntime.environment)===expectedScope"), "Atomic Card detail timeline completion must bind the current unexpired session");
assert(app.includes("cardTimelineFailureCanInvalidateSession(value,current,controller.signal)") && app.includes("cardTimelineFailureClearsSnapshot(value,current,controller.signal)"), "Only a current Card timeline request may clear its snapshot or invalidate its matching session");
assert(app.includes("Card lifecycle timeline · read only") && app.includes("signed opaque cursor") && app.includes("no automatic retries"), "Card timeline UI must state its read-only bounded manual contract");
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
assert(app.includes("beginVirtualCardCreate(virtualCardCreateSubmitGate.current,requestId)") && app.includes("createVirtualCardCreateRequestIdentity(requestId,scope,input,existingCards,existingNextCursor,existingSelectedCard,crypto.randomUUID())"), "Each accepted Virtual Card submission must synchronously gate and generate one UUIDv4");
assert(app.includes("await runVirtualCardCreatePostChain({") && app.includes("confirmVirtualCardCreate") && app.includes("invalidatedCommit=outcome.commit"), "Virtual Card UI must consume only exact complete or safely invalidated post-chain outcomes");
assert(app.includes("walletApi.virtualCardCreateCardRefresh") && app.includes("walletApi.virtualCardCreateBalanceRefresh") && app.includes("walletApi.virtualCardCreateLimitsRefresh") && app.includes("walletApi.virtualCardCreateTransactionsRefresh"), "Only the current Virtual Card post-chain may decide whether a resource 401 invalidates its exact Session");
assert(app.includes("virtualCardCreateBlockedRef.current=true") && app.includes("do not submit another create request"), "Unconfirmed Virtual Card creation must block another create until exact refresh");
assert(app.includes("exactly one POST · no retries") && app.includes("exact persisted created Card and bounded list reads agree"), "Virtual Card UI must state the exact non-production one-POST persisted-confirmation boundary");
assert(app.includes("No Provider or internal error details displayed"), "Virtual Card errors must remain provider-neutral");
assert(app.includes("replacementDecision?.allowed&&<form"), "Card replacement UI must be hidden unless capability, environment, scope and selection allow it");
assert(app.includes("beginCardReplacement(cardReplacementSubmitGate.current,requestId)"), "Card replacement must synchronously block duplicate submissions");
assert(app.includes("createCardReplacementRequestIdentity(requestId,decision.scopeKey,input.reason,oldCard,crypto.randomUUID())"), "Each accepted Card replacement submission must generate one fresh UUIDv4");
assert(app.includes("cardReplacementReasonRef.current,selectedCardRef.current") && app.includes("walletRequestMounted.current&&"), "Card replacement completion must bind reason, selection, session and mounted state");
assert(app.includes("await runCardReplacementPostChain({") && app.includes("confirmCardReplacement") && app.includes("invalidatedCommit=outcome.commit"), "Card replacement UI must consume only the post-chain complete or safely invalidated commit");
assert(app.includes("setCards([...commit.cards])") && app.includes("setSelectedCard(commit.card)") && app.includes("replaceCardTransactionHistory") && app.includes("replaceCardTimelineHistory"), "Card replacement UI must atomically move selection and all successor resources only after confirmation");
assert(app.includes("Manual SANDBOX/TEST only · one canonical UUIDv4 Idempotency-Key · at most one POST · no automatic retries."), "Card replacement UI must state the non-production one-POST no-retry boundary");
assert(app.includes("Card replacement unavailable for this session · Trace"), "Card replacement errors must remain Provider and internal-detail neutral");
assert(apiClient.includes("submitCardRenewal(cardRenewalTransport,session,walletRuntime.environment"), "Card renewal must fail closed through the typed session-gated consumer");
assert(apiClient.includes("cardRenewalTransport=({path,method,idempotencyKey,signal}") && apiClient.includes("'json',signal,undefined,'caller'"), "Card renewal must make one caller-cancelled typed bodyless POST with the caller-owned idempotency key");
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
assert(cardRenewalPostChain.includes("CARD_RENEWAL_CONFIRMATION_MAX_PAGES = 25") && cardRenewalPostChain.includes("confirmCardRenewalPredecessor") && cardRenewalPostChain.includes("runCardRenewalPostChain"), "Card renewal must confirm the exact predecessor and renewed generation through a bounded persisted read chain");
assert(cardRenewalPostChain.includes("await input.predecessor(input.signal)") && cardRenewalPostChain.includes("await input.submit(input.signal)") && cardRenewalPostChain.includes("readCardDetailRefresh") && cardRenewalPostChain.includes("createCardRenewalInvalidatedCommit"), "Card renewal post-chain must order predecessor, one submit, exact confirmation and safe five-resource refresh");
assert(cardRenewalPostChainIntegrationTests.includes('assert.equal(calls.filter(call => call === "POST").length, 1)') && cardRenewalPostChainIntegrationTests.includes("assert.equal(pages, 25)") && cardRenewalPostChainIntegrationTests.includes("assert.equal(await operation, null)"), "Card renewal evidence must cover one POST, bounded confirmation and stale zero writes");
assert(app.includes("renewalDecision?.allowed&&<form"), "Card renewal UI must be hidden unless capability, environment, scope and selection allow it");
assert(app.includes("beginCardRenewal(cardRenewalSubmitGate.current,requestId)"), "Card renewal must synchronously block duplicate submissions");
assert(app.includes("createCardRenewalRequestIdentity(requestId,decision.scopeKey,card,crypto.randomUUID())"), "Each accepted Card renewal submission must generate one fresh UUIDv4");
assert(app.includes("cardRenewalRequestIsCurrent(request,cardRenewalRequestSequence.current,activeSession,walletRuntime.environment") && app.includes("walletRequestMounted.current&&"), "Card renewal completion must bind selection, session and mounted state");
assert(app.includes("await runCardRenewalPostChain({") && app.includes("confirmCardRenewalPredecessor") && app.includes("confirmCardRenewal") && app.includes("invalidatedCommit=outcome.commit"), "Card renewal UI must consume only exact complete or safely invalidated post-chain outcomes");
assert(app.includes("setCardBalance(commit.balance)") && app.includes("replaceCardLimits(commit.limits)") && app.includes("commitCardTransactionHistoryPage(null,renewalTransactionRequest,commit.transactions)") && app.includes("commitCardTimelinePage(null,renewalTimelineRequest,commit.timeline)"), "Card renewal must atomically commit the confirmed Card, balance, limits, transactions and timeline");
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
