# Phase2 Wallet DEV UAT Execution Report

**Result:** browser access gate **PASS**; read-only SANDBOX UAT **not accepted**. PR #69 remains Draft and must not merge.

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
