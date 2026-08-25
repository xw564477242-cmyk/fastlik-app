# PR #69 / Cregis M1–M5 Delivery Status

**Status date:** 2026-08-25. This document records the two isolated workflows; it does not authorize deployment, migration, merge, or a change to the Cregis branch.

| Milestone | Deliverable | Current status | Evidence / next gate |
| --- | --- | --- | --- |
| M1 | PR #69 four FastLink-owned local APIs: onchain deposit preview, onchain transaction history, card top-up quote, and card issue `currencyId` | **Code complete, unmerged** | Frontend contract implementation `e9400f6`; paired backend implementation `c18409a`; focused backend 5 suites / 45 tests, build, and lint passed. Complete authorized browser UAT is still required. |
| M2 | Cregis backend proxy, verified callback, local ledger posting, and post-funding coordination boundary | **Complete on isolated Cregis branch** | `feature/ucard-core-saas-platform` / `cb1f2e5`. A confirmed inbound writes local truth and a durable coordination event; it does not substitute for M1. |
| M3 | Verifiable Worker preview access, authorized candidate build SHA, full SANDBOX UAT, and PR #69 merge to `dev` | **Blocked by environment/UAT** | Current preview access/build is not yet accepted as authorized PR #69 evidence. Security policy verification and exact runtime SHA are required before running [the UAT runbook](PR69-AUTHORIZED-SANDBOX-UAT-RUNBOOK.md). |
| M4 | Cregis Admin management UI and Lovable client UI | **Pending; can proceed independently** | May expose isolated third-party asset deposit/withdrawal views through FastLink backend. It cannot claim PR #69 local-chain/U-card functionality. |
| M5 | End-to-end flow: Cregis inbound → local ledger balance → PR #69 local chain/U-card business | **Blocked** | Requires M1 accepted, M3 merged/UAT accepted, the exact production release gate, tenant opt-in, and a PR #69-owned consumer. Cregis still must not call or emulate the four local APIs. |

## Boundary rules that remain in force

1. Cregis is an external asset provider only. Its callback can update the FastLink local ledger after verification and idempotency; that ledger remains the truth source.
2. Before M3, a confirmed Cregis deposit yields only `DEFERRED` PR #69 coordination. It records a safe reason such as `PR69_RELEASE_GATE_NOT_READY` and triggers no local onchain/U-card action.
3. After M3, a `REQUESTED` coordination event is still not a direct Cregis-to-PR#69 HTTP call. The separately deployed PR #69-owned consumer must re-check its own release/tenant/contract gates and resolve its own `currencyId`.
4. Browser Worker policy verification and the authorized runtime SHA are environment conditions, not code defects. They cannot be satisfied with mock data, a policy bypass, or by Cregis completion.

## Next authorized action

When the security owner supplies an authorized preview URL and verifiable runtime SHA, execute the runbook, complete the final validation checklist, and preserve PR #69 as Draft until every merge gate has a passing evidence record.
