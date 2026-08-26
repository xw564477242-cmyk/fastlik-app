# PR #69 Local API Merge Checklist

Status: **do not merge while any item below is incomplete**.
Locked frontend commit baseline: `b1b3e93506e9175159eea16805e43fe3bda831d2`.
Scope: local FastLink onchain/U-card behavior only. Cregis and any third-party asset provider do not satisfy these checks.

Use [PR69-FINAL-MERGE-VALIDATION.md](PR69-FINAL-MERGE-VALIDATION.md) as the final sign-off record and [PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md](PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md) for the exact browser execution procedure. Current combined delivery status is recorded in [PR69-M1-M5-MILESTONES.md](PR69-M1-M5-MILESTONES.md).

## Non-negotiable merge gates

1. The four local APIs below are implemented, reviewed and tested in the paired Backend.
2. The PR #69 Worker preview domain is security-allowlisted and a real-browser DEV UAT completes assets → deposit → withdrawal → onchain transactions → card → FX.

Gate 2 is an environment/security policy dependency, not a code defect. No browser-policy bypass, mock evidence, or fabricated successful UAT may substitute for it.

The Worker preview policy may be allowlisted while the currently deployed preview still serves an older build. In that case it is only an access check, not evidence for these local APIs: deploy the authorized PR #69 build, verify its runtime build SHA, then repeat the complete browser UAT against that exact build.

## API acceptance criteria

| # | API | Required proof |
|---|---|---|
| 1 | `POST /api/v2/wallet/onchain/deposits/preview` | Cookie Session + CSRF required; tenant/customer-owned local address required; all monetary fields are strings; returns immutable `previewId`, fee facts, confirmation target and expiry; never posts to a ledger. Expired/tampered/cross-tenant/mismatched preview returns 409 and creates no transfer. |
| 2 | `GET /api/v2/wallet/onchain/transactions` | Cookie Session required; server derives tenant/customer and does not accept `tenantId`; filters/cursor are bounded; all records are locally persisted and contain only the public transfer DTO; cross-tenant IDs/cursors never expose data; opaque cursor mismatch is rejected. |
| 3 | `POST /api/v1/cards/{cardId}/topup-quotes` then `POST /api/v1/cards/{cardId}/topups` | Quote endpoint requires Cookie Session + CSRF and returns only backend-calculated string amounts/fees, `quoteId` and expiry; quote cannot reserve/mutate balance. Top-up requires matching source account + unused quote + idempotency key. One transaction atomically consumes quote and posts balanced local ledger entries. Missing configuration yields 503 fail-closed. |
| 4 | `POST /api/v1/cards/virtual` and `POST /api/v1/cards/physical` | Request accepts `currencyId`, not arbitrary ISO currency. Server resolves ID only in the authenticated tenant's enabled local product/asset catalog; request/response `currencyId` match; result is idempotent under same tenant/customer/payload; unsupported or foreign IDs yield a safe 4xx. |

## Backend unit/integration test evidence

- Tenant A cannot preview, list, quote, top up or issue against Tenant B's address, transfer, card, quote, asset or idempotency key.
- All API amounts reject numbers, floats, exponent notation, malformed signs, excess scale and empty strings; responses contain canonical string amounts.
- CSRF, missing session, stale session, invalid cursor and malformed DTOs fail closed without mutations.
- Repeated exact idempotency request returns the original completed local result; same key with changed body returns `IDEMPOTENCY_CONFLICT`.
- Preview/quote expiry, changed amount/source/card, replay and race consumption create no duplicate transfer or ledger posting.
- Top-up service covers transaction rollback if quote consumption, debit or credit fails.
- Card `currencyId` is scoped to `tenant_id`; a display currency never authorizes issuance by itself.
- No endpoint calls Cregis or any external provider. `externalProviderCalled` remains `false` on all four public local flows.

## Client/Worker proof in this PR branch

- `WalletGateway` is the only frontend boundary; requests use same-origin `/api`, Cookie Session and CSRF for mutating methods.
- Strict parsers reject malformed responses, numeric monetary fields and `externalProviderCalled=true`.
- The deposit UI requires a backend preview before an intent; Card funding requires a backend quote before top-up; virtual/physical issue passes `currencyId`.
- The Cloudflare Worker continues to proxy `/api` only; it contains no local financial controller, database or third-party call.

## DEV browser UAT evidence (after Worker preview allowlisting)

Record screenshots/network traces containing only public IDs and trace IDs:

1. Assets render from the authenticated tenant and no backend/provider internals appear.
2. Deposit: use an allocated local address, request preview, verify Backend fee/confirmation/expiry facts, create one idempotent intent, then refresh persisted state.
3. Withdrawal: verify saved-address, compliance and Backend fee gates remain fail-closed.
4. Onchain transactions: verify only the authenticated tenant's paginated list appears and filters/cursor remain scoped.
5. Card: request opening quote; issue with local `currencyId`; request Card top-up quote; execute once with fresh idempotency key; confirm local result.
6. FX: run the existing backend quote-only flow; do not infer rates or execute unapproved conversion.

## AI validation checklist

- [ ] Working branch is `feature/phase2-onchain-client` at the approved PR #69 lineage; no Cregis branch files changed.
- [ ] No migration was executed and no shared DEV, Railway, backend deployment, PR merge or push occurred as part of this implementation step.
- [ ] All new local APIs remain FastLink-owned; Cregis cannot replace any of the four acceptance rows.
- [ ] Every tenant-sensitive database read/write in the paired Backend has an explicit `tenant_id` predicate/value.
- [ ] Every financial amount is a string; no browser code performs financial arithmetic.
- [ ] Every financial write has an idempotency boundary and every preview/quote is immutable, expiring and fail-closed.
- [ ] Browser Worker preview allowlisting and complete DEV UAT are separately recorded before PR #69 merge approval.
