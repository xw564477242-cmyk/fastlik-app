# PR #69 SANL-X Read-Only Retest Checklist

**Purpose:** verify the paired PR #69 backend repair and approved SANL-X
fixtures in an immutable SANDBOX candidate. This is a browser/read-interface
test only. PR #69 stays Draft.

> Control-plane design: [PR69-CANDIDATE-RELEASE-AND-SANLX-FIXTURE-DESIGN.md](PR69-CANDIDATE-RELEASE-AND-SANLX-FIXTURE-DESIGN.md).
> This checklist does not authorize its deployment or fixture provisioning.
> Codex execution checklist: [PR69-CANDIDATE-SANLX-EXECUTION-CHECKLIST.md](PR69-CANDIDATE-SANLX-EXECUTION-CHECKLIST.md).

## Preconditions

- [ ] Candidate runtime SHA is recorded and differs from the current
  `1f831ca49e778a5f69967bbe1b2f80e346a2ddd3` runtime only because the paired
  backend repair is included; browser shows `SANDBOX` and a valid Cookie-Session.
- [ ] No migration, deployment from this checklist, merge, production key, Cregis call, real chain action, funding, withdrawal, Card issue, Card top-up, transfer, or FX conversion is authorized.
- [ ] The SANL-X manifest identifies an exact tenant/customer/environment and
  one in-memory deposit-address object, one in-memory eligible
  withdrawal-address object, one in-memory Card-product object, and zero or
  more scoped in-memory history objects. Secrets, raw callback bodies, full
  addresses, and financial identifiers are redacted.
- [ ] Fixture setup is complete before the browser opens. The browser must not
  allocate an address, create an address-book entry, or create a fixture.
- [ ] The fixture provisioner is restricted to the declared SANL-X
  tenant/customer allowlist. A global "all empty SANDBOX scopes" switch is
  not an acceptable substitute.
- [ ] The candidate backend was deployed through a candidate-only descriptor
  that omits `preDeployCommand`, uses the existing shared DEV schema only via
  sealed database-enforced read-only references, and blocks Candidate write
  routes. No Prisma migration command, schema DDL, reset, seed, or database
  write ran. Its `/api/health` release SHA starts with `4fb069c`.
- [ ] The isolated Worker candidate build SHA starts with `1f2d794`, its
  backend origin is the candidate route (not shared DEV), and both health
  responses report `SANDBOX`.
- [ ] The signed manifest is unexpired, candidate-release/read-only-database-
  scope bound, and permits only the exact server-derived SANL-X
  tenant/customer scope. The legacy global fixture switch is disabled.
- [ ] A second customer in the candidate tenant and a neighboring SANDBOX
  tenant/customer have completed the negative isolation preflight and see no
  in-memory fixture data.

### Current gate evidence (2026-08-25)

- Worker candidate `1f2d794...` is healthy, and backend candidate
  `4fb069c...` passed the local no-migration Backend PR Gate (158/158 suites,
  1411/1411 tests), but the backend candidate is not deployed to that Worker
  origin.
- The available Railway deployment route would execute a prohibited migration;
  no deploy was attempted.
- No dedicated SANL-X manifest or fixture allowlist exists, so no in-memory
  address, withdrawal destination, Card product, or history fixture object has
  been provisioned. No DEV database record is required or permitted.
- The safe candidate-release and allowlist design is documented, but is not
  implemented or provisioned. Therefore this retest remains **not started**.

## Repair verification — read-only

| Case | Browser/API observation | Expected result | Classification |
| --- | --- | --- | --- |
| R-01 Card product normal read | Navigate to Cards; observe `GET /api/v1/cards/products` only. | HTTP 200; response contains only tenant-local active products and canonical `assetId`/display currency fields. No HTTP 408 and no Card provider call. | Repair verification |
| R-02 Card product transient failure | Controlled SANL-X fault only; reload the Cards read once. | At most one safe backend retry; if still unavailable, HTTP 503 with `CARD_PRODUCT_READ_UNAVAILABLE`. No invented product or enabled write action. | Repair verification |
| R-03 Onchain history normal read | Navigate to Activity; observe `GET /api/v2/wallet/onchain/transactions?limit=25`. | HTTP 200 `{ items, nextCursor }`; all rows are tenant/customer/environment-owned. Empty `items` is valid when the manifest declares no transfers. | Repair verification |
| R-04 Onchain history pagination | If `nextCursor` is non-null, use only the UI's next-page read. | The opaque cursor round-trips without client parsing failure; it has no foreign records. Do not hand-edit a cursor. | Repair verification |
| R-05 Onchain history transient failure | Controlled SANL-X fault only; reload the history read once. | At most one safe backend retry; terminal response is HTTP 503 `LOCAL_CHAIN_READ_UNAVAILABLE`, not HTTP 408. No aggregate history substitutes for local-chain history. | Repair verification |
| R-06 FX quote-only unavailable | Only with explicit, separate quote-only authorization: request one UI FX quote and stop. | A transient failure returns HTTP 503 `FX_QUOTE_ONLY_UNAVAILABLE` with the statement that no conversion or funds movement occurred. No conversion request or ledger/Card write follows. | Repair verification |

## Fixture-dependent module checks

| Case | Required fixture | Read-only action | Expected result |
| --- | --- | --- | --- |
| F-01 Deposit | In-memory tenant/customer-scoped deposit-address object | Navigate to Deposit and select the fixture address. Do **not** click preview, allocate, rotate, or submit. | Address/network render; any submit path remains untouched. |
| F-02 Withdrawal | In-memory tenant/customer-scoped eligible withdrawal-address object | Navigate to Withdrawal and select the fixture address. Do **not** click preview or submit. | Fixture address renders; no free-text bypass and no financial request. |
| F-03 Cards / `currencyId` | In-memory tenant/customer-scoped Card-product object | Navigate to Cards and inspect Card form identity. Do **not** issue a Card or request a quote/top-up. | Canonical local `currencyId`/asset identity is displayed; no legacy ISO request field is accepted. |

## Evidence and exit rule

- [ ] Record runtime SHA, route, HTTP status, sanitized response shape, trace ID,
  fixture manifest version, and PASS/FAIL for each case.
- [ ] Do not mark UAT-01, UAT-04, or UAT-06 fixed until their matching repair
  case passes in the paired candidate.
- [ ] Keep UAT-02 and UAT-03 classified as fixture dependencies unless the
  manifest is absent or violates tenant/customer/environment scope.
- [ ] Any unexpected HTTP 408, session failure, cross-tenant record, legacy
  ISO request field, enabled write path, or unverified quote is a FAIL. Stop
  only that case, record it, and continue other non-mutating cases.
- [ ] This checklist cannot authorize merge. PR #69 remains Draft until the
  final validation checklist is completely evidenced.

## Execution order after explicit user authorization

1. Verify paired backend/Worker release SHA and no-migration deployment
   evidence.
2. Verify manifest signature, expiry, exact allowlisted tenant/customer, and
   neighboring-scope negative preflight.
3. Run repair cases R-01 through R-05, then fixture cases F-01 through F-03.
4. Run R-06 only under its separately recorded quote-only authorization; do
   not perform a conversion.
5. Record results and disable/revoke fixture policy before candidate teardown.
