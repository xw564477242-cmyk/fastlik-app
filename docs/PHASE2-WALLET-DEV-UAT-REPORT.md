# Phase2 Wallet DEV UAT Execution Report

Status: blocked before authenticated browser execution

## Candidate and evidence

- Draft PR: `#69`, base `dev`, head `feature/phase2-onchain-client`
- Candidate SHA at initial gate: `7f70b02927ee22076856a89cc696700cef707311`
- PR gate run: `32447363047` — PASS
- Evidence artifact: `9434528157`
- Artifact digest: `sha256:252bb04d5e37df82f8bbc220370f32b0af5925f6bd047c18b1dd36669e6bb663`
- Current shared Wallet DEV SHA: `40766ae378ed23631e17bae107ffb974517c8e56`

The shared DEV deployment does not contain the PR candidate. A browser result from that URL would therefore not be valid acceptance evidence for this change.

## Automated frontend result

| Area | Result | Evidence |
|---|---|---|
| WalletGateway and shared DTO parsing | PASS | 13/13 targeted tests |
| Repository regression | PASS | 393 total; 266 pass; 127 environment-gated skip; 0 fail |
| TypeScript and production build | PASS | PR gate |
| Cookie/CSRF and legacy-auth removal | PASS | architecture test and PR gate |
| Cloudflare runtime contract | PASS | PR gate |
| Secret scan | PASS | PR gate |

## Live DEV execution blockers

| ID | Classification | Observation | Required resolution |
|---|---|---|---|
| ENV-01 | Environment | Shared DEV runs `40766ae`, not this PR head | Provide an isolated PR preview deployment, or explicitly authorize temporary deployment of the PR head to shared DEV without merging |
| ENV-02 | Environment | Browser security policy denied access to the Wallet DEV Worker during this run | Restore the browser policy check or provide an approved browser surface that can access the Worker |
| ENV-03 | Credentials | Dedicated DEV end-user credentials are not present in the repository or local environment and GitHub Secret values are intentionally unreadable | Make the dedicated account available through an approved login handoff; do not place its password in Git, PR, CI logs or this report |

No authenticated financial write was attempted while these conditions were unresolved.

## Confirmed defect/dependency classification

### Frontend defects confirmed in live DEV

None confirmed. Live candidate UAT did not start, so automated PASS results must not be represented as live browser acceptance.

### Backend API dependencies

| ID | Missing/frozen contract | Frontend behavior |
|---|---|---|
| BE-API-01 | Standalone onchain deposit preview | No fabricated preview; fees appear only on the created transfer response |
| BE-API-02 | Onchain transfer-history list | Track only transfer IDs created in the active Session; retain P1 Wallet transaction history |
| BE-API-03 | Dedicated Card top-up quote | Do not calculate or synthesize a quote in the browser |
| BE-API-04 | Card create `currencyId` | Product catalog displays `assetId`; frozen Card write continues to send its existing `currency` DTO |

## Resume gate

After ENV-01 through ENV-03 are resolved, execute every unchecked item in `PHASE2-WALLET-UAT-CHECKLIST.md` against the exact deployed candidate SHA. Record each failure with response status, trace ID, reproduction steps and either `FRONTEND` or `BACKEND_API_DEPENDENCY` ownership.
