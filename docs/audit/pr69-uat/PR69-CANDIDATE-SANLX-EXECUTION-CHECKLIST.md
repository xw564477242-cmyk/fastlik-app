# PR #69 Candidate Release + SANL-X Fixture Execution Checklist

**Use:** Codex-operated SANDBOX execution checklist. This document does not
authorize deployment, migration, merge, production access, Cregis change, or
financial action. PR #69 remains Draft throughout.

**Required candidate pair:**

- Backend source: `4fb069c180f736f312a282218dc1610b509aaf79`
- Worker source: `1f2d794d367dea471e7db128d87be3179de1365e`
- Environment: exact `SANDBOX`

Related design and test procedure:
[candidate/fixture safety design](PR69-CANDIDATE-RELEASE-AND-SANLX-FIXTURE-DESIGN.md)
and [read-only retest checklist](PR69-SANL-X-READONLY-RETEST.md).

---

## 0. Universal stop rules

- [ ] PR #69 is still Draft; no Ready-for-review, merge, release promotion, or
  production deployment is planned.
- [ ] Codex confirms this run performs no real funding, address
  allocation, withdrawal, transfer, Card issue, Card top-up, FX conversion,
  chain interaction, or Cregis request/callback.
- [ ] The standard Railway release path is not used. It has
  `preDeployCommand: npx prisma migrate deploy` and is prohibited for this
  run.
- [ ] No `prisma migrate deploy`, `prisma db push`, seed, reset, DDL, manual
  data repair, or production connection is scheduled.
- [ ] All evidence storage redacts cookies, CSRF values, secrets, signatures,
  raw bodies, full addresses, and personal/financial identifiers.

**Stop immediately** if any item above is false.

---

## 1. Candidate backend release verification

### 1.1 Source, image, and target identity

- [x] Local no-migration Backend PR Gate passed for `4fb069c...`: 158/158
  suites and 1411/1411 tests; lint, build, and secret scan also passed. This is
  source evidence only, not a deployment receipt or migration authorization.
- [ ] Record backend commit `4fb069c...`, immutable image digest, build job,
  build timestamp, and candidate service ID.
- [ ] Record Worker commit `1f2d794...`, Worker build/deployment ID, and its
  isolated candidate URL.
- [ ] The candidate uses the existing shared DEV database and existing schema
  through sealed `DATABASE_URL` and `DIRECT_URL` references with
  database-enforced read-only permissions. No Candidate database, schema,
  database role, migration, seed, reset, or DDL exists or is planned.
- [ ] A read-only compatibility attestation exists for `4fb069c...` against
  the pre-existing shared DEV schema. It does not run any Prisma migration
  command, schema inspection write, or database write probe.
- [ ] Candidate configuration has only SANDBOX `secret://` references. No
  production key, Cregis execution mode, chain broadcast mode, provider write
  mode, or write-capable shared-DEV database reference is configured.

### 1.2 No-migration deployment path

- [ ] The candidate has a dedicated deployment descriptor/service setup.
- [ ] The candidate descriptor **omits** `preDeployCommand` rather than
  overriding, skipping, or editing the standard service's migration command.
- [ ] Deployment logs show only image/build/start/health steps; they contain no
  `prisma migrate deploy`, `db push`, `migrate`, seed, reset, or schema DDL.
- [ ] The candidate starts using the ordinary application start command and
  has not promoted or replaced the normal development backend.
- [ ] The candidate route is private to this UAT pair. No shared Worker or
  shared DEV origin was repointed.

### 1.3 Runtime pairing proof

- [ ] Read `GET /api/health` through the candidate backend. It returns
  `environment: SANDBOX` and `releaseSha` beginning `4fb069c`; `unknown` or a
  different SHA fails this item.
- [ ] Read `GET /api/health/readiness`. It reports a healthy SANDBOX runtime
  and schema readiness without an application migration execution.
- [ ] Read the Worker health endpoint. It reports build SHA beginning
  `1f2d794` and the candidate environment.
- [ ] Verify the isolated Worker points to the candidate backend origin only;
  record the redacted origin fingerprint and both health response timestamps.
- [ ] Re-read both health endpoints after the binding change. SHA or
  environment disagreement is a failed pair; do not begin fixture work.

**Section 1 pass condition:** every box is checked and the saved evidence
shows a paired Worker/backend candidate. Otherwise use the rollback steps in
Section 5.

---

## 2. SANL-X allowlisted fixture pre-provisioning

### 2.1 Policy and secret configuration

- [ ] The legacy global variable
  `PHASE2_SANDBOX_TEST_FIXTURES_ENABLED` is absent or explicitly `false` in
  the candidate service.
- [ ] Candidate-only fixture policy is enabled only after Section 1 passes.
- [ ] The policy resolves a signed SANDBOX-only manifest from a `secret://`
  reference and obtains its integrity key from a separate `secret://`
  reference. Neither value is copied to logs, source control, browser, or UAT
  evidence.
- [ ] The manifest has a version, issue time, expiry time, candidate release
  binding `4fb069c...`, declared `shared-dev-readonly` database scope, and no
  wildcard scope.
- [ ] Exactly one `(tenantId, customerId, environment: SANDBOX)` entry is
  allowlisted for the fixture-set ID. The scope is derived from the server-side
  session, never from a browser request body/query.
- [ ] Permitted capabilities are limited to
  `DEPOSIT_ADDRESS_READ`, `WITHDRAWAL_ADDRESS_READ`, `CARD_PRODUCT_READ`, and,
  only when required, `ONCHAIN_HISTORY_READ`.
- [ ] An approved non-public agent request ID and provisioner idempotency
  key are recorded. There is no end-user or admin-browser fixture endpoint.

### 2.2 Process-memory-only fixture objects

- [ ] Provision one in-memory deposit-address object for the allowlisted
  SANDBOX scope/network/asset. No database record, external allocation,
  signing, rotation, or chain call is made.
- [ ] Provision one in-memory eligible withdrawal-address object for the exact
  allowlisted tenant/customer. No database record, withdrawal preview, or
  request is created.
- [ ] Provision one in-memory tenant-local Card-product object exposing its
  canonical local asset/`currencyId`. No database record, card, quote, top-up,
  provider product lookup, or legacy ISO issuance field is created.
- [ ] If history pagination must be observed, provision only in-memory,
  non-financial history objects. Do not create a database row, ledger entry,
  balance movement, transaction hash, external-provider state, or Cregis order.
- [ ] Each object is tied to the fixture-set ID in process memory, is created
  idempotently, has a mandatory expiry, and produces a redacted audit receipt
  with `storage: "memory"` and `externalProviderCalled: false`.
- [ ] The provisioner verifies every in-memory object matches exact tenant,
  customer where applicable, and `SANDBOX`; any mismatch fails closed and
  destroys the fixture set.

### 2.3 Isolation counterproof

- [ ] With the allowlisted SANL-X session, perform only read requests and
  confirm deposit address, withdrawal address, and Card product render as
  expected.
- [ ] With a different customer in the **same** candidate tenant, repeat the
  equivalent reads. Fixture-only deposit address and Card product are absent;
  the withdrawal address is absent.
- [ ] With a user from a different SANDBOX tenant, repeat the reads. All
  SANL-X in-memory fixture data is absent.
- [ ] Check trace/audit evidence shows no fixture action, external-provider
  call, or database write occurred during any browser GET/read request.
- [ ] Record only manifest version, fixture-set ID, redacted record counts,
  trace IDs, route, response status, and pass/fail. Do not retain raw fixture
  data.

**Section 2 pass condition:** all three scopes have the expected results. A
single visibility leak, write-on-read, invalid manifest, expiry, or missing
audit receipt fails the fixture gate.

---

## 3. Read-only UAT entry confirmation

Complete this table before opening the UAT browser session.

| Check | Pass criteria | Evidence |
| --- | --- | --- |
| Authorized candidate pair | Worker `1f2d794...` and backend `4fb069c...` prove exact `SANDBOX` runtime SHAs. | Health responses and deployment IDs |
| Session | Dedicated allowlisted Cookie-Session is valid; CSRF is present but never copied into evidence. | Redacted session check |
| Fixture policy | Manifest is signed/unexpired and its exact scope/capabilities passed Section 2. | Redacted manifest version and audit receipt |
| No write affordance | Tester understands not to click allocate, preview, submit, issue, top-up, transfer, withdraw, or convert. | UAT run record |
| Assets | Assets page renders from read calls and has no unexpected cross-scope data. | Screenshot + read trace |
| Deposit | Address list is non-empty for the allowlisted scope; no preview/intent/allocation is invoked. | HTTP status + sanitized shape |
| Withdrawal | Eligible saved fixture address renders; preview and submit remain untouched. | HTTP status + UI state |
| Activity | Local onchain history read returns HTTP 200 and scoped `{ items, nextCursor }`, or expected safe 503 on controlled transient fault; never HTTP 408. | Trace ID + response envelope |
| Cards | Products read returns HTTP 200, no persistent HTTP 408; form identifies canonical `currencyId` and no legacy ISO request is made. | Trace + UI evidence |
| FX | Only if separately quote-only authorized: an unavailable quote produces `503 FX_QUOTE_ONLY_UNAVAILABLE`; no conversion follows. | Error envelope + trace |

**UAT execution order:** assets → deposit → withdrawal → activity → cards →
FX. Continue other read-only cases after an isolated failure, but never retry by
performing a financial action. Use the detailed cases in
[PR69-SANL-X-READONLY-RETEST.md](PR69-SANL-X-READONLY-RETEST.md).

---

## 4. Acceptance decision

- [ ] UAT-01: Card-product read has no HTTP 408; controlled transient failure
  has the bounded safe result `503 CARD_PRODUCT_READ_UNAVAILABLE`.
- [ ] UAT-02: the allowlisted deposit address list is non-empty and displays
  safely; no address allocation is triggered.
- [ ] UAT-03: the saved withdrawal fixture displays safely; no destination,
  preview, or submit request is created.
- [ ] UAT-04: local onchain history session/contract succeeds and its transient
  fallback is `503 LOCAL_CHAIN_READ_UNAVAILABLE`, not HTTP 408.
- [ ] UAT-05: card form/API behavior uses canonical `currencyId`; no legacy
  ISO currency request is sent.
- [ ] UAT-06: FX remains quote-only; failure returns
  `503 FX_QUOTE_ONLY_UNAVAILABLE` and explicitly causes no funds movement.
- [ ] All negative isolation tests pass, no unexpected HTTP 408/session error
  remains, and every failing case has a redacted trace ID and one owner.
- [ ] Update the UAT report, defect remediation list, merge validation, and
  M1–M5 milestone with the actual outcome. This checklist never authorizes a
  merge.

---

## 5. Failure rollback and contamination prevention

Use this sequence for deployment, policy, fixture, or UAT anomaly. It is
designed to contain the candidate without changing shared DEV, production, or
the Cregis branch.

### 5.1 Immediate containment

1. Stop the affected case; do not retry using a write action or manual SQL.
2. Remove/disable the isolated Worker candidate route to the candidate backend.
   Do **not** repoint it to shared DEV or production as a workaround.
3. Disable the candidate-only fixture policy and revoke/expire the SANL-X
   manifest entry. Confirm the legacy global fixture switch remains false.
4. Preserve redacted deployment logs, health output, manifest version, trace
   ID, and audit receipt for incident review. Do not preserve secret values or
   raw financial/customer identifiers.

### 5.2 Candidate and fixture cleanup

5. If the candidate is untrusted, stop/decommission the isolated candidate
   service; do not touch the standard Railway service.
6. Run the separately approved non-public **fixture memory-destruction**
   operation using the exact fixture-set ID and declared read-only database
   scope. It must be idempotent, audited, scoped to SANDBOX, and reject all
   records outside that in-memory fixture set. It must not use a database
   operation, migration, reset, seed, or broad delete.
7. If an audited scoped memory-destruction tool is unavailable or reports a
   scope mismatch, keep the route and policy disabled and escalate. Never
   improvise direct SQL or database cleanup.
8. Stop/decommission only the Candidate service after evidence is retained.
   It must not affect the shared DEV database, its schema, or production.

### 5.3 Post-rollback proof

9. Confirm the candidate Worker route is disabled and shared DEV still points
   to its original backend. Read only the relevant health endpoints.
10. Confirm the SANL-X manifest is revoked/expired, candidate-only secret
    references are removed from the candidate service, and global fixtures are
    disabled.
11. With non-allowlisted same-tenant and other-tenant sessions, perform
    read-only checks proving no fixture data is visible. If the candidate was
    retired, record the route/service retirement evidence instead.
12. Mark the affected UAT cases **blocked**, not passed; record the failure
    owner and reopen only after a new isolated candidate has completed Sections
    1 and 2 from the beginning.

## Codex execution record

| Role | Required decision | Name / time / evidence reference |
| --- | --- | --- |
| User authorization | Exact authorized environment step and timestamp. | |
| Codex | Candidate route has no migration path; database and write routes are fail-closed. | |
| Codex | Manifest/secret/visibility controls and rollback result are recorded. | |
| Codex | Read-only limits and results are recorded; PR remains Draft. | |
