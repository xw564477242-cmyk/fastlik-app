# Prime Wallet P1 + Phase2 UAT Checklist

Use only a dedicated DEV SANDBOX end-user Session. Do not use production credentials or external-provider calls.

## Build and security

- [ ] Branch is `feature/phase2-onchain-client`; Backend repository has no changes.
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
- [ ] Deposit intent uses the selected Backend address, USDT asset ID and a new Idempotency-Key.
- [ ] Deposit starts uncredited and status refresh shows detection/confirmation/settlement progress.
- [ ] Fee split is rendered only from the transfer response.

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
- [ ] Hash and confirmations render only when supplied by Backend.
- [ ] `REORGED` displays account frozen, receivable/manual-review reason and does not lower the displayed ledger value locally.
- [ ] Existing P1 wallet transaction list and transaction detail remain available.

## Cards

- [ ] Product selection displays Backend `assetId`, type, currency, opening and monthly fee.
- [ ] Opening quote renders before physical Card issue.
- [ ] Physical Card issue uses the product currency, optional alias and one Idempotency-Key.
- [ ] Lost-report targets the selected Card and creates one replacement request.
- [ ] Card top-up allows only an owned wallet account and renders the Backend receipt.
- [ ] Existing virtual Card, freeze/unfreeze, limits, Card transaction detail and lifecycle timeline still pass.

## FX

- [ ] Quote request and response use Backend source/target asset and decimal strings.
- [ ] No conversion-submit action exists in the migrated Phase2 panel.
- [ ] No frontend FX, fee or net calculation exists.

## Contract-governance observations

- [ ] Product team acknowledges v2 currently lacks a standalone deposit preview.
- [ ] Product team acknowledges v2 currently lacks an onchain transfer-history list.
- [ ] Product team acknowledges Card create still accepts `currency`, while product catalog exposes `assetId`.
- [ ] Product team acknowledges there is no dedicated Card top-up quote endpoint.

## Acceptance result

- [ ] All automated suites are green.
- [ ] All applicable DEV browser checks above pass.
- [ ] Remaining unchecked items are recorded with response status, trace ID, exact reproduction and Backend/Frontend ownership.
