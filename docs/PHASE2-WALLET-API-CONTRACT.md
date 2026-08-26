# FastLink Prime Wallet API Contract

Status: DEV SANDBOX client contract
Frontend branch: `feature/phase2-onchain-client`
Lovable source snapshot: `75f00453f2c2f5ed7b57cdc37c6d83bf29197338`
Backend boundary: this repository is a React client plus a transparent Cloudflare `/api` proxy. It has no Controller, Service, ORM or database runtime. The DTOs below are the exact paired Backend contract required for PR #69; this branch implements the typed client, fail-closed parsing and UI flow only.

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
| Cards | `POST /api/v1/cards/virtual` | Virtual Card issue, resolved from local `currencyId` |
| Cards | `POST /api/v1/cards/physical` | Physical Card issue, resolved from local `currencyId` |
| Cards | `GET /api/v1/cards/{id}/limits` | Card limits |
| Cards | `POST /api/v1/cards/{id}/limits` | Card limit update |
| Cards | `GET /api/v1/cards/{id}/transactions` | Card transaction timeline |
| Cards | `GET /api/v1/cards/{id}/timeline` | Card lifecycle timeline |
| Cards | `POST /api/v1/cards/{id}/topup-quotes` | Local Card funding quote; no ledger mutation |
| Cards | `POST /api/v1/cards/{id}/topups` | Wallet-to-Card funding bound to a quote ID |
| Cards | `POST /api/v1/cards/{id}/report-lost` | Lost report and SANDBOX replacement |
| Onchain | `GET /api/v2/wallet/onchain/networks` | CAIP-2 network directory |
| Onchain | `GET /api/v2/wallet/onchain/deposit-addresses` | Permanent tenant address history |
| Onchain | `POST /api/v2/wallet/onchain/deposit-addresses` | Allocate/return active address |
| Onchain | `POST /api/v2/wallet/onchain/deposit-addresses/{addressId}/rotate` | Retire and rotate address |
| Onchain | `POST /api/v2/wallet/onchain/fx/quotes` | Five-minute locked quote for onchain transfer |
| Onchain | `POST /api/v2/wallet/onchain/deposits/preview` | Local chain-deposit fee/confirmation preview; no ledger mutation |
| Onchain | `POST /api/v2/wallet/onchain/deposits` | Create uncredited deposit intent |
| Onchain | `GET /api/v2/wallet/onchain/deposits/{transferId}` | Track deposit state |
| Onchain | `GET /api/v2/wallet/onchain/transactions` | Tenant/customer-scoped persisted chain transfer history |
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

### Independent deposit preview and intent

`POST /api/v2/wallet/onchain/deposits/preview` uses the following body. It is read-only in financial terms and has no `Idempotency-Key` because it creates no reservation or ledger entry.

```json
{
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt",
  "depositAddressId": "address_opaque_id",
  "grossAmount": "100"
}
```

The backend response is local-only and must be returned exactly as calculated by Backend:

```json
{
  "previewId": "deposit_preview_opaque_id",
  "depositAddressId": "address_opaque_id",
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt",
  "assetCode": "USDT",
  "fees": {"grossAmount":"100","platformFee":"0","networkFee":"0","fxFee":"0","netAmount":"100"},
  "confirmationTarget": 12,
  "expiresAt": "2026-08-21T08:05:00.000Z",
  "externalProviderCalled": false
}
```

The client clears this preview if the network, address or amount changes. An expired, tampered, cross-tenant or mismatched preview must never be accepted for a deposit intent.

Header: `Idempotency-Key: deposit:<uuid>`

```json
{
  "networkId": "eip155:1",
  "assetId": "flp_asset_usdt",
  "depositAddressId": "address_opaque_id",
  "grossAmount": "100",
  "previewId": "deposit_preview_opaque_id"
}
```

The frontend does not credit funds and does not infer confirmation state. It displays the returned transfer and refreshes it through `GET /deposits/{transferId}`. The backend must bind the idempotency key to the tenant/customer, normalized request and resulting local transfer.

### Onchain transaction list

`GET /api/v2/wallet/onchain/transactions?limit=25&direction=DEPOSIT&networkId=eip155%3A1&assetId=flp_asset_usdt&state=CONFIRMING&cursor=opaque`

- `limit` defaults to 25 and must be between 1 and 100.
- All filter values and the opaque cursor are optional. The authenticated Cookie Session determines tenant and customer; **there is no browser-controlled `tenantId` query parameter**.
- The response is `{items: OnchainTransfer[], nextCursor: string|null}`. Each list item uses the transfer DTO below. It must contain only that public DTO, not `tenantId`, provider fields or ledger internals.
- The backend orders deterministically and scopes every query by `tenant_id` and the authorized customer. A cursor from another tenant, filter set or sort order must yield `ONCHAIN_CURSOR_INVALID`, not an empty or cross-tenant page.

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
- Both `POST /cards/virtual` and `POST /cards/physical` now accept exactly `{ "currencyId": "flp_asset_usd", "alias": "optional" }`; arbitrary ISO `currency` is not accepted. A bare three-letter ISO display value such as `USD` is not a local `currencyId` and is rejected before request construction. The response must echo public `currencyId` and public display `currency`, and the client verifies that the response `currencyId` exactly matches its request.

### Card top-up quote and execution

`POST /api/v1/cards/{cardId}/topup-quotes` accepts:

```json
{"sourceWalletAccountId":"wallet_opaque_id","amount":"25"}
```

It returns a local, short-lived quote:

```json
{
  "quoteId":"card_topup_quote_opaque_id",
  "cardId":"card_opaque_id",
  "sourceWalletAccountId":"wallet_opaque_id",
  "assetId":"flp_asset_usd",
  "currency":"USD",
  "amount":"25",
  "fees":{"grossAmount":"25","platformFee":"0","networkFee":"0","fxFee":"0","netAmount":"25"},
  "totalDebitAmount":"25",
  "expiresAt":"2026-08-21T08:05:00.000Z",
  "externalProviderCalled":false
}
```

`POST /api/v1/cards/{cardId}/topups` requires an `Idempotency-Key` and accepts only `{ "sourceWalletAccountId":"wallet_opaque_id", "quoteId":"card_topup_quote_opaque_id" }`. It must reject a changed amount, changed source account, another card, expired quote, duplicate quote use or cross-tenant quote; the backend is the only party that creates the debit/credit ledger entries. The UI shows Backend values and performs no amount arithmetic.

## Required paired Backend implementation (not executable in this frontend repository)

The Cloudflare Worker in this repository only validates origin policy and transparently proxies `/api/*`; adding Controller, Service or database code here would be a false implementation. The paired Backend must implement the following local modules without any third-party/Cregis call:

| API | Controller | Service/database behavior |
|---|---|---|
| Deposit preview | `POST /v2/wallet/onchain/deposits/preview` | Authenticate Cookie Session + CSRF; resolve `tenant_id`/customer; verify active local deposit address belongs to both; validate string amount; calculate/persist a short-lived tenant-scoped preview; no ledger mutation. |
| Chain list | `GET /v2/wallet/onchain/transactions` | Authenticate Cookie Session; query persisted local chain-transfer records with `tenant_id` and authorized customer predicate before filters/cursor; return public DTO only. |
| Card top-up quote | `POST /v1/cards/:cardId/topup-quotes` | Authenticate Cookie Session + CSRF; verify local card and source account ownership under `tenant_id`; validate string amount; calculate/persist an immutable tenant-scoped quote; no ledger mutation. |
| Card issue `currencyId` | `POST /v1/cards/virtual`, `POST /v1/cards/physical` | Authenticate Cookie Session + CSRF; resolve `currency_id` only from tenant-enabled local product/asset records; persist the idempotency record and return public `currencyId` plus display ISO currency. Never infer a tenant-global currency. |

All persisted preview, quote, transfer and idempotency records must carry `tenant_id`; financial amounts remain canonical strings/fixed decimal in storage and are never floating point. The service must use one transaction for a completed top-up's idempotency check, quote consumption and balanced local ledger posting. It must fail closed on any missing local data, expired state or ambiguous write outcome.

### Error codes

The controller returns `{code,message,traceId}` without provider, SQL, tenant or secret details. The client preserves the last verified view and surfaces the trace ID through `WalletGatewayError`.

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `ONCHAIN_AMOUNT_INVALID`, `CARD_TOPUP_AMOUNT_INVALID`, `CURRENCY_ID_INVALID` | Amount is not a canonical string or the requested local identifier is invalid. |
| 401/403 | `AUTH_REQUIRED`, `CSRF_REQUIRED`, `RESOURCE_FORBIDDEN` | Missing session/CSRF or an object outside the caller's tenant/customer scope. |
| 404 | `DEPOSIT_ADDRESS_NOT_FOUND`, `CARD_NOT_FOUND`, `SOURCE_ACCOUNT_NOT_FOUND` | Local resource does not exist in the authenticated scope. |
| 409 | `PREVIEW_MISMATCH`, `PREVIEW_EXPIRED`, `CARD_TOPUP_QUOTE_EXPIRED`, `CARD_TOPUP_QUOTE_CONSUMED`, `IDEMPOTENCY_CONFLICT`, `ONCHAIN_CURSOR_INVALID` | Immutable preview/quote/cursor or idempotent write cannot safely be reused. |
| 422 | `CURRENCY_ID_UNSUPPORTED`, `CARD_TOPUP_QUOTE_MISMATCH` | Tenant configuration/product or quote binding does not permit the request. |
| 503 | `CARD_TOPUP_QUOTE_UNAVAILABLE`, `LOCAL_ONCHAIN_UNAVAILABLE` | Backend cannot safely calculate a local result; no substitute response is returned. |

The acceptance tests must additionally prove: no `tenantId` client parameter is accepted, a cross-tenant opaque ID yields 403/404 without existence disclosure, duplicate idempotency keys return the same completed result only for byte-equivalent payloads, and an expired/tampered preview never creates a transfer or ledger entry.
