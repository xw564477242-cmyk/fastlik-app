# PR #69 Authorized SANDBOX UAT Runbook

**Status:** prepared; do not execute until the authorized candidate deployment and browser policy gate are both verified.

**Scope:** FastLink-owned local wallet/U-card APIs in PR #69. This runbook is for an isolated SANDBOX tenant and a dedicated end-user session only. It does not authorize production use, migration execution, deployment, merge, or a call from the browser to Cregis.

**Code lineage to record before execution:** frontend baseline `b1b3e93506e9175159eea16805e43fe3bda831d2`, local contract implementation `e9400f60ae1559036bd7a34d394cc99ea3319005`, and UAT blocker documentation `a620ab5e69fcf7c0e46ef8f7db9462a89b1bfb50`. The paired local backend completion is `c18409aacca49d2f030ac3aaaef6d57626c31f27`.

## 1. Stop conditions and evidence rules

Stop the run and record it as an environment failure—not a product pass—if any condition below is false:

- The preview URL is an **authorized isolated PR #69 candidate**; its runtime build SHA exactly matches the deployment manifest recorded for this run.
- Browser access is verifiably allowed by the administrator policy. Do not bypass the policy or replace browser evidence with a curl/API-only result.
- The tester has an approved dedicated SANDBOX tenant and end-user Cookie-Session. The account is not shared, production, or another tenant's account.
- The tenant has an active local deposit address, an owned funded local source wallet account, and an enabled local Card product/template for the test `currencyId`.
- The API gateway uses same-origin `/api`, Cookie-Session, CSRF on writes, and a fresh Idempotency-Key for each distinct financial write.

For every step, capture the timestamp, deployment URL/SHA, test tenant alias (not an internal secret), request path, HTTP status, public response ID, trace ID, and a redacted screenshot/network record. Never record cookies, CSRF values, callback signatures, provider secrets, full addresses, or raw callback bodies in the UAT evidence.

Amounts are decimal **strings**. Do not use browser-calculated fees, totals, rates, or balances; compare exact strings returned by the backend.

## 2. Test data worksheet

Fill this worksheet before beginning. Leave a value blank and stop if it cannot be obtained through the approved SANDBOX setup.

| Field | Recorded value |
| --- | --- |
| Authorized preview URL | |
| Verified runtime build SHA | |
| Deployment manifest / release reference | |
| Test tenant alias and environment | SANDBOX |
| End-user test account alias | |
| Active local `depositAddressId` / network | |
| Local `assetId` and display asset code | |
| Owned, funded `sourceWalletAccountId` | |
| Existing owned test `cardId` for top-up quote | |
| Enabled virtual/physical product `currencyId` | |
| Saved withdrawal destination reference | |
| Cregis local order ID (separate Cregis lane only) | |

## 3. Positive-path execution

Run the rows in order. A card top-up quote needs an existing card, so the quote step intentionally uses the pre-existing owned test card; the subsequent issue test creates a separate card and validates `currencyId`.

| # | Journey and operator action | Required result / proof | Ownership |
| --- | --- | --- | --- |
| P0 | Sign in through the normal UI. Refresh once. | Cookie Session restores; no token appears in browser storage. A write sends CSRF and same-origin credentials. | Frontend + gateway |
| P1 | Open **Assets** and refresh balances. | Ledger, pending, and available values are backend strings. No placeholder, cross-tenant record, or locally computed total is shown. | Frontend + local backend |
| P2 | Open local onchain deposit. Select the active local network/address/asset and submit a string `grossAmount` to `POST /api/v2/wallet/onchain/deposits/preview`. | `200` with an opaque `previewId`, expiry, confirmation target, and exact fee facts. `externalProviderCalled:false`. Compare the before/after local ledger: it is unchanged; there is no reservation, transfer, or journal. | Local API 1 |
| P3 | Using the same facts before expiry, submit one local deposit intent with a **new** Idempotency-Key. | A single persisted local deposit intent is returned and begins uncredited/pending. Re-submit only the exact same request once: it returns the same local result, not a second transfer. This API path must not call Cregis. | Existing local deposit flow |
| P4 | Open local onchain history and request `GET /api/v2/wallet/onchain/transactions?limit=25` with the relevant allowed filter. Load one valid next page only when present. | `200` `{items,nextCursor}` contains only the signed-in tenant/customer/environment records, including the P3 intent where applicable. Monetary fields are strings; limit is no more than 100; no caller `tenantId` is sent. | Local API 2 |
| P5 | On the pre-existing owned test card, request a top-up quote with its owned source wallet account and a string amount: `POST /api/v1/cards/{cardId}/topup-quotes`. | `200` returns an opaque `quoteId`, five-minute expiry, backend asset/currency/fee/total-debit strings, and `externalProviderCalled:false`. Confirm no card balance or local ledger change before settlement. | Local API 3 |
| P6 | Before quote expiry, settle P5 once via `POST /api/v1/cards/{cardId}/topups`, using the same source, quote, and a fresh Idempotency-Key. | One successful local operation/receipt and one exact updated local card balance. Refresh card and wallet history; both show one persisted result. A repeat of the exact request returns that result without a duplicate journal. | Local card top-up |
| P7 | Create one virtual card and, if the test product supports it, one physical card. Send the tenant-local canonical `currencyId`, optional alias, and a fresh Idempotency-Key to `/api/v1/cards/virtual` or `/api/v1/cards/physical`. | `200/201` response echoes the exact requested `currencyId` and display currency; product/card is tenant-local. An exact same-key retry returns the existing card only. | Local API 4 |
| P8 | Run the existing local withdrawal flow using a saved address only. Request its backend preview, then submit one authorized SANDBOX withdrawal with a new Idempotency-Key when all gates are met. | The UI shows backend cooling/compliance/approval/fee facts. No free-text destination or optimistic debit appears. The persisted local withdrawal state refreshes through backend responses only. | Existing local withdrawal flow |
| P9 | Run the existing FX quote-only path with source/target local assets and string amounts. | Backend quote displays exact returned strings. There is no client calculation and no conversion-submit action in this Phase2 scope. | Existing FX flow |

### Evidence completion rule

Mark a positive row passed only when the UI, redacted network evidence, and persisted refresh all agree. If the authorized deployment lacks an endpoint or presents an older runtime SHA, stop the run; that is `ENVIRONMENT / BUILD_MISMATCH`, not a frontend success or failure.

## 4. Required boundary and fail-closed cases

Use separate disposable SANDBOX input values. Do not retry a failed financial write with a changed body under the same Idempotency-Key.

| ID | Case | Expected fail-closed result |
| --- | --- | --- |
| N-AUTH | Missing/stale Cookie-Session or missing/invalid CSRF on a write | Safe `401/403`; no preview, transfer, card, quote, operation, or journal mutation. |
| N-DP-01 | Deposit preview uses malformed/number/float/exponent/empty amount, invalid network or asset | `400`; no preview or financial mutation. |
| N-DP-02 | Deposit preview references an unavailable or another-tenant address | Generic `404`; no tenant information disclosure or mutation. |
| N-DP-03 | Deposit submission uses an expired, tampered, changed-amount, changed-address, or cross-scope `previewId` | `409`; no transfer, reservation, or journal. The local signing-secret-unavailable path is `503 DEPOSIT_PREVIEW_UNAVAILABLE`. |
| N-TX-01 | Transaction list uses malformed/tampered cursor, changed filter with old cursor, or `limit` outside 1–100 | `400 ONCHAIN_CURSOR_INVALID` or DTO validation failure; no data leak and no local fallback list. |
| N-CQ-01 | Card top-up quote uses malformed amount or a non-owned card/source account | `400` for malformed amount or generic `404` for unavailable card/source; no quote reservation or ledger mutation. |
| N-CQ-02 | Quote is expired, tampered, for another card/source/amount, or is consumed twice | `409 CARD_TOPUP_QUOTE_MISMATCH` or `409 CARD_TOPUP_QUOTE_CONSUMED`; no duplicate debit, credit, card balance, or journal. |
| N-CQ-03 | Same top-up Idempotency-Key is used with changed facts | `409 IDEMPOTENCY_CONFLICT`; original accounting remains untouched. Missing local quote signing configuration is `503 CARD_TOPUP_QUOTE_UNAVAILABLE`. |
| N-CARD-01 | Card issue omits `currencyId` or sends legacy bare `currency` | `400 CURRENCY_ID_INVALID`; no card issuance. |
| N-CARD-02 | Card issue uses unknown, foreign-tenant, inactive-product, or unsupported `currencyId` | `422 CURRENCY_ID_UNSUPPORTED`; no card issuance or fallback to an ISO display code. |
| N-WDR | Unsaved/ineligible withdrawal address, cooling not complete, unavailable/frozen balance, or unmet compliance/approval gate | Safe backend error; submit remains unavailable and no optimistic debit is displayed. |
| N-EXT | Trace, network egress, or a response that exposes the flag indicates a third-party execution for a local API | Fail the run. No local preview/list/quote/issue path may call or fall back to Cregis. Where the public DTO exposes `externalProviderCalled`, it must be `false`; Cregis is not an acceptable substitute. |

Record the response status, public error classification, trace ID, mutation check, and reproduction path for every negative test. A server-side `5xx` is a failed UAT item unless the row explicitly verifies the expected unavailable-configuration `503` behavior.

## 5. Separate Cregis acceptance lane: confirmed deposit remains DEFERRED

This lane runs against the independently deployed Cregis SANDBOX backend, not through the PR #69 preview and not as a replacement for any P2–P7 proof. It validates the current pre-merge coordination boundary.

### Preconditions

- Use a Cregis SANDBOX tenant with a valid configured provider and a local customer liability/wallet account.
- Ensure `PR69_LOCAL_API_RELEASE_STATUS` is absent or is not exactly `MERGED_AND_UAT_ACCEPTED`; alternatively keep that tenant's `pr69LocalApiHandoffEnabled:false`.
- Record the local third-party order ID and use a signed, exact-amount Cregis test `paid` callback through the approved callback route. Do not expose the signature or raw body in evidence.

| # | Action | Required result |
| --- | --- | --- |
| C1 | Create one Cregis SANDBOX deposit order with a unique idempotency key. | A tenant/customer-scoped local order is `PENDING`; the browser talks only to FastLink backend, never directly to Cregis. |
| C2 | Deliver the verified, exact-amount signed `paid` callback. | One verified callback receipt, one confirmed local order, and exactly one balanced local journal are committed. The customer local ledger/available balance reflects the canonical string amount according to local ledger rules. |
| C3 | Inspect the coordination/audit event. | Exactly one `CREGIS_DEPOSIT_PR69_HANDOFF` event is `DEFERRED`, with `PR69_RELEASE_GATE_NOT_READY` or `TENANT_PR69_HANDOFF_NOT_ENABLED`; `pr69LocalActionsTriggered:false`. |
| C4 | Inspect backend trace/audit/network egress for C2–C3. | No invocation of PR #69 local preview, transaction-list, card top-up quote, or card issue API; no synthetic `currencyId`; no local-chain/U-card action. Cregis has only written the local truth and deferred handoff. |
| C5 | Replay the same signed callback. | No second local journal, balance credit, callback event, or handoff event. |
| C6 | Send invalid signature, partial/amount-mismatch, and provider-unavailable cases. | Invalid/unsafe callbacks do not credit the local ledger; responses/logs remain redacted and the order is rejected, failed, or manual-review according to the backend contract. |

Do **not** test `REQUESTED` cross-workflow execution before PR #69 has merged to `dev` and its complete authorized UAT has passed. Cregis must never directly invoke or emulate the four local APIs.

## 6. Result template

| Test ID | Pass / fail / blocked | HTTP status | Public IDs and trace ID | Evidence link | Owner | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | | | | | | |
| P1 | | | | | | |
| P2–P9 | | | | | | |
| N-AUTH through N-EXT | | | | | | |
| C1–C6 | | | | | | |

Classify each unresolved item as `FRONTEND`, `BACKEND_LOCAL_API`, `CREGIS_SEPARATE`, or `ENVIRONMENT`. The Worker preview policy and runtime SHA are environment gates, not code defects. PR #69 remains Draft and cannot merge until the final validation checklist is entirely complete.
