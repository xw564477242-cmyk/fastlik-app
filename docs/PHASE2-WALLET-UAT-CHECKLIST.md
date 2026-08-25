# Prime Wallet P1 + Phase2 UAT Checklist

Use only a dedicated DEV SANDBOX end-user Session. Do not use production credentials or external-provider calls.

## Build and security

- [ ] Frontend branch is `feature/phase2-onchain-client`; the paired local Backend changes are isolated to `feature/phase2-onchain-wallet` and no Cregis branch, shared DEV or production deployment has changed.
- [ ] Production build rejects `VITE_FASTLINK_DATA_SOURCE=mock`.
- [ ] Cookie Session login/restoration succeeds; no token is stored in browser storage.
- [ ] Mutating requests include CSRF and Idempotency-Key.
- [ ] A current 401 signs the user out and clears Wallet snapshots.
- [ ] Source audit reports no Admin routes/components/data, Supabase, Bearer, `sessionStorage`, `credentials:omit` or page-level `fetch`.

## Home and assets

- [ ] Total ledger value and total available value load from `/api/v1/wallet/total-assets` without placeholder text.
- [ ] Every asset shows Ledger, Pending and Available separately.
- [ ] Frozen/closed USDT account retains ledger value and displays available value exactly as Backend `0`.
- [ ] No browser calculation changes any financial string.

## Onchain deposit

- [ ] Network directory shows Ethereum `eip155:1` / 12 and BSC `eip155:56` / 15.
- [ ] Allocate returns a tenant-isolated active address with CAIP-10 identity.
- [ ] Rotate returns a successor and history still includes the retired address.
- [ ] Deposit preview uses the selected Backend address, local asset ID, string amount and a new Idempotency-Key; it returns only Backend-calculated facts and does not write a ledger entry.
- [ ] Deposit intent uses the immutable, unexpired preview ID, selected Backend address, local asset ID and a new Idempotency-Key.
- [ ] Deposit starts uncredited and status refresh shows detection/confirmation/settlement progress.
- [ ] Expired, tampered, changed-amount or cross-tenant preview fails closed and creates no transfer.
- [ ] Fee split is rendered only from the Backend preview or transfer response.

## Onchain withdrawal

- [ ] Destination dropdown includes only saved address-book entries for the selected network.
- [ ] There is no free-text withdrawal address input.
- [ ] Preview renders 600-second cooling period, `addressEligibleAt`, 1000-USDT threshold, `approvalRequired` and mandatory compliance.
- [ ] Before cooling completion, Backend error is shown with no stale preview.
- [ ] Submit is unavailable until a successful preview and uses one new Idempotency-Key.
- [ ] Status refresh covers compliance, approval, queue, broadcast, confirmation and settlement.
- [ ] Insufficient/frozen available balance is rejected by Backend and no optimistic debit is displayed.

## Transactions and reorganization

- [ ] Transfer detail displays gross, platform fee, network fee, FX fee and net as exact strings.
- [ ] Onchain transaction list comes from the tenant-scoped Backend list endpoint; browser requests do not contain `tenantId`, page size never exceeds 100 and an invalid cursor fails closed.
- [ ] Hash and confirmations render only when supplied by Backend.
- [ ] `REORGED` displays account frozen, receivable/manual-review reason and does not lower the displayed ledger value locally.
- [ ] Existing P1 wallet transaction list and transaction detail remain available.

## Cards

- [ ] Product selection displays Backend `assetId`, type, currency, opening and monthly fee.
- [ ] Opening quote renders before physical Card issue.
- [ ] Virtual and physical Card issue use the product-local `currencyId`, optional alias and one Idempotency-Key; unsupported or foreign IDs fail closed.
- [ ] Lost-report targets the selected Card and creates one replacement request.
- [ ] Card top-up quote uses the selected owned wallet account and string amount; no browser quote or financial arithmetic is used.
- [ ] Card top-up consumes one matching, unexpired quote ID with one Idempotency-Key, and renders the Backend receipt exactly once.
- [ ] Changed source/account/amount/card, stale quote, quote replay and unavailable local quote configuration fail closed without an optimistic debit.
- [ ] Existing virtual Card, freeze/unfreeze, limits, Card transaction detail and lifecycle timeline still pass.

## FX

- [ ] Quote request and response use Backend source/target asset and decimal strings.
- [ ] No conversion-submit action exists in the migrated Phase2 panel.
- [ ] No frontend FX, fee or net calculation exists.

## PR #69 local API readiness

- [ ] `POST /api/v2/wallet/onchain/deposits/preview` returns a tenant-owned immutable preview ID, expiry and canonical string facts; no ledger mutation occurs.
- [ ] `GET /api/v2/wallet/onchain/transactions` returns only locally persisted records scoped from the authenticated session; it accepts no caller-supplied `tenantId`.
- [ ] `POST /api/v1/cards/{cardId}/topup-quotes` returns an immutable expiry-bound quote; the corresponding top-up atomically consumes it exactly once.
- [ ] `POST /api/v1/cards/virtual` and `POST /api/v1/cards/physical` accept only tenant-scoped local `currencyId` values and preserve that ID in the response.
- [ ] The paired Backend test report proves tenant isolation, amount-string validation, preview/quote expiry and replay, idempotency conflicts, and unavailable-configuration fail-closed behavior.

## Acceptance result

- [ ] All automated suites are green.
- [ ] All applicable DEV browser checks above pass.
- [ ] Remaining unchecked items are recorded with response status, trace ID, exact reproduction and Backend/Frontend ownership.
