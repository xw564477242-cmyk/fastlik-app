# PR #69 Final Pre-Merge Validation Checklist

**Decision rule:** every required box must be checked with linked evidence. A passing local test suite, Cregis completion, a policy allowlist without browser proof, or an old Worker build is not a merge substitute.

## A. Scope and lineage

- [ ] PR remains Draft throughout validation; no migration, merge, or production deployment is initiated from this checklist.
- [ ] Frontend candidate lineage is recorded: baseline `b1b3e93506e9175159eea16805e43fe3bda831d2`, implementation `e9400f60ae1559036bd7a34d394cc99ea3319005`, and UAT documentation `a620ab5e69fcf7c0e46ef8f7db9462a89b1bfb50`.
- [ ] Paired local backend candidate `4fb069c180f736f312a282218dc1610b509aaf79` is the one in the authorized candidate deployment.
- [ ] Cregis work remains isolated on `feature/ucard-core-saas-platform`; it neither implements nor invokes the four PR #69 local APIs.
- [ ] No unrelated worktree change, shared DEV mutation, migration execution, or environment configuration edit is represented as PR #69 proof.

## B. Four FastLink-owned local API gates

- [ ] **Independent deposit preview:** `POST /api/v2/wallet/onchain/deposits/preview` enforces Cookie-Session/CSRF, tenant/customer/environment-owned active address, canonical string amount, opaque expiry-bound preview, and no ledger/provider mutation. Expiry/tamper/scope mismatch fails closed.
- [ ] **Onchain history:** `GET /api/v2/wallet/onchain/transactions` derives tenant/customer/environment server-side, has no caller `tenantId`, returns only locally persisted public records, and rejects invalid/cross-scope cursor or out-of-range limit.
- [ ] **Card top-up quote:** `POST /api/v1/cards/{cardId}/topup-quotes` returns a tenant-scoped string-only immutable quote without mutation. The corresponding top-up requires the matching quote/source and idempotency key, consumes it exactly once, and posts the balanced local ledger atomically.
- [ ] **Card `currencyId`:** virtual and physical issuance require a canonical tenant-local enabled `currencyId`, return that same ID, reject bare ISO/legacy/foreign/unsupported input, and preserve idempotency.
- [ ] Trace/network evidence proves no Cregis/third-party call or fallback occurs. Where a public DTO exposes `externalProviderCalled`, its value is `false`.

## C. Automated and review evidence

- [x] Backend candidate `4fb069c...` passed the local no-migration Backend PR Gate: 158/158 suites and 1411/1411 tests; lint, build, and secret scan passed.
- [ ] Paired backend focused tests: 8 suites / 72 tests pass (onchain service/OpenAPI; card top-up; cards service/OpenAPI; end-user FX quote/OpenAPI; fee policy).
- [ ] Paired backend candidate includes the UAT-01 bounded Card-product read, UAT-04 local-chain history retry/base64url-cursor compatibility, and UAT-06 `FX_QUOTE_ONLY_UNAVAILABLE` non-financial response; the targeted service/OpenAPI suites and production build pass.
- [ ] Paired backend production build and modified-file lint pass.
- [ ] Frontend local API gateway/contract suite, full regression, production build, Cloudflare contract suite, and secret/architecture checks pass against the candidate source.
- [ ] Review confirms every sensitive local database read/write uses server-derived tenant/customer/environment scope; every financial DTO field is a string; previews/quotes are HMAC-bound, expiry-bound, and fail closed.
- [ ] Review confirms no migration is needed or was executed for this change.
- [ ] Review confirms error envelopes are safe: no secret, raw provider payload, foreign tenant record, or client-computed financial data is exposed.

## D. Authorized environment gate

- [x] Verifiable browser access to the Worker preview domain was observed in SANDBOX on 2026-08-25; no policy bypass was used.
- [x] The isolated PR #69 Worker candidate [run 32858471506](https://github.com/xw564477242-cmyk/fastlik-app/actions/runs/32858471506) is deployed with manifest SHA `1f2d794d367dea471e7db128d87be3179de1365e`; it is not shared DEV.
- [ ] Candidate backend release uses the separately reviewed [no-migration deployment design](PR69-CANDIDATE-RELEASE-AND-SANLX-FIXTURE-DESIGN.md): its descriptor omits `preDeployCommand`, uses only a sealed database-enforced read-only connection to the existing shared DEV schema, and no migration/DDL/reset/seed command was run.
- [ ] Candidate routing is isolated: Worker build `1f2d794...` reaches only the candidate backend, `GET /api/health` proves backend `releaseSha` `4fb069c...`, and both runtimes report `SANDBOX`. Neither current shared DEV route nor production route is changed.
- [ ] A paired backend candidate is deployed without a prohibited migration and its runtime SHA is independently verifiable. The local no-migration Backend PR Gate for `4fb069c...` is green, but the active SANDBOX backend remains older.
- [ ] An allowlisted SANDBOX Cookie-Session and scoped in-memory SANL-X
  deposit-address, withdrawal-address, Card-product, and optional history
  fixture objects are available through approved setup. No source wallet,
  Card, ledger, address, or other DEV database record is created for UAT.
- [ ] SANL-X fixture manifest is signed, expiring, release/read-only-database-scope-bound, and allows only the exact server-derived tenant/customer/environment scope. The legacy global fixture switch is disabled; both a second customer in the candidate tenant and a neighboring SANDBOX tenant prove they receive no fixtures.
- [ ] SANL-X fixture manifest proves the listed address, Card-product and local-chain-history fixture objects are tenant/customer/environment scoped and no test fixture enables a browser write action. Fixture provisioning is non-public, idempotent, audited, process-memory-only, and calls no external provider or database write path.
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
- [ ] User authorization and Codex execution record confirm Section D.
- [ ] UAT owner confirms Sections E–F and attaches the completed result table.
- [ ] Release owner confirms the two PR #69 merge prerequisites are both met: **(1) all four local APIs are complete and accepted; (2) the authorized SANDBOX browser UAT is complete and accepted.**

Only then may the release owner decide to merge PR #69 into `dev`. This checklist does not itself grant merge authority.
