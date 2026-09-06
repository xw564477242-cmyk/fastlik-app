# PR #69 Merge Execution Record

**Recorded:** 2026-08-26  
**Scope:** Phase 1 only. PR #69 wallet-client merge and its paired local
backend PR merge. No Cregis branch action is included.

## Version locks

| Repository | Pull request | Reviewed head | `dev` merge commit | Result |
| --- | --- | --- | --- | --- |
| `fastlik-backend` | [#260](https://github.com/xw564477242-cmyk/fastlik-backend/pull/260) | `4fb069c180f736f312a282218dc1610b509aaf79` | `4c6273e459843af2e00bca68fc127e4689fc2279` | Merged to `dev` |
| `fastlik-app` | [#69](https://github.com/xw564477242-cmyk/fastlik-app/pull/69) | `1f2d794d367dea471e7db128d87be3179de1365e` | `91ce890fcb27ed042d9547d3083c63bd2e2e31d6` | Merged to `dev` |

The backend review head passed the Backend PR Gate at 158/158 suites and
1411/1411 tests. The merged frontend `dev` deployment completed successfully:
[Deploy Wallet Dev to Cloudflare run 32929537141](https://github.com/xw564477242-cmyk/fastlik-app/actions/runs/32929537141).
The deployed Worker reports `SANDBOX` and build SHA
`91ce890fcb27ed042d9547d3083c63bd2e2e31d6`.

## Safety evidence

- No Railway Candidate deployment, migration, schema change, fixture action,
  or database write was initiated from this execution.
- No real funding, withdrawal, Card issue, Card top-up, chain action, FX
  conversion, or Cregis request/callback was initiated.
- Cregis remains outside this Phase 1 merge record.

## DEV read-only UAT status

**Status: BLOCKED — no valid SANDBOX Cookie-Session is available to the
automated browser.**

The merged DEV Worker loads at
`https://fastlink-wallet-dev.adhesive-snowshoe.workers.dev/` and displays the
correct `SANDBOX` / build-SHA identity, but presents the secure sign-in page.
No sign-in, registration, session creation, or credential retrieval was
attempted. A direct browser read of the Railway backend health endpoint was
blocked by the browser client, so no policy bypass was attempted.

The required read-only route sequence remains pending: assets, deposit
addresses, withdrawal addresses, onchain history, Card products, and the FX
safe-unavailable surface. It must use an already authorized SANDBOX session and
must not invoke any business write path.

## Next gate

Before starting the separate Cregis integration PR, provide an authorized,
non-interactive SANDBOX session mechanism for the automated browser or direct
Codex to an already authenticated browser context. Record the read-only UAT
result before advancing this execution record.
