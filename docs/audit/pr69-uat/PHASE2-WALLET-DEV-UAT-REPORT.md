# Phase2 Wallet DEV UAT Execution Report

**Result:** browser access gate **PASS**; read-only SANDBOX UAT **not accepted**. PR #69 remains Draft and must not merge.

Frontend remediation and the still-required SANDBOX/backend retest are tracked in [PR69-UAT-DEFECT-REMEDIATION.md](PR69-UAT-DEFECT-REMEDIATION.md).

## Candidate and execution evidence

- Preview: `https://fastlink-wallet-pr-69-dev.adhesive-snowshoe.workers.dev/`
- Observed environment: `SANDBOX`
- Runtime banner: `b1b3e93506e9175159eea16805e43fe3bda831d2`
- Browser access: authenticated wallet page rendered and the existing onchain deposit-address response page rendered `{"items":[]}`. The earlier recorded response for that read-only endpoint was HTTP `200`.
- Policy gate: **PASS**. No administrator-policy block was reproduced; the earlier session `401 AUTH_SESSION_REVOKED` was resolved by the approved re-login and is not a policy failure.
- Read-only scope: no deposit intent, withdrawal, address allocation, card issue, Card top-up, transfer, or FX conversion was submitted. One synthetic FX **quote-only** request for string amount `"1"` was made; the UI states it performs no conversion or funds movement.

The preview reports the locked baseline SHA, but it does not expose the newer local-contract implementation committed in `e9400f60ae1559036bd7a34d394cc99ea3319005`: the deposit page has no independent preview action, and Card issue still presents an ISO-currency field rather than `currencyId`. This is a candidate/build mismatch for the four new API acceptance items, not evidence that those APIs have passed in a deployed browser.

## Module result

| Module | Rendering and navigation | Interface result | UAT result |
| --- | --- | --- | --- |
| Assets | **PASS** — Assets link navigates to `#wallet-assets`; EUR, MYR, SGD, USD and USDT render ledger/pending/available backend values. | Data is visible; the page also shows the shared API-timeout banner below. | Partial pass; dependent failures recorded below. |
| Deposit | **PASS** for module navigation/rendering. | `API timeout · HTTP 408 · Trace 6e38dfe5-9fd2-4398-a379-def035b20f9e`; no active address; create intent remains disabled. Existing read-only address response is `{"items":[]}`. No address allocation or deposit write was attempted. | **BLOCKED/FAIL** — no active address and no deployed independent preview flow. |
| Withdrawal | **PASS** for module navigation/rendering. | Same HTTP `408` banner; no saved address is eligible; backend-preview button is disabled and free-text destination is correctly absent. No withdrawal write was attempted. | **BLOCKED/FAIL** — missing eligible address/test data and unresolved API timeout. |
| Transactions | **PARTIAL PASS** — Activity link navigates to `#wallet-activity`; persisted all-account activity rows render, including historical deposit/withdrawal/internal-transfer states. | The owned wallet transaction panel reports `Wallet transaction history unavailable for this session`; the current runtime does not expose a verifiable independent v2 onchain transaction-list flow. | **FAIL** for the required local onchain-history acceptance item. |
| Cards | **PASS** for cards-module navigation and disabled-state rendering. | No cards or Card products returned; Card top-up/opening-quote actions are disabled. The legacy virtual-card form is enabled but asks for `ISO currency, e.g. USD`, not canonical `currencyId`; it was not submitted. | **FAIL** — unavailable test data plus deployed UI does not match the `currencyId` contract. |
| FX | **PASS** for rendering. | A non-financial synthetic quote-only request was allowed with amount string `"1"`; UI returned `FX quote unavailable for this session. No conversion was performed. No unvalidated quote displayed.` | **FAIL (fail-closed behavior correct)** — quote cannot be accepted in this session. |

## Defects and dependencies

| ID | Classification | Evidence | Impact / required owner action |
| --- | --- | --- | --- |
| UAT-01 | Backend API / environment | Shared UI banner: HTTP `408`, trace `6e38dfe5-9fd2-4398-a379-def035b20f9e`. | Identify the timed-out endpoint and restore its SANDBOX response; it blocks onchain setup and may affect quote-dependent flows. |
| UAT-02 | SANDBOX test-data / backend configuration | Deposit-address list is empty and the UI has no active address. | Provision or expose an active tenant/customer local deposit address through the approved setup path; do not allocate one during read-only UAT. |
| UAT-03 | SANDBOX test-data / backend configuration | Withdrawal page has no eligible saved address. | Provide an eligible saved address that has passed the required cooling/compliance setup. |
| UAT-04 | Backend local API / session data | Owned wallet transaction history is unavailable while aggregate activity renders. | Diagnose the scoped transaction-history response; retain tenant/customer isolation and fail-closed behavior. |
| UAT-05 | Environment build mismatch | Runtime reports `b1b3e935…`; deposit has no independent preview control and Card issue uses ISO `currency`, contrary to the `e9400f6` local API contract. | Deploy an authorized candidate containing the frontend local-contract implementation and paired backend `c18409a…`; verify runtime SHA before re-running the four API checks. |
| UAT-06 | Backend API / environment | Synthetic FX quote returns an unavailable state; no quote is displayed and no conversion occurs. | Restore the SANDBOX quote dependency or return the documented safe error with diagnosable trace ownership. |

## Safety and ownership conclusions

- The policy/access gate is no longer a UAT blocker.
- Fail-closed behavior was observed where inputs/data were unavailable: deposit intent, withdrawal preview/submit, Card funding, and FX conversion were not enabled; the failed FX quote displayed no unvalidated data.
- No Cregis provider action was invoked or used as a substitute. Cregis `DEFERRED` acceptance remains a separate backend lane.
- Current failures are not sufficient to label a frontend code defect except the candidate/runtime mismatch in UAT-05; the other failures require backend/environment/test-data triage first.

## Resume gate

1. Resolve UAT-01 through UAT-06 and publish an authorized preview containing the local API candidate, with a verifiable runtime SHA.
2. Re-run the non-mutating browser checks, then obtain explicit approval before any financial write required by the full UAT runbook.
3. Complete the remaining positive and negative cases in [PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md](PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md) and record the final decision in [PR69-FINAL-MERGE-VALIDATION.md](PR69-FINAL-MERGE-VALIDATION.md).

PR #69 cannot merge until the four FastLink-owned local APIs are accepted in the authorized runtime **and** the complete SANDBOX UAT passes.

## 2026-08-25 read-only retest evidence

**Result:** **not accepted**. The preview was reachable, the authenticated
SANDBOX session loaded, and the runtime banner still identified
`b1b3e93506e9175159eea16805e43fe3bda831d2`. This is the locked baseline,
not an authorized candidate containing the subsequent local remediation
commits. No address allocation, deposit intent, withdrawal preview/submit,
Card quote/top-up/issue, transfer, FX quote, or conversion was clicked.

| Ordered module | Observed result | Retest decision |
| --- | --- | --- |
| Assets | After the initial load, EUR, MYR, SGD, USD and USDT backend balances rendered. | **PASS** for read-only rendering. |
| Deposit | Module navigation worked. There was no active address; network/allocation/intent controls were disabled. | **FAIL, safely blocked** — UAT-02 remains. |
| Withdrawal | Module navigation worked. No saved address was eligible and the fee-preview control remained disabled; direct destination entry was absent. | **FAIL, safely blocked** — UAT-03 remains. |
| Transactions | Activity navigation worked, but the scoped Wallet-history panel ended at `Wallet transaction history unavailable for this session`. | **FAIL** — UAT-04 remains. |
| Cards | Card module rendered a product display with `flp_asset_usd`, but the legacy virtual-card form still rendered `ISO currency, e.g. USD`. The opening-quote action was deliberately not invoked. | **FAIL** — UAT-05 remains; runtime/build mismatch is directly reproduced. |
| FX | FX rendered but the quote button remained disabled; no quote or conversion was requested. | **FAIL, safely blocked** — UAT-06 remains. |

During the settled read, the wallet panel also showed `API timeout · HTTP 408`
with trace `5123fb44-3e0c-47fa-b85f-357fd641c126`. The affected route is not
identified by the UI, so this is additional evidence for UAT-01 rather than a
claim that any specific API was repaired. The UI showed no cross-account or
unvalidated response alongside the timeout.

## 2026-08-25 authorized-candidate deployment attempt

The complete candidate lineage through
`a03ab50ec8617026ea90419e9f1e6ea650ceea6f` was pushed to
`feature/phase2-onchain-client`. It is a descendant of the locked baseline
and includes the actual frontend remediation commit `3a430fa`.

The repository's `Deploy Wallet PR 69 Preview` workflow was automatically
triggered as run
[`32852980731`](https://github.com/xw564477242-cmyk/fastlik-app/actions/runs/32852980731).
It failed before any job step or Worker deployment because GitHub environment
protection rejected that branch for `cloudflare-wallet-dev`:

> Branch `feature/phase2-onchain-client` is not allowed to deploy to
> `cloudflare-wallet-dev` due to environment protection rules.

No new preview URL or runtime SHA was produced. This is an **environment
authorization blocker**, not a code, Cregis, migration, or financial-operation
failure. Do not bypass the rule or retry until the environment owner explicitly
authorizes this branch for the isolated PR #69 preview environment.

## 2026-08-25 authorized candidate read-only UAT

**Candidate:** [workflow run 32853726327](https://github.com/xw564477242-cmyk/fastlik-app/actions/runs/32853726327)
passed the isolated SANDBOX variables, immutable UAT package, build, Worker
deployment, runtime SHA verification, and fail-closed Origin check. Browser
evidence confirmed the same isolated preview URL, authenticated Cookie-Session,
`SANDBOX`, and runtime SHA
`822ee2223738a7be0cd84724c63cdb3216cdb392`.

**Decision:** **not accepted**. No financial, address-allocation, card quote,
card issue, transfer, withdrawal, or FX quote/conversion control was clicked.
All recorded controls stayed in their safe disabled state when required data
was absent.

| Ordered module | Observed candidate behavior | Result |
| --- | --- | --- |
| Assets | Authenticated asset snapshot rendered EUR, MYR, SGD, USD and USDT balance data. | **PASS** for page rendering. |
| Deposit | New local-preview UI rendered, but no tenant-scoped SANDBOX deposit address was returned. Preview remained disabled; allocation was not clicked. | **FAIL / safe block** — UAT-02. |
| Withdrawal | No eligible tenant-scoped SANDBOX saved address was returned. Direct entry and backend-fee preview remained disabled. | **FAIL / safe block** — UAT-03. |
| Onchain history | The new `Onchain transactions` panel rendered, but returned a safe unavailable state with reference `7194b040-d706-4544-abf8-a4eccc2c83a0`. The old session-unavailable copy was not shown. | **FAIL** — UAT-04 remains a local-backend API/contract issue. |
| Cards | The card-products read timed out safely: HTTP 408, reference `9f3828b7-4488-4c49-af34-1b1536c27e9c`; quote/top-up controls stayed disabled. The virtual-card form now says `Local currency asset ID, e.g. flp_asset_usd`, and no ISO-currency field was rendered. | **UAT-01 FAIL; UAT-05 PASS (UI contract)**. |
| FX | FX controls rendered but quote remained disabled without a verified executable input; no quote or conversion was requested. | **Partial pass** — fail-closed behavior is correct; UAT-06 error-response copy was not re-exercised under the read-only restriction. |

Cregis was not invoked and did not supply any fallback data or substitute for
the four FastLink-owned local APIs.

## 2026-08-25 local-backend repair prepared for SANL-X retest

This is a **local code-completion record only**. It is not a deployment result:
the currently observed Worker runtime remains
`1f831ca49e778a5f69967bbe1b2f80e346a2ddd3`, and no backend deployment,
migration, merge, funding action, address allocation, card action, or FX
conversion was performed for this repair.

| Defect | Local backend repair | Status for browser UAT |
| --- | --- | --- |
| UAT-01 Card product HTTP 408 | `GET /api/v1/cards/products` now uses a bounded, safe local read with one retry for transient Prisma/HTTP failures. A persistent failure becomes `503 CARD_PRODUCT_READ_UNAVAILABLE`; no tenant product is fabricated and no Card provider is called. | **Fixed in local backend candidate / pending paired SANL-X preview** |
| UAT-04 onchain history unavailable | `GET /api/v2/wallet/onchain/transactions` now treats HTTP 408/429/5xx and additional transient Prisma failures as retryable local reads and returns the existing fail-closed `503 LOCAL_CHAIN_READ_UNAVAILABLE` envelope only after the bounded retry. Its newly issued signed cursor is opaque base64url, matching WalletGateway; dotted legacy cursors remain readable. | **Fixed in local backend candidate / pending paired SANL-X preview** |
| UAT-06 quote-only FX error | `POST /api/v1/wallet/fx/quotes` now normalizes a transient quote failure to `503 FX_QUOTE_ONLY_UNAVAILABLE` with the explicit statement that no conversion or funds movement occurred. It performs no ledger, treasury, Card, or conversion write. | **Fixed in local backend candidate / pending explicitly authorized quote-only read** |
| UAT-02 / UAT-03 addresses | No application-code change: missing deposit/withdrawal addresses remain intentional fail-closed states. | **SANL-X fixture dependency** |

The next permitted browser action is the read-only list in
[PR69-SANL-X-READONLY-RETEST.md](PR69-SANL-X-READONLY-RETEST.md), after an
immutable paired candidate containing these backend fixes is made available.

## 2026-08-25 paired-candidate and SANL-X fixture attempt

**Decision:** **UAT not run / not accepted.** This is a deployment-and-fixture
gate record, not a business-flow result.

- The isolated Worker deployment [run 32857121582](https://github.com/xw564477242-cmyk/fastlik-app/actions/runs/32857121582) passed. Its read-only
  `/healthz` and `/runtime-config.js` responses both report `SANDBOX` and
  frontend build `1c38f54b7a0ac0abc5aad2e6b0d6068da5bdc383`.
- The browser retained an already loaded `1f831ca...` document at the same
  URL. That client-cache observation is not substituted for the Worker health
  manifest and does not establish a paired backend runtime.
- Backend candidate `ac2433008acdfc9ba3098aa8763dd9f3dd6d5b30` passed the
  local no-migration Backend PR Gate: 158/158 suites, 1411/1411 tests, lint,
  build, and secret scan. Its Card top-up signing-config failure path fails
  closed before Card/Wallet reads or a transaction, and it has **not** been
  deployed.
- Railway target verification showed `fastlink-backend-dev / development-A`
  with `FASTLINK_ENVIRONMENT=SANDBOX`; its current deployment remains
  `a953097...`. The candidate deployment manifest would execute
  `prisma migrate deploy`. Because this task prohibits any migration command,
  no backend deployment was attempted.
- No SANL-X fixture was created. The available
  `PHASE2_SANDBOX_TEST_FIXTURES_ENABLED` switch has no SANL-X tenant/customer
  allowlist and would create deterministic records for any eligible empty
  SANDBOX scope. Enabling it would violate fixture isolation. No test address,
  Card product, source account, Card, or transfer was written.

Accordingly, UAT-01/04/06 remain **backend candidate validated, pending paired
deployment**, and UAT-02/03 remain **fixture blocked**. The ordered browser
retest was intentionally not performed against the stale backend.
