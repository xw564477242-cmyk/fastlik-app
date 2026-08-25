# PR #69 SANDBOX UAT Defect Remediation

**Scope:** frontend-only source changes on `feature/phase2-onchain-client`. This record does not deploy, call a funding endpoint, create a card, allocate an address, execute a migration, or alter the paired backend/Cregis branches. PR #69 remains Draft.

## Safety boundary

- A read timeout is surfaced per affected resource and retains only previously verified same-scope data.
- Retry controls are user-initiated, read-only `GET` requests only. No POST, funding, withdrawal, card issue, address allocation, rotation, top-up, or FX conversion is retried automatically.
- Empty SANDBOX responses remain empty. The browser never fabricates a deposit address, withdrawal address, Card product, transaction, currency ID, or quote.
- Display ISO codes stay presentation-only. Card issue paths now reject a bare three-letter ISO value and require a local `currencyId`.

## UAT defect status

| ID | Frontend remediation | Current status | Retest evidence required |
| --- | --- | --- | --- |
| UAT-01 HTTP 408 | Isolated independently settled reads so one timeout cannot erase unrelated verified assets; exposed a clear HTTP 408 safe state plus one manual read retry for retryable onchain history. | **Frontend fixed / backend timeout still failing** | Candidate `822ee22` showed a safe card-products HTTP 408, reference `9f3828b7-4488-4c49-af34-1b1536c27e9c`. Backend must identify and resolve it. |
| UAT-02 empty deposit addresses | Added explicit no-active-address state. Deposit preview/intent stays disabled and the browser does not automatically allocate or invent an address. | **Frontend fixed / SANDBOX fixture still absent** | Approved backend setup supplies one active tenant/customer address, then preview is retested. |
| UAT-03 no withdrawal address | Added explicit tenant-scoped empty state; direct destination input remains absent and preview/submit remains disabled. | **Frontend fixed / SANDBOX fixture still absent** | Approved setup supplies an eligible saved address that satisfies cooling/compliance gates. |
| UAT-04 onchain history session unavailable | Added a scoped session-unavailable state and a manual `GET` history retry only for safe retryable failures. No aggregate activity is substituted for v2 chain history. | **Frontend fixed / local API still unavailable** | Candidate rendered a safe unavailable response with reference `7194b040-d706-4544-abf8-a4eccc2c83a0`, not the old session copy. Backend must return a local empty page or scoped records. |
| UAT-05 legacy ISO Card issue form | The current source uses `currencyId`; Phase2 product display labels the local identity as `currencyId`, and both physical and virtual Card request validation reject bare ISO values such as `USD`. | **PASS (UI contract)** | Candidate `822ee22` displayed only `Local currency asset ID, e.g. flp_asset_usd`; no legacy ISO field was rendered. No issue request was submitted. |
| UAT-06 FX unavailable | Kept the existing fail-closed behavior and added explicit timeout/session-safe placeholders. An unavailable quote never enables conversion and no unvalidated quote appears. | **Partial pass / error dependency pending** | No quote was requested under the read-only restriction; the disabled state prevented conversion. A later non-financial, explicitly authorized quote-only test is required to verify error copy. |

## Before / after

| Area | Before | After |
| --- | --- | --- |
| Shared read load | One rejected request caused a generic error path for all resources. | Every read settles independently; verified resources remain visible and each affected module owns its safe error state. |
| Empty data | Generic empty text could imply the user should create an address. | Explicit scoped SANDBOX empty states say that no address/product is invented or automatically allocated and writes remain disabled. |
| Card issue identity | UI had inconsistent “asset” wording and permissive local ID grammar allowed a bare ISO token. | UI calls it `currencyId`; the request builder and virtual/physical paths reject legacy three-letter ISO values. |
| FX error | One generic unavailable message. | Timeout and expired-session failures use a precise non-conversion placeholder; verified same-input quotes continue to be retained by the existing safety logic. |

## Remaining non-frontend dependencies

1. Identify and correct the SANDBOX service responsible for trace `6e38dfe5-9fd2-4398-a379-def035b20f9e`; this frontend change cannot remove a server-side timeout.
2. Provision approved, tenant-scoped non-funding fixtures for one deposit address, one saved withdrawal address, one Card product, an existing test card and source wallet account. Do not use browser-side mock data.
3. Publish an isolated authorized candidate containing the post-`e9400f6` source and matching paired local backend, then verify the immutable build SHA.
4. Re-run only the read-only UAT path first. Financial write coverage requires separate explicit authorization and is not authorized by this remediation.

## Candidate deployment gate — 2026-08-25

| ID | Classification | Evidence | Status / next action |
| --- | --- | --- | --- |
| ENV-PR69-01 | Environment authorization | Candidate `a03ab50` triggered [preview run 32852980731](https://github.com/xw564477242-cmyk/fastlik-app/actions/runs/32852980731), which was rejected before steps began: the branch is not allowed to deploy to `cloudflare-wallet-dev`. | **Blocked** — environment owner must authorize the existing PR branch for the isolated preview. No bypass, workflow edit, retry, or shared-environment deployment is authorized. |
