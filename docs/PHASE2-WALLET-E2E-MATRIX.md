# Prime Wallet P1 + Phase2 E2E Matrix

All financial assertions compare exact decimal strings returned by Backend. No test reproduces fee, rate, net or balance calculations in the browser.

| ID | Journey | Expected result | Automation |
|---|---|---|---|
| GW-01 | Backend data source | All page requests pass `WalletGateway`; only the HTTP transport contains `fetch` | `walletGatewayArchitecture.test.ts` |
| GW-02 | Preview data source | Mock and HTTP results pass the same DTO parsers | `walletGatewayContracts.test.ts` |
| GW-03 | Production build | `VITE_FASTLINK_DATA_SOURCE=mock` fails closed | source/build gate |
| AUTH-01 | Login and restore | HttpOnly Cookie Session; writes add CSRF; 401 clears current Session | existing Session suite + architecture gate |
| ASSET-01 | Total assets | Total ledger/available values come from `/total-assets`; no placeholder | DTO test + UAT |
| ASSET-02 | Balance three-state | Ledger, pending and available strings render independently | DTO test + UAT |
| ASSET-03 | Frozen account | Ledger remains visible; available is exact Backend `0` | DTO test + DEV UAT |
| DEP-01 | Network directory | Ethereum/BSC CAIP-2 identity and confirmation targets render | DTO test + DEV UAT |
| DEP-02 | Address allocation | Active tenant address and CAIP-10 identity render | DEV UAT |
| DEP-03 | Address rotation | New active address returned; retired address remains in history | DEV UAT |
| DEP-04 | Deposit intent | One idempotent POST; state starts uncredited | DEV UAT |
| DEP-05 | Deposit tracking | GET refresh advances only through Backend state | DEV UAT |
| WDR-01 | Address-book only | No free-text destination field; wrong-network addresses excluded | architecture test + DEV UAT |
| WDR-02 | 10-minute cooling | UI renders `600` and `addressEligibleAt`; Backend rejects ineligible address | DTO test + DEV UAT |
| WDR-03 | Approval threshold | UI renders `1000` and `approvalRequired`; no frontend comparison | DTO test + DEV UAT |
| WDR-04 | Compliance | Submit enabled only after preview; state enters compliance/approval flow | DEV UAT |
| WDR-05 | Withdrawal tracking | Confirmation/broadcast/settlement state refreshes | DEV UAT |
| TX-01 | Fee detail | Gross, platform, network, FX and net render exactly | DTO test + DEV UAT |
| TX-02 | Reorganization | `REORGED` displays account freeze and manual review without client debit | DTO test + DEV UAT |
| CARD-01 | Product asset ID | Product `assetId`, currency and template fee render | DEV UAT |
| CARD-02 | Physical Card | Opening quote precedes one idempotent physical issue request | DEV UAT |
| CARD-03 | Lost Card | One idempotent lost-report/replacement request | DEV UAT |
| CARD-04 | Card top-up | Owned wallet account only; Backend amount response rendered | DEV UAT |
| CARD-05 | Limits | Existing P1 Card limits read/update remains green | existing Card suite |
| CARD-06 | Transaction timeline | Existing P1 Card transaction and lifecycle timelines remain green | existing Card suite |
| FX-01 | Quote only | Quote result renders; no conversion-submit control or client calculation | existing FX suite + UAT |
| CLEAN-01 | Admin/Supabase removal | No Admin route/component/data or Supabase dependency | architecture test |
| CLEAN-02 | Legacy auth removal | No Bearer, Session storage or omitted-credentials path | architecture test |

## DEV execution order

1. `npm run test:wallet-gateway`
2. `npm test`
3. `npm run build`
4. `npm run test:cloudflare`
5. Authenticated DEV browser flow for the rows marked `DEV UAT`

The build/test run is evidence of frontend contract correctness. Financial/state acceptance remains dependent on the deployed DEV SANDBOX API and dedicated test Session.
