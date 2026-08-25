# Phase2 Wallet DEV UAT Execution Report

Status: blocked before authenticated browser execution against the authorized PR #69 build

## Candidate and evidence

- Draft PR: `#69`, base `dev`, head `feature/phase2-onchain-client`
- Locked PR #69 baseline: `b1b3e93506e9175159eea16805e43fe3bda831d2`
- PR gate run: `32447363047` — PASS
- Evidence artifact: `9434528157`
- Artifact digest: `sha256:252bb04d5e37df82f8bbc220370f32b0af5925f6bd047c18b1dd36669e6bb663`
- Current shared Wallet DEV SHA: `40766ae378ed23631e17bae107ffb974517c8e56`

The requested Worker allowlisting has not yet been independently verified: the current Browser session is still rejected because its admin-enforced policy cannot be verified. No bypass was attempted. Even after that access condition is demonstrably restored, the currently opened preview serves an older build, so it cannot be acceptance evidence for this change. An authorized PR #69 deployment and runtime SHA verification are still required before UAT begins.

## Automated frontend result

| Area | Result | Evidence |
|---|---|---|
| Local API gateway/contracts | PASS | Deposit preview, tenant-scoped onchain list, Card top-up quote and `currencyId` contract tests |
| Repository regression | PASS | 405 total; 278 pass; 127 environment-gated skip; 0 fail |
| TypeScript and production build | PASS | Local production build |
| Cookie/CSRF and legacy-auth removal | PASS | Architecture test and PR gate |
| Cloudflare runtime contract | PASS | Local Cloudflare contract suite |
| Secret scan | PASS | Existing PR gate |

## Live DEV execution blockers

| ID | Classification | Observation | Required resolution |
|---|---|---|---|
| ENV-01 | Environment | Opened preview still serves an older build; its runtime SHA is not the authorized PR #69 candidate | Deploy the authorized PR #69 build to an isolated preview, verify the runtime SHA, then run UAT against that exact URL |
| ENV-02 | Environment/security policy | Browser access to the opened Worker preview is still rejected because the admin-enforced policy cannot be verified | Security/admin owner must restore verifiable access. Do not bypass the policy; after recovery, it remains only an access condition and not UAT evidence for an older deployed build. |
| ENV-03 | Credentials | Dedicated DEV end-user credentials are not present in the repository or local environment and GitHub Secret values are intentionally unreadable | Make the dedicated account available through an approved login handoff; do not place its password in Git, PR, CI logs or this report |

No authenticated financial write was attempted while these conditions were unresolved.

## Confirmed defect/dependency classification

### Frontend defects confirmed in live DEV

None confirmed. Live candidate UAT did not start, so automated PASS results must not be represented as live browser acceptance.

### Paired Backend local API acceptance

| ID | Required FastLink-owned contract | Client behavior and remaining evidence |
|---|---|---|
| BE-API-01 | Standalone onchain deposit preview | Client requires `previewId` before it can create an intent; Backend unit/integration proof and deployed UAT remain required |
| BE-API-02 | Tenant-scoped onchain transaction list | Client requests the bounded list without `tenantId`; Backend isolation/cursor proof and deployed UAT remain required |
| BE-API-03 | Dedicated Card top-up quote | Client requires backend `quoteId` before top-up; Backend atomic quote/ledger proof and deployed UAT remain required |
| BE-API-04 | Card create `currencyId` | Client sends tenant-scoped local `currencyId`, not display ISO currency; Backend catalog/idempotency proof and deployed UAT remain required |

## Resume gate

After ENV-01 and ENV-03 are resolved, execute every unchecked item in `PHASE2-WALLET-UAT-CHECKLIST.md` against the exact authorized deployed candidate SHA. The ordered human procedure, including required fail-closed and isolated Cregis `DEFERRED` evidence, is [PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md](PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md). Record each failure with response status, trace ID, reproduction steps and either `FRONTEND` or `BACKEND_API_DEPENDENCY` ownership. Do not merge PR #69 until the four paired Backend local APIs and the complete browser DEV UAT are both accepted.
