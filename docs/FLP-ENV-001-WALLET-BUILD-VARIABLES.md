# FLP-ENV-001 — Wallet Build Variables

| Variable Name | Environment | Required | Secret | Source | Current Value Status | Used By | Last Verified | Owner |
|---|---|---:|---:|---|---|---|---|---|
| `VITE_FASTLINK_API_URL` | ALL | Yes | No | Build platform | NEEDS_DEPLOYMENT_CONFIGURATION | `apiClient.ts` | 2026-07-23 | DevOps |
| `VITE_FASTLINK_ENVIRONMENT` | ALL | Yes | No | Build platform | NEEDS_DEPLOYMENT_CONFIGURATION | `apiClient.ts`, session gate | 2026-07-23 | DevOps |
| `VITE_FASTLINK_BUILD_SHA` | ALL | Yes | No | CI commit SHA | NEEDS_CI_CONFIGURATION | runtime metadata | 2026-07-23 | DevOps |

## Enforcement

- Production contains no static balances, transactions, cards, or mock fallback.
- Login requires a Backend-issued bearer session and build/session environment match.
- Freeze and Unfreeze call Backend and then reload persisted card state.
- Every request carries `X-Trace-Id`.
- Errors display the real HTTP status and Trace ID.
- Any failed request clears stale server data and displays `Unavailable`.
