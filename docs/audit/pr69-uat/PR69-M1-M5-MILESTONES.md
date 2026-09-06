# PR #69 / Cregis M1–M5 Delivery Status

**Status date:** 2026-08-25. This document records the two isolated workflows; it does not authorize deployment, migration, merge, or a change to the Cregis branch.

| Milestone | Deliverable | Current status | Evidence / next gate |
| --- | --- | --- | --- |
| M1 | PR #69 four FastLink-owned local APIs: onchain deposit preview, onchain transaction history, card top-up quote, and card issue `currencyId` | **Code complete, unmerged; paired-runtime retest blocked** | Frontend Worker candidate `1f2d794...` is healthy. Backend repair candidate `4fb069c...` passed the local no-migration Backend PR Gate (158/158 suites, 1411/1411 tests) but is not deployed because the standard Railway route would execute prohibited migrations. A documented no-migration Candidate route using the existing shared DEV schema through database-enforced read-only access, plus a process-memory SANL-X allowlist design, now await implementation/security approval. Complete paired browser UAT is still required. |
| M2 | Cregis backend proxy, verified callback, local ledger posting, and post-funding coordination boundary | **Complete on isolated Cregis branch** | `feature/ucard-core-saas-platform` / `cb1f2e5`. A confirmed inbound writes local truth and a durable coordination event; it does not substitute for M1. |
| M3 | Verifiable Worker preview access, authorized candidate build SHA, full SANDBOX UAT, and PR #69 merge to `dev` | **In progress; UAT not accepted** | Browser/Worker policy gate is passed. The Worker health route reports `1f2d794...`; local Backend PR Gate evidence reports `4fb069c...` with 158/158 suites and 1411/1411 tests. They are not yet a paired runtime. The [candidate-release and SANL-X fixture design](PR69-CANDIDATE-RELEASE-AND-SANLX-FIXTURE-DESIGN.md) is complete, but its no-migration read-only Candidate service and exact tenant/customer process-memory manifest are not yet implemented/provisioned. |
| M4 | Cregis Admin management UI and Lovable client UI | **Pending; can proceed independently** | May expose isolated third-party asset deposit/withdrawal views through FastLink backend. It cannot claim PR #69 local-chain/U-card functionality. |
| M5 | End-to-end flow: Cregis inbound → local ledger balance → PR #69 local chain/U-card business | **Blocked** | Requires M1 accepted, M3 merged/UAT accepted, the exact production release gate, tenant opt-in, and a PR #69-owned consumer. Cregis still must not call or emulate the four local APIs. |

## Boundary rules that remain in force

1. Cregis is an external asset provider only. Its callback can update the FastLink local ledger after verification and idempotency; that ledger remains the truth source.
2. Before M3, a confirmed Cregis deposit yields only `DEFERRED` PR #69 coordination. It records a safe reason such as `PR69_RELEASE_GATE_NOT_READY` and triggers no local onchain/U-card action.
3. After M3, a `REQUESTED` coordination event is still not a direct Cregis-to-PR#69 HTTP call. The separately deployed PR #69-owned consumer must re-check its own release/tenant/contract gates and resolve its own `currencyId`.
4. Browser Worker policy verification is complete for the observed SANDBOX preview. The authorized runtime SHA and all required UAT behavior remain release conditions; they cannot be satisfied with mock data, a policy bypass, or by Cregis completion.

## Next authorized action

Implement and security-review the [no-migration candidate release and SANL-X allowlist design](PR69-CANDIDATE-RELEASE-AND-SANLX-FIXTURE-DESIGN.md), then let Codex provision an immutable paired candidate and scoped process-memory fixture manifest after explicit authorization before running [the read-only SANL-X checklist](PR69-SANL-X-READONLY-RETEST.md). Preserve PR #69 as Draft until every merge gate has a passing evidence record.
