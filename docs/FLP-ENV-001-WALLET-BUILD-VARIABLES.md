# FLP-ENV-001 — Wallet Build Variables

| Variable Name | Environment | Required | Secret | Source | Current Value Status | Used By | Last Verified | Owner |
|---|---|---:|---:|---|---|---|---|---|
| `VITE_FASTLINK_API_URL` | ALL | Yes | No | Build platform | CONFIGURED · PRODUCTION API | `apiClient.ts` | 2026-07-24 | DevOps |
| `VITE_FASTLINK_ENVIRONMENT` | ALL | Yes | No | Build platform | CONFIGURED · PRODUCTION | `apiClient.ts`, session gate | 2026-07-24 | DevOps |
| `VITE_FASTLINK_BUILD_SHA` | ALL | Yes | No | GitHub Pages revision | CONFIGURED · RUNTIME INJECTION | runtime metadata | 2026-07-24 | DevOps |

## Enforcement

- Production contains no static balances, transactions, cards, or mock fallback.
- Login requires a Backend-issued bearer session and build/session environment match.
- Freeze and Unfreeze call Backend and then reload persisted card state.
- Every request carries `X-Trace-Id`.
- Errors display the real HTTP status and Trace ID.
- Any failed request clears stale server data and displays `Unavailable`.
