# PR #69 SANL-X Read-Only Retest Checklist

**Purpose:** verify the paired PR #69 backend repair and approved SANL-X
fixtures in an immutable SANDBOX candidate. This is a browser/read-interface
test only. PR #69 stays Draft.

## Preconditions

- [ ] Candidate runtime SHA is recorded and differs from the current
  `1f831ca49e778a5f69967bbe1b2f80e346a2ddd3` runtime only because the paired
  backend repair is included; browser shows `SANDBOX` and a valid Cookie-Session.
- [ ] No migration, deployment from this checklist, merge, production key, Cregis call, real chain action, funding, withdrawal, Card issue, Card top-up, transfer, or FX conversion is authorized.
- [ ] The SANL-X manifest identifies a dedicated tenant/customer/environment,
  one active deposit address, one eligible saved withdrawal address, one active
  local Card product, and zero or more scoped `OnchainTransfer` rows. Secrets,
  raw callback bodies, full addresses, and financial identifiers are redacted.
- [ ] Fixture setup is complete before the browser opens. The browser must not
  allocate an address, create an address-book entry, or create a fixture.

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
| F-01 Deposit | Active tenant-owned local deposit address | Navigate to Deposit and select the fixture address. Do **not** click preview, allocate, rotate, or submit. | Address/network render; any submit path remains untouched. |
| F-02 Withdrawal | Eligible customer-owned saved address with cooling/compliance prerequisites | Navigate to Withdrawal and select the fixture address. Do **not** click preview or submit. | Fixture address renders; no free-text bypass and no financial request. |
| F-03 Cards / `currencyId` | Active tenant-local Card product | Navigate to Cards and inspect Card form identity. Do **not** issue a Card or request a quote/top-up. | Canonical local `currencyId`/asset identity is displayed; no legacy ISO request field is accepted. |

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
