# FastLink Prime Wallet API Contract

Status: DEV SANDBOX client contract
Frontend branch: `feature/phase2-onchain-client`
Lovable source snapshot: `75f00453f2c2f5ed7b57cdc37c6d83bf29197338`
Backend boundary: frozen; this client does not modify Backend code or contracts.

## Transport and security

- Every API request passes through `WalletGateway`; page and feature modules do not call `fetch`.
- `HttpWalletGateway` uses same-origin `/api`, `credentials: include`, `X-CSRF-Token` for writes, `X-Trace-Id` for every request and `Idempotency-Key` for financial/card writes.
- No Bearer token, browser storage Session, `credentials: omit`, Supabase or Admin dependency is permitted.
- Any current-session HTTP 401 emits `fastlink:session-invalid`; the App clears authenticated Wallet state.
- `VITE_FASTLINK_DATA_SOURCE=backend|mock` selects the implementation. A production build with `mock` fails immediately.
- `MockWalletGateway` and `HttpWalletGateway` return values through the same DTO parsers.
- Decimal amounts are strings. The frontend never calculates balances, exchange rates, fees or net amounts.

## Namespace map

| Module | Method and path | Client operation |
|---|---|---|
| Session | `POST /api/v1/auth/login` | Create Cookie Session |
| Session | `POST /api/v1/auth/refresh` | Rotate/refresh Cookie Session |
| Session | `POST /api/v1/auth/logout` | Revoke Cookie Session |
| Session | `GET /api/v1/session` | Restore current Session |
| Assets | `GET /api/v1/wallet/assets` | Immutable asset/currency ID catalog |
| Assets | `GET /api/v1/wallet/total-assets?valuationAssetId=flp_asset_usd` | Total ledger and available valuation |
| Assets | `GET /api/v1/wallet/balances` | Ledger/Pending/Available per asset |
| Accounts | `GET /api/v1/wallet/accounts` | Current customer-owned accounts |
| Transactions | `GET /api/v1/wallet/transactions` | Wallet transaction history |
| Transactions | `GET /api/v1/wallet/transactions/{transactionId}` | P1 transaction detail |
| Address book | `GET /api/v1/wallet/withdrawal-addresses` | Saved withdrawal destinations |
| FX | `POST /api/v1/wallet/fx/quotes` | Quote-only P1 conversion preview; no conversion submit |
| Cards | `GET /api/v1/cards/products` | Products with `assetId`, currency and fees |
| Cards | `POST /api/v1/cards/opening-quotes` | Opening fee quote |
| Cards | `POST /api/v1/cards/virtual` | Virtual Card issue |
| Cards | `POST /api/v1/cards/physical` | Physical Card issue |
| Cards | `GET /api/v1/cards/{id}/limits` | Card limits |
| Cards | `POST /api/v1/cards/{id}/limits` | Card limit update |
| Cards | `GET /api/v1/cards/{id}/transactions` | Card transaction timeline |
| Cards | `GET /api/v1/cards/{id}/timeline` | Card lifecycle timeline |
| Cards | `POST /api/v1/cards/{id}/topups` | Wallet-to-Card funding |
| Cards | `POST /api/v1/cards/{id}/report-lost` | Lost report and SANDBOX replacement |
| Onchain | `GET /api/v2/wallet/onchain/networks` | CAIP-2 network directory |
| Onchain | `GET /api/v2/wallet/onchain/deposit-addresses` | Permanent tenant address history |
| Onchain | `POST /api/v2/wallet/onchain/deposit-addresses` | Allocate/return active address |
| Onchain | `POST /api/v2/wallet/onchain/deposit-addresses/{addressId}/rotate` | Retire and rotate address |
| Onchain | `POST /api/v2/wallet/onchain/fx/quotes` | Five-minute locked quote for onchain transfer |
| Onchain | `POST /api/v2/wallet/onchain/deposits` | Create uncredited deposit intent |
| Onchain | `GET /api/v2/wallet/onchain/deposits/{transferId}` | Track deposit state |
| Onchain | `POST /api/v2/wallet/onchain/withdrawals/preview` | Backend fee/cooling/approval/compliance preview |
| Onchain | `POST /api/v2/wallet/onchain/withdrawals` | Reserve available balance and submit to compliance |
| Onchain | `GET /api/v2/wallet/onchain/withdrawals/{transferId}` | Track withdrawal state |

## Core v2 DTOs

### Network

```json
{
  "caip2Id": "eip155:1",
  "displayName": "Ethereum",
  "confirmationTarget": 12,
  "executionMode": "EXTERNAL_CUSTODY_CONTRACT_ONLY",
  "externalProviderCalled": false
}
```

Supported contracts are `eip155:1` (12 confirmations) and `eip155:56` (15 confirmations).

### Deposit address request

```json
{
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt"
}
```

The response contains `addressId`, `networkId`, `assetId`, `assetCode`, `address`, `caip10AccountId`, `rotationIndex`, `status`, `allocatedAt`, `retiredAt` and `externalProviderCalled=false`. Retired addresses remain in history.

### Deposit intent

Header: `Idempotency-Key: deposit:<uuid>`

```json
{
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt",
  "depositAddressId": "address_opaque_id",
  "grossAmount": "100"
}
```

The frontend does not credit funds and does not infer confirmation state. It displays the returned transfer and refreshes it through `GET /deposits/{transferId}`.

### Withdrawal preview and submit

```json
{
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt",
  "withdrawalAddressId": "saved_address_book_id",
  "netAmount": "100"
}
```

The address must come from `/api/v1/wallet/withdrawal-addresses`; free-text destinations are intentionally not supported. The preview response supplies:

```json
{
  "fees": {
    "grossAmount": "101.1",
    "platformFee": "1",
    "networkFee": "0.1",
    "fxFee": "0",
    "netAmount": "100"
  },
  "approvalThreshold": "1000",
  "approvalRequired": false,
  "addressCoolingPeriodSeconds": 600,
  "addressEligibleAt": "2026-08-21T08:10:00.000Z",
  "complianceGateEnabled": true,
  "externalProviderCalled": false
}
```

Submit uses the exact preview input plus a new `Idempotency-Key`. The UI does not compare the amount with 1000 or calculate cooldown/fees; it displays Backend facts.

### Transfer response and transaction detail

```json
{
  "transferId": "transfer_opaque_id",
  "direction": "WITHDRAWAL",
  "state": "PENDING_COMPLIANCE",
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt",
  "assetCode": "USDT",
  "fees": {
    "grossAmount": "101.1",
    "platformFee": "1",
    "networkFee": "0.1",
    "fxFee": "0",
    "netAmount": "100"
  },
  "confirmations": 0,
  "confirmationTarget": 12,
  "transactionHash": null,
  "approvalRequired": false,
  "complianceStatus": "PENDING",
  "reversalRequired": false,
  "manualReviewReason": null,
  "externalProviderCalled": false,
  "createdAt": "2026-08-21T08:00:00.000Z",
  "updatedAt": "2026-08-21T08:00:00.000Z"
}
```

Closed states: `AWAITING_DETECTION`, `DETECTED`, `CONFIRMING`, `VALIDATING`, `PENDING_COMPLIANCE`, `PENDING_APPROVAL`, `QUEUED`, `BROADCASTED`, `CONFIRMED`, `SETTLED`, `REORGED`, `FAILED`.

When `state=REORGED`, the UI shows “account frozen — manual review”, `manualReviewReason`, fee breakdown and Backend balances. It never deducts a value locally.

## Card currency/asset semantics

- `/cards/products` returns immutable `assetId` and presentation `currency`.
- Product selection and fee quote are keyed by `templateId`; the UI presents `assetId` as the currency identity.
- The frozen card creation DTO currently accepts `{currency, alias}` rather than `currencyId`. The client therefore chooses currency only from the selected product and does not allow an arbitrary card currency.
- No separate Card top-up quote endpoint exists in the frozen contract. The client shows the Card opening quote and sends Card top-up only through the confirmed `/topups` write contract.

## Frozen-backend gaps (not invented by frontend)

1. v2 has no separate deposit-preview endpoint; fee split becomes available on the created deposit transfer.
2. v2 has no transfer-history list endpoint; the client can track transfer IDs created in the active Session. P1 wallet history remains available through `/api/v1/wallet/transactions`.
3. Card creation has no `currencyId` request field; `assetId` is available on product responses only.
4. Card top-up has no dedicated quote endpoint.

These gaps are documented for contract governance. This migration does not change the frozen Backend and does not fabricate substitute responses.
