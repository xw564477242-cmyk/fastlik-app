# PR #69 Final Pre-Merge Validation Checklist

**Decision rule:** every required box must be checked with linked evidence. A passing local test suite, Cregis completion, a policy allowlist without browser proof, or an old Worker build is not a merge substitute.

## A. Scope and lineage

- [ ] PR remains Draft throughout validation; no migration, deployment, push, or merge is initiated from this checklist.
- [ ] Frontend candidate lineage is recorded: baseline `b1b3e93506e9175159eea16805e43fe3bda831d2`, implementation `e9400f60ae1559036bd7a34d394cc99ea3319005`, and UAT documentation `a620ab5e69fcf7c0e46ef8f7db9462a89b1bfb50`.
- [ ] Paired local backend candidate `c18409aacca49d2f030ac3aaaef6d57626c31f27` is the one in the authorized candidate deployment.
- [ ] Cregis work remains isolated on `feature/ucard-core-saas-platform`; it neither implements nor invokes the four PR #69 local APIs.
- [ ] No unrelated worktree change, shared DEV mutation, migration execution, or environment configuration edit is represented as PR #69 proof.

## B. Four FastLink-owned local API gates

- [ ] **Independent deposit preview:** `POST /api/v2/wallet/onchain/deposits/preview` enforces Cookie-Session/CSRF, tenant/customer/environment-owned active address, canonical string amount, opaque expiry-bound preview, and no ledger/provider mutation. Expiry/tamper/scope mismatch fails closed.
- [ ] **Onchain history:** `GET /api/v2/wallet/onchain/transactions` derives tenant/customer/environment server-side, has no caller `tenantId`, returns only locally persisted public records, and rejects invalid/cross-scope cursor or out-of-range limit.
- [ ] **Card top-up quote:** `POST /api/v1/cards/{cardId}/topup-quotes` returns a tenant-scoped string-only immutable quote without mutation. The corresponding top-up requires the matching quote/source and idempotency key, consumes it exactly once, and posts the balanced local ledger atomically.
- [ ] **Card `currencyId`:** virtual and physical issuance require a canonical tenant-local enabled `currencyId`, return that same ID, reject bare ISO/legacy/foreign/unsupported input, and preserve idempotency.
- [ ] Trace/network evidence proves no Cregis/third-party call or fallback occurs. Where a public DTO exposes `externalProviderCalled`, its value is `false`.

## C. Automated and review evidence

- [ ] Paired backend focused tests: 5 suites / 45 tests pass (onchain service/OpenAPI; card top-up service; cards service/OpenAPI).
- [ ] Paired backend production build and modified-file lint pass.
- [ ] Frontend local API gateway/contract suite, full regression, production build, Cloudflare contract suite, and secret/architecture checks pass against the candidate source.
- [ ] Review confirms every sensitive local database read/write uses server-derived tenant/customer/environment scope; every financial DTO field is a string; previews/quotes are HMAC-bound, expiry-bound, and fail closed.
- [ ] Review confirms no migration is needed or was executed for this change.
- [ ] Review confirms error envelopes are safe: no secret, raw provider payload, foreign tenant record, or client-computed financial data is exposed.

## D. Authorized environment gate

- [x] Verifiable browser access to the Worker preview domain was observed in SANDBOX on 2026-08-25; no policy bypass was used.
- [ ] The preview is an isolated, authorized PR #69 candidate deployment—not a shared DEV or an older preview.
- [ ] Runtime build SHA is visible or otherwise independently verifiable and exactly matches the deployment manifest and the candidate lineage recorded above.
- [ ] Dedicated SANDBOX tenant, dedicated end-user Cookie-Session, active deposit address, source wallet account, existing test card, enabled local card product, and saved withdrawal address are available through approved setup.
- [ ] Evidence storage is approved and redacts cookies, CSRF values, secrets, callback signatures/raw bodies, and full financial identifiers.

## E. Browser SANDBOX UAT gate

- [ ] Execute and pass P0–P9 in [the authorized SANDBOX runbook](PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md): assets → deposit preview/intent → onchain history → card top-up quote/settlement → card `currencyId` issue → withdrawal → FX.
- [ ] Execute and pass every required negative case N-AUTH through N-EXT. Each fails closed without a prohibited mutation or data disclosure.
- [ ] Browser UI, redacted network trace, and persisted refresh agree for every accepted financial state; all financial strings exactly match backend responses.
- [ ] Every failure is logged with status, trace ID, reproduction, evidence, and a single owner classification: `FRONTEND`, `BACKEND_LOCAL_API`, or `ENVIRONMENT`.
- [ ] There are no unresolved P0–P9/N-* failures or blocks.

## F. Separate Cregis coordination acceptance

- [ ] On the Cregis SANDBOX backend, an exact signed deposit callback posts one balanced local journal and local customer balance only once.
- [ ] With PR #69 release gate absent/invalid or tenant handoff disabled, one `CREGIS_DEPOSIT_PR69_HANDOFF` is `DEFERRED` with the expected reason.
- [ ] Trace/audit proof shows no invocation of PR #69 preview/history/top-up quote/card issue APIs and no synthetic `currencyId`.
- [ ] Callback replay, invalid signature, partial/mismatch, and provider-unavailable tests preserve local financial truth and fail closed.

## Approval

- [ ] Engineering owner confirms Sections A–C.
- [ ] Security/environment owner confirms Section D.
- [ ] UAT owner confirms Sections E–F and attaches the completed result table.
- [ ] Release owner confirms the two PR #69 merge prerequisites are both met: **(1) all four local APIs are complete and accepted; (2) the authorized SANDBOX browser UAT is complete and accepted.**

Only then may the release owner decide to merge PR #69 into `dev`. This checklist does not itself grant merge authority.
