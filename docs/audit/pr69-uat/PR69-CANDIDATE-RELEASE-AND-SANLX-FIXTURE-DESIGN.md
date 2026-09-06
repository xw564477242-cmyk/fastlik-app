# PR #69 Candidate Release and SANL-X Fixture Safety Design

**Status:** design approved for implementation planning only; no deployment, database migration, fixture write, merge, or Cregis change is authorized by this document.

**Applies to:** the FastLink-owned PR #69 candidate backend at
`4fb069c180f736f312a282218dc1610b509aaf79`, paired only with an isolated
SANDBOX Worker candidate. PR #69 remains Draft.

**Codex execution aid:** use
[PR69-CANDIDATE-SANLX-EXECUTION-CHECKLIST.md](PR69-CANDIDATE-SANLX-EXECUTION-CHECKLIST.md)
only after this design has been implemented and approved.

## 1. Decision and non-goals

The current standard Railway backend deployment configuration has
`preDeployCommand: npx prisma migrate deploy`. It is therefore **not an
allowed release route** for this UAT candidate: even a no-op migration command
would violate the no-migration constraint.

The existing `PHASE2_SANDBOX_TEST_FIXTURES_ENABLED=true` behavior is also
**not an allowed fixture route**. When a scoped list is empty it can create
deterministic records for that SANDBOX scope, but it has no tenant/customer
allowlist. It must remain disabled until replaced by the controlled mechanism
below.

This design does not change the four PR #69 local APIs, financial behavior,
database schema, Cregis branch, production configuration, or browser write
permissions. It creates an environment-control path for a later separately
reviewed infrastructure/test-fixture change.

### 1.1 Candidate source-security evidence

Candidate `4fb069c...` resolves the local Card top-up quote-signing key before
any Card/Wallet read or serializable transaction. If that configuration is
absent, the service returns its safe unavailable error without disclosing
scoped state or entering a mutation path. The associated test asserts those
non-effects. This does not alter Card issuance: the request and idempotency
contract remain canonical `currencyId`, while a legacy ISO `currency` request
is rejected. The local no-migration Backend PR Gate passed at 158/158 suites
and 1411/1411 tests; this is source evidence only and is not deployment, schema
compatibility, or UAT acceptance.

## 2. Non-migrating candidate backend release

### 2.1 Required topology

Create a separate, non-production candidate service, for example
`fastlink-backend-pr69-sanlx-candidate`. It is not a replacement for the
existing development backend and receives no shared-DEV traffic.

| Component | Required setting | Safety boundary |
| --- | --- | --- |
| Source/image | Build exactly backend commit `4fb069c...`; record immutable image digest and source SHA. | No branch tip, floating tag, or unrelated frontend commit may substitute. |
| Deployment configuration | Candidate-only service configuration omits `preDeployCommand` entirely. It uses the existing Docker build and normal application start command only. | The standard `railway.json` route is not reused for this release. Do not override or suppress its migration command in-place. |
| Database | Reuse the existing shared DEV database and its existing schema through sealed `DATABASE_URL` and `DIRECT_URL` references with database-enforced read-only permissions. | No Candidate database/schema/role, `prisma migrate deploy`, `db push`, seed, reset, schema DDL, write-capable DEV connection, or production database connection. |
| Runtime | `FASTLINK_ENVIRONMENT=SANDBOX`; only SANDBOX secrets; Cregis and external execution modes remain disabled. | Candidate cannot use production keys or send provider, chain, card, transfer, or FX execution requests. |
| Public route | A separate candidate origin, reached only through an isolated Worker candidate binding. | Do not repoint shared DEV or the current Worker origin. |
| Verification | `GET /api/health` and `/api/health/readiness` return `environment: SANDBOX` and the backend `releaseSha` prefix for `4fb069c...`; deployment receipt records image digest and source SHA. | A healthy process with `releaseSha: unknown`, a different SHA, or a non-SANDBOX environment is a failed gate. |

The application health/readiness checks may read schema readiness metadata.
That is an application read, not a migration. Release approval still requires a
separate schema-compatibility attestation that the already-present target schema
supports `4fb069c...`; the attestation must not invoke a Prisma migration
command.

### 2.2 Candidate release procedure (run later by Codex after authorization)

1. Confirm the source SHA, recorded local no-migration Backend PR Gate,
   immutable container digest, and read-only compatibility attestation for the
   existing shared DEV schema. The attestation performs no database action.
2. Provision the separate candidate service with a deployment descriptor that
   has **no pre-deploy command**. Do not edit the standard service descriptor
   or issue a standard `railway up` deployment.
3. Set only candidate-scoped SANDBOX configuration: sealed read-only references
   to the existing shared DEV database/schema, `FASTLINK_ENVIRONMENT=SANDBOX`,
   release metadata, and the fixture-policy secret references described below.
   Do not create a database/schema, reveal or copy any secret, or enable
   third-party execution modes.
4. Deploy the immutable image. Capture the provider deployment ID, timestamp,
   image digest, source SHA, and non-sensitive configuration fingerprint.
5. Read `/api/health` and `/api/health/readiness`. Require the expected
   `releaseSha`, `SANDBOX` environment, schema readiness, and no unexpected
   provider readiness escalation. A mismatch rolls back by disabling the
   candidate route/service; it never triggers a migration, database write, or
   database rollback command.
6. Build or bind a distinct isolated Worker candidate from frontend Worker
   commit `1f2d794d367dea471e7db128d87be3179de1365e` to this candidate origin.
   Verify both Worker build SHA and backend release SHA through read-only health
   endpoints before a browser session is used.
7. Keep the candidate private to the named UAT route and session. Promotion is
   not part of this procedure; PR #69 remains Draft.

### 2.3 Release stop conditions

Stop before browser UAT and mark the candidate rejected if any of the following
occurs: a migration command is proposed or observed; read-only compatibility
is not evidenced; `releaseSha` differs from `4fb069c...`; the database
reference is write-capable or not the existing shared DEV schema; a non-SANDBOX
key is present; a provider execution mode is enabled; a Candidate write route
is reachable; or a fixture policy is missing/invalid. No data repair, manual
SQL, or configuration workaround is permitted as a substitute.

## 3. SANL-X fixture allowlist design

### 3.1 Control-plane model

Replace the global empty-scope behavior with a non-public
`SanlXFixturePolicy` and a one-shot `SanlXFixtureProvisioner`. Neither is a
browser endpoint and neither is callable by an end-user session. The policy is
read before every fixture action; the provisioner is invoked only by Codex's
agent identity after user authorization and a healthy candidate release.

The policy has **fail-closed intersection semantics**. A fixture capability is
permitted only when all checks below pass:

1. Runtime and server-derived scope both equal exactly `SANDBOX`.
2. The explicit candidate-only toggle is enabled; the legacy global
   `PHASE2_SANDBOX_TEST_FIXTURES_ENABLED` is unset/false.
3. A versioned, expiring SANL-X manifest is resolved from a
   `secret://` reference and passes integrity/signature verification.
4. The server-derived `(tenantId, customerId, environment)` exactly matches one
   manifest entry, including the requested capability and fixture-set ID.
5. The manifest is within its TTL, is not revoked, and names the current
   candidate release identifier and `shared-dev-readonly` database scope.
6. The provisioner has an approved agent change ticket and a matching
   non-public idempotency key. Client input never supplies tenant, customer,
   amount, destination, or fixture payload.

Any mismatch returns the normal empty/unavailable read state; it creates
nothing. There is no wildcard tenant, wildcard customer, environment alias,
or fallback to a global SANDBOX scope.

### 3.2 Manifest contract

The manifest is configuration, not a database table; it needs no migration.
Store its value and integrity key as separate SANDBOX-only `secret://`
references. Do not put the secret values, full addresses, session material, or
raw identifiers in source control, UAT evidence, or browser responses.

Illustrative redacted shape:

```json
{
  "version": "sanl-x-2026-08-25.1",
  "environment": "SANDBOX",
  "candidateRelease": "4fb069c180f736f312a282218dc1610b509aaf79",
  "databaseScope": "shared-dev-readonly",
  "issuedAt": "2026-08-25T00:00:00Z",
  "expiresAt": "2026-08-26T00:00:00Z",
  "entries": [
    {
      "tenantId": "redacted",
      "customerId": "redacted",
      "fixtureSetId": "sanl-x-pr69-readonly-v1",
      "capabilities": [
        "DEPOSIT_ADDRESS_READ",
        "WITHDRAWAL_ADDRESS_READ",
        "CARD_PRODUCT_READ",
        "ONCHAIN_HISTORY_READ"
      ],
      "fixtureRecordHashes": ["sha256:redacted"]
    }
  ]
}
```

Codex configures the canonical manifest after the user authorizes that exact
step, using a separate SANDBOX-only integrity secret. The running service
verifies signature, expiry, release binding, read-only database scope, and
exact scope before use. A revocation consists of removing the entry or
disabling the candidate-only toggle; both immediately prevent new fixture
actions. Existing fixture objects are process-memory-only, expire
automatically, and are destroyed by the audited cleanup operation.

### 3.3 Supported fixture set

The provisioner accepts a manifest-selected fixture set, not arbitrary values.
Every operation is process-memory-only, idempotent, expiry-bounded, and audited
with `fixtureSetId`, manifest version, redacted scope fingerprint, agent change
ticket, `storage: "memory"`, and `externalProviderCalled: false`. It must not
invoke a persistence adapter or transaction.

| Capability | Exact local record | Required scope | Prohibited behavior |
| --- | --- | --- | --- |
| `DEPOSIT_ADDRESS_READ` | One active in-memory deposit-address DTO for the manifest network/asset. | tenant + customer + `SANDBOX`. | No database insert, chain allocation, signing, broadcast, rotation, or browser-triggered creation. |
| `WITHDRAWAL_ADDRESS_READ` | One eligible in-memory withdrawal-address DTO. | tenant + customer + `SANDBOX`. | No database insert, direct address entry, preview, withdrawal creation, provider validation, or broadcast. |
| `CARD_PRODUCT_READ` | One in-memory Card-product DTO with canonical local asset/`currencyId` identity. | tenant + customer + `SANDBOX`. | No database insert, card issue, quote, top-up, provider product lookup, or legacy ISO request field. |
| `ONCHAIN_HISTORY_READ` | Zero or more in-memory non-financial history DTOs, when pagination needs evidence. | tenant + customer + `SANDBOX`. | No database insert, ledger posting, balance change, network poll, or aggregate-history substitution. |

The fixture set deliberately does not create a funded wallet, actual transfer,
top-up quote, issued card, external order, or Cregis callback. It only makes
read rendering and read contracts observable. All amounts, if a public DTO
contains one, stay canonical strings.

### 3.4 Process-memory tenant/customer visibility

The manifest check is performed on every eligible read before a fixture object
is merged into the response. The in-memory store key is the exact composite
`(candidate release, environment, tenantId, customerId, fixtureSetId)`; the
key and object are never derived from browser input. A different customer in
the same tenant and every other tenant receive no fixture object. Normal DEV
records preserve their existing behavior and are not tagged, filtered, or
modified by SANL-X.

An unknown, malformed, expired, revoked, or mismatched in-memory fixture is
omitted from responses and raised only as a redacted audit event. The negative
isolation test includes a second SANDBOX customer in the same tenant, not only
a customer from another tenant.

### 3.5 Implementation guardrails for the later fixture-only change

- Remove automatic fixture creation from ordinary `GET` read paths. A GET must
  not write as a side effect, including for an allowlisted account.
- Keep the policy/provisioner and ephemeral fixture store in a
  test-infrastructure module, separate from core wallet business services and
  the Cregis module. They may not call a persistence adapter, ledger, provider,
  or database transaction. The narrowly scoped response merger may add an
  eligible in-memory DTO only; it must not change financial behavior or normal
  DEV records.
- This design introduces no migration, schema mutation, table marker, audit
  record, database query, or uniqueness check. If durable storage seems
  necessary, stop: it is outside this approved plan.
- Fail closed on malformed secret, invalid signature, expired/revoked manifest,
  policy/read-only-database-scope mismatch, duplicate composite key, or audit
  failure.
- Add unit tests for every rejection path and integration tests proving that an
  allowlisted tenant/customer can read only its own records while both a second
  customer in the same candidate tenant and a neighboring SANDBOX tenant see
  unchanged empty results.
- Log redacted fixture-set identifiers and trace IDs, never manifest secrets,
  addresses, cookies, CSRF tokens, customer IDs, or provider payloads.

## 4. Ordered environment-to-UAT flow

This is the only permitted order once the user authorizes each external change
for Codex. It is intentionally not an execution command.

1. **Release attestation:** verify `4fb069c...`, the recorded no-migration
   Backend PR Gate, image digest, existing
   schema compatibility, SANDBOX target identity, and no-migration candidate
   descriptor.
2. **Candidate deployment:** deploy the separate backend candidate without a
   pre-deploy command; capture health/readiness SHA evidence; bind only an
   isolated Worker candidate at `1f2d794...` to it.
3. **Policy activation:** load the signed, time-bounded SANL-X manifest into
   candidate-only secret configuration. Confirm the legacy global fixture
   switch is disabled.
4. **Provisioning:** Codex invokes the non-public provisioner once for the
   manifest fixture-set ID. Capture a redacted process-memory audit receipt and
   exact scoped object counts. If any object is visible outside the allowlisted
   scope, stop and remove the candidate route; no database cleanup occurs.
5. **Read-only preflight:** with the allowlisted session, read deposit,
   withdrawal, Card product, and onchain history endpoints. With a neighboring
   SANDBOX session, prove the same endpoints have no newly created data.
6. **Browser UAT:** execute the ordered read-only sequence in
   [PR69-SANL-X-READONLY-RETEST.md](PR69-SANL-X-READONLY-RETEST.md): assets →
   deposit → withdrawal → activity → cards → FX. Do not click preview,
   allocation, submit, issue, top-up, transfer, or conversion controls.
7. **Evidence and teardown:** record redacted traces, release/Worker SHA,
   manifest version and case results. Disable policy, expire/revoke manifest,
   and run the separately approved audited memory-destruction operation.
   Candidate release stays non-promoted and PR #69 stays Draft.

## 5. Risk acceptance boundary

This design clears neither the UAT gate nor the PR #69 merge gate by itself.
It removes the two infrastructure-design blockers only after the candidate
descriptor and allowlisted provisioner have been independently implemented,
security-reviewed, deployed in SANDBOX, and evidenced. Until then:

- UAT-01/UAT-04/UAT-06 remain **fixed in source, pending paired runtime
  retest**.
- UAT-02/UAT-03 remain **fixture blocked**.
- Cregis remains isolated and **must not** invoke, emulate, or replace PR #69
  local APIs.
