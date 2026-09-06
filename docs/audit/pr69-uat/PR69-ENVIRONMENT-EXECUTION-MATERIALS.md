# PR #69 Environment Execution Materials — Authorization Required

**Status:** template only. This document does **not** authorize deployment,
database changes, fixture provisioning, UAT writes, a merge, or Cregis work.
Every command below is intentionally fail-closed until Codex has received the
user's explicit instruction **“授权执行”** for the exact step and records a
change ticket. The user never needs to operate a provider console.

**Database decision:** the Candidate service reuses the existing shared DEV
database and its existing schema. It must not create a Candidate database,
schema, database role, migration, seed, reset, or DDL. The Candidate is
restricted to a sealed **read-only** connection to that existing database;
SANL-X fixtures live only in Candidate process memory and are never persisted
to DEV business, ledger, session, or audit tables.

## 0. Immutable release pair

| Component | Required identity |
| --- | --- |
| Backend source | `4fb069c180f736f312a282218dc1610b509aaf79` |
| Backend branch | `feature/phase2-onchain-wallet` |
| Worker source | `1f2d794d367dea471e7db128d87be3179de1365e` |
| Runtime | `SANDBOX` only |
| PR #69 | Draft throughout |

The backend must be released from an immutable build that proves the exact
backend SHA at runtime. A branch name, deployment ID, or a later branch head
is not equivalent evidence.

## 1. Candidate-only Railway deployment configuration

This is a **candidate-service UI configuration**, not a replacement for the
repository's standard `railway.json`. The standard descriptor contains a
prohibited `preDeployCommand: npx prisma migrate deploy` and must not be used
for this candidate.

```yaml
candidate_service:
  name: fastlik-backend
  environment: development-A
  source:
    repository: xw564477242-cmyk/fastlik-backend
    branch: feature/phase2-onchain-wallet
    required_commit: 4fb069c180f736f312a282218dc1610b509aaf79
  build:
    builder: DOCKERFILE
    dockerfile_path: Dockerfile
    image_identity: "record immutable digest after build; never use a floating tag"
  deploy:
    start_command: "omit; retain Dockerfile CMD: node dist/src/main.js"
    preDeployCommand: "OMIT — do not set an empty replacement and do not inherit railway.json"
    healthcheck_path: /api/health
    healthcheck_timeout_seconds: 120
    restart_policy: ON_FAILURE
    restart_max_retries: 3
  release_gate:
    required_runtime_release_prefix: 4fb069c
    required_environment: SANDBOX
    candidate_only_route: true
    candidate_read_route_allowlist: true
    shared_dev_service_mutation: forbidden
    shared_dev_database_writes: forbidden
    production_mutation: forbidden
```

### 1.1 Candidate variables

Set only after the shared-DEV, read-only connection attestation has been
approved. `secret://…` below is a reference name placeholder, not a literal
value or a request to reveal a secret.

| Variable | Candidate setting | Rule |
| --- | --- | --- |
| `FASTLINK_ENVIRONMENT` | `SANDBOX` | Required. |
| `NODE_ENV` | `production` | Required by the runtime image. |
| `DATABASE_URL` | `secret://fastlink/dev/pr69-candidate-readonly/database-url` | Existing shared DEV database and existing schema only; must be a connection with database-enforced read-only permissions. |
| `DIRECT_URL` | `secret://fastlink/dev/pr69-candidate-readonly/direct-url` | Points to the exact same shared DEV database and schema as `DATABASE_URL`, with the same read-only restriction; it is never used for migration or DDL. |
| `CORS_ORIGIN` | Exact candidate Worker HTTPS origin | One exact origin, no wildcard and no path. |
| `ENABLE_END_USER_API` | `true` | Requires the sealed SANDBOX session-signing reference below. |
| `END_USER_SESSION_SECRET` | `secret://fastlink/sandbox/shared/end-user-session` | Sealed reference to the existing SANDBOX session-signing secret needed to validate the Worker session. Reference it; never reveal, copy, rotate, or modify it. |
| `ENABLE_API_DOCS` | `false` | Required. |
| `THREDD_MODE` | `DISABLED` | Required. |
| `FX_MODE` | `DISABLED` | Required. |
| `ALLOW_SANDBOX_PROVIDER_MOCK` | `false` | Required. |
| `ALLOW_SANDBOX_FX_ADAPTER` | `false` | Required. |
| `PHASE2_SANDBOX_TEST_FIXTURES_ENABLED` | `false` | Legacy global fixture path stays disabled. |
| `CARD_TRANSACTION_PROVIDER_MODE` | **omit** | Absence is the code's fail-closed disabled state; do not set a guessed value. |

Do not inherit or configure production/UAT credentials, Cregis variables,
Thredd/FOMO/Sponsor-Bank credentials, chain webhook secrets, poller tokens,
seed/reset/bootstrap credentials, write-capable shared-DEV database references,
or any secret by manual reveal/copy. The only permitted shared-DEV references
are the sealed read-only database references above and, if cookie validation
requires it, the sealed SANDBOX session-signing reference above.

The Candidate route must forward only the read allowlist used by the UAT
script: health/readiness, assets, deposit-addresses, withdrawal-addresses,
onchain transaction history, card-products, and the quote-only FX error
surface. All business `POST`, `PUT`, `PATCH`, `DELETE`, allocation, preview,
submit, transfer, card-issue, top-up, withdrawal, conversion, webhook, poller,
and provider paths must be blocked at the Candidate route before they reach
the application. This is additive to database read-only enforcement.

### 1.2 Pre-deployment validation record

Codex completes and records this before enabling the candidate service after
the user has authorized that deployment step:

```text
CHANGE_TICKET=____________________________
BACKEND_SHA=4fb069c180f736f312a282218dc1610b509aaf79
WORKER_SHA=1f2d794d367dea471e7db128d87be3179de1365e
IMAGE_DIGEST=sha256:_______________________
CANDIDATE_SERVICE_ID=______________________
CANDIDATE_DATABASE_MODE=SHARED_DEV_READ_ONLY
SHARED_DEV_DATABASE_FINGERPRINT=___________
EXISTING_SCHEMA_COMPATIBILITY_ATTESTATION=__
PREDEPLOY_COMMAND_OBSERVED=ABSENT
DATABASE_WRITE_PROBE=DENIED
ROUTE_WRITE_ALLOWLIST=ABSENT
PRODUCTION_DEPENDENCY_SCAN=PASS
CREGIS_EXECUTION=DISABLED
PROVIDER_EXECUTION=DISABLED
APPROVER=__________________________________
```

Any empty field, database write capability, route write capability, or a
different runtime SHA is a stop condition. Do not deploy to discover a
mismatch. This validation may attest only to the pre-existing shared DEV
schema; it must not run migration, `db push`, seed, reset, DDL, or a write
probe against the database.

## 2. SANL-X secret templates

The current backend does **not** implement `SANLX_WHITELIST` or `SANLX_SECRET`.
They are reserved templates for a separately reviewed signed-fixture policy.
Until that policy exists, keep both references **unset** and retain
`PHASE2_SANDBOX_TEST_FIXTURES_ENABLED=false`.

### 2.1 Future secret-reference mapping

```dotenv
# Candidate-only references. Do not paste secret values into Railway, shell
# history, source control, browser requests, screenshots, or UAT evidence.
SANLX_WHITELIST=secret://fastlink/sandbox/pr69/sanlx-whitelist-v1
SANLX_SECRET=secret://fastlink/sandbox/pr69/sanlx-manifest-integrity-v1
```

### 2.2 `SANLX_WHITELIST` secret-body template

```json
{
  "version": "sanl-x-pr69-v1",
  "environment": "SANDBOX",
  "candidateRelease": "4fb069c180f736f312a282218dc1610b509aaf79",
  "databaseScope": "shared-dev-readonly",
  "issuedAt": "YYYY-MM-DDThh:mm:ssZ",
  "expiresAt": "YYYY-MM-DDThh:mm:ssZ",
  "entries": [
    {
      "tenantId": "REDACTED",
      "customerId": "REDACTED",
      "fixtureSetId": "sanl-x-pr69-readonly-v1",
      "capabilities": [
        "DEPOSIT_ADDRESS_READ",
        "WITHDRAWAL_ADDRESS_READ",
        "CARD_PRODUCT_READ",
        "ONCHAIN_HISTORY_READ"
      ],
      "fixtureRecordHashes": ["sha256:REDACTED"]
    }
  ],
  "signature": "BASE64URL_SIGNATURE_REDACTED"
}
```

`SANLX_SECRET` contains only the independent integrity/signing key. It must
not be a session secret, database secret, provider credential, or reused DEV
secret. The service must verify signature, expiry, exact candidate release,
declared read-only database scope, environment, tenant, customer, and
requested capability before any fixture action.

## 3. Fixture API templates — unavailable until implemented

No signed SANL-X fixture API exists in the current candidate source. The
following is a **future internal-only contract and script template**; it must
remain blocked with `SANL_X_SIGNED_FIXTURE_POLICY_NOT_IMPLEMENTED` until its
implementation and security review are accepted.

Proposed non-public endpoints:

```text
POST /api/internal/sanl-x/fixtures/provision
POST /api/internal/sanl-x/fixtures/cleanup
GET  /api/internal/sanl-x/fixtures/visibility
```

The endpoints must reject Cookie-Session/browser access, derive scope only
from the signed manifest, require an agent service identity, and accept neither
tenant/customer identifiers nor financial values from the caller. Provisioning
must create only process-memory fixture objects tagged with the manifest and
expiry; it must not write any DEV database table, allocate an address, call a
provider, create a ledger row, or touch a real fund/transaction path.

### 3.1 Provision template

```bash
#!/usr/bin/env bash
# sanlx-provision.template.sh — do not run before explicit authorization.
set -euo pipefail
set +x

: "${CANDIDATE_BASE_URL:?candidate URL required}"
: "${SANLX_AGENT_CURL_CONFIG:?protected curl config path required}"
: "${CHANGE_TICKET:?approved change ticket required}"
: "${FIXTURE_SET_ID:=sanl-x-pr69-readonly-v1}"

if [[ "${AUTHORIZED_EXECUTION:-}" != "PR69_SANLX_AGENT_AUTHORIZED" ]]; then
  echo 'BLOCKED: explicit environment authorization is absent' >&2
  exit 77
fi
if [[ "${SANLX_FIXTURE_API_IMPLEMENTED:-false}" != "true" ]]; then
  echo 'BLOCKED: SANL_X_SIGNED_FIXTURE_POLICY_NOT_IMPLEMENTED' >&2
  exit 78
fi

# The protected curl config supplies internal agent authentication without
# placing it in this script or shell history. The body has no tenant/customer,
# address, amount, or secret value.
curl --fail-with-body --silent --show-error \
  --config "$SANLX_AGENT_CURL_CONFIG" \
  --request POST "$CANDIDATE_BASE_URL/api/internal/sanl-x/fixtures/provision" \
  --header 'Content-Type: application/json' \
  --data "{\"changeTicket\":\"$CHANGE_TICKET\",\"fixtureSetId\":\"$FIXTURE_SET_ID\"}"
```

Expected response is a redacted audit receipt containing only manifest version,
fixture-set ID, record counts, release prefix, `storage:"memory"`, and
`externalProviderCalled:false`. Any database write, provider, chain, ledger,
address-allocation, or unrestricted tenant response is a hard failure.

### 3.2 Cleanup template

```bash
#!/usr/bin/env bash
# sanlx-cleanup.template.sh — route must be disabled before cleanup.
set -euo pipefail
set +x

: "${CANDIDATE_BASE_URL:?candidate URL required}"
: "${SANLX_AGENT_CURL_CONFIG:?protected curl config path required}"
: "${CHANGE_TICKET:?approved change ticket required}"
: "${FIXTURE_SET_ID:=sanl-x-pr69-readonly-v1}"

if [[ "${AUTHORIZED_EXECUTION:-}" != "PR69_SANLX_AGENT_AUTHORIZED" ]]; then
  echo 'BLOCKED: explicit environment authorization is absent' >&2
  exit 77
fi
if [[ "${CANDIDATE_ROUTE_DISABLED:-false}" != "true" ]]; then
  echo 'BLOCKED: disable the isolated candidate route before cleanup' >&2
  exit 79
fi
if [[ "${SANLX_FIXTURE_API_IMPLEMENTED:-false}" != "true" ]]; then
  echo 'BLOCKED: SANL_X_SIGNED_FIXTURE_POLICY_NOT_IMPLEMENTED' >&2
  exit 78
fi

curl --fail-with-body --silent --show-error \
  --config "$SANLX_AGENT_CURL_CONFIG" \
  --request POST "$CANDIDATE_BASE_URL/api/internal/sanl-x/fixtures/cleanup" \
  --header 'Content-Type: application/json' \
  --data "{\"changeTicket\":\"$CHANGE_TICKET\",\"fixtureSetId\":\"$FIXTURE_SET_ID\"}"
```

## 4. Isolation counterproof

Run after successful provisioning and before browser UAT. Capture only status,
trace ID, sanitized response shape, and manifest version.

| Session | Read requests | Required result |
| --- | --- | --- |
| Allowlisted tenant/customer | Deposit-addresses, withdrawal-addresses, card-products, onchain history | Only the declared in-memory SANL-X records are visible; no browser read writes data. |
| Different customer, same tenant | The same four reads | No in-memory fixture deposit address, withdrawal address, card product, or history is visible. |
| Different SANDBOX tenant/customer | The same four reads | No SANL-X fixture record is visible. |

The counterproof requires the policy implementation to emit a redacted,
agent-readable visibility/audit verdict. A generic empty list alone is not
proof of isolation; a browser must never be allowed to trigger provisioning.

## 5. Read-only UAT script and result record

The script issues only `GET` requests. It explicitly excludes allocation,
preview, submit, issue, top-up, transfer, withdrawal, conversion, and any
fixture endpoint.

```bash
#!/usr/bin/env bash
# pr69-sanlx-readonly-uat.template.sh
set -euo pipefail
set +x

: "${CANDIDATE_BASE_URL:?candidate backend URL required}"
: "${WORKER_BASE_URL:?candidate Worker URL required}"
: "${ALLOWLISTED_COOKIE_JAR:?protected allowlisted cookie jar path required}"
: "${NETWORK_ID:?CAIP-2 network id required}"
: "${ASSET_ID:?local asset id required}"

expected_backend='4fb069c'
expected_worker='1f2d794'
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

get_json() {
  local name="$1" url="$2"
  curl --fail-with-body --silent --show-error --cookie "$ALLOWLISTED_COOKIE_JAR" \
    --header 'Accept: application/json' --request GET "$url" > "$tmp_dir/$name.json"
}

# Runtime-pair gate. These responses are recorded only after secrets/cookies
# have been redacted from evidence.
get_json backend-health "$CANDIDATE_BASE_URL/api/health"
get_json backend-readiness "$CANDIDATE_BASE_URL/api/health/readiness"
get_json worker-health "$WORKER_BASE_URL/api/health"
jq -e --arg sha "$expected_backend" '(.releaseSha // .release // "") | startswith($sha)' "$tmp_dir/backend-health.json" >/dev/null
jq -e --arg sha "$expected_worker" '(.releaseSha // .release // .buildSha // "") | startswith($sha)' "$tmp_dir/worker-health.json" >/dev/null

# Required read-only UAT order: assets → deposit → withdrawal → history → cards.
get_json assets "$WORKER_BASE_URL/api/v1/wallet/total-assets?valuationAssetId=flp_asset_usd"
get_json deposit-addresses "$WORKER_BASE_URL/api/v2/wallet/onchain/deposit-addresses?networkId=$NETWORK_ID&assetId=$ASSET_ID"
get_json withdrawal-addresses "$WORKER_BASE_URL/api/v1/wallet/withdrawal-addresses"
get_json onchain-history "$WORKER_BASE_URL/api/v2/wallet/onchain/transactions?limit=25"
get_json card-products "$WORKER_BASE_URL/api/v1/cards/products"

jq -e '.items | type == "array"' "$tmp_dir/deposit-addresses.json" >/dev/null
jq -e '.items | type == "array"' "$tmp_dir/onchain-history.json" >/dev/null
jq -e 'type == "array" or (.items | type == "array")' "$tmp_dir/card-products.json" >/dev/null
printf 'READ_ONLY_UAT_PASS: capture only status, trace IDs, response shapes, and SHA pair.\n'
```

Result record template:

| Order | Module | Route / UI | HTTP | Trace ID | SHA pair | Result | Notes |
| ---: | --- | --- | ---: | --- | --- | --- | --- |
| 1 | Assets | total-assets |  |  | `4fb069c…` + `1f2d794…` |  |  |
| 2 | Deposit | deposit-addresses only |  |  |  |  | No preview/allocation/submit |
| 3 | Withdrawal | withdrawal-addresses only |  |  |  |  | No preview/submit |
| 4 | History | onchain transactions |  |  |  |  | No HTTP 408 |
| 5 | Cards | card-products |  |  |  |  | `currencyId` display only |
| 6 | FX | quote-only error only if separately authorized |  |  |  |  | No conversion |

## 6. Rollback template

Rollback is ordered to protect shared DEV and prevent post-UAT fixture access.
Do not run manual SQL, schema changes, migration, reset, or a production action.

```text
1. Stop the isolated Worker → Candidate backend binding.
   Verify shared DEV and production routes are unchanged.
2. Disable the candidate-only SANL-X fixture policy reference.
   Revoke/expire the allowlisted manifest; do not reveal its value.
3. Verify no new Candidate traffic reaches the fixture provisioner.
4. Run the non-public cleanup operation only if its signed-policy implementation
   exists, the route is disabled, and Codex has received explicit user
   authorization for the cleanup step.
5. Capture the redacted memory-destruction audit receipt and re-run the
   three-scope isolation counterproof. No database cleanup is permitted,
   because the fixture must never have been persisted.
6. Stop or remove only the isolated Candidate service after evidence is stored.
   Never alter `fastlink-backend-dev`, shared DEV data, or production.
```

Rollback completion record:

```text
CANDIDATE_ROUTE_DISABLED=___________________
MANIFEST_REVOKED_OR_EXPIRED=________________
FIXTURE_MEMORY_DESTRUCTION_AUDIT_ID=REDACTED
ALLOWLISTED_SCOPE_POSTCHECK=PASS
SAME_TENANT_NEGATIVE_POSTCHECK=PASS
OTHER_TENANT_NEGATIVE_POSTCHECK=PASS
SHARED_DEV_UNCHANGED=PASS
PRODUCTION_UNCHANGED=PASS
```

## Authorization boundary

This material is ready for Codex-led execution after user authorization. Do
not apply Railway changes, create a database or schema, configure secrets,
invoke a fixture endpoint, or run UAT until the user explicitly replies
**“授权执行”**. The Candidate always reuses the existing shared DEV database
through a sealed read-only reference; no database-side action is part of this
plan.
for the exact next step.
