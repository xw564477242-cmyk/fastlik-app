# FastLink Development Environment Baseline

Status: BUILDING  
Established: 2026-07-24  
Component: fastlik-app  
Branch: `dev`

## Binding

- `main` is the production source branch.
- `dev` is the development source branch.
- The development business environment is `SANDBOX`; it must never report `PRODUCTION`.
- Development must use an independent Supabase test project and an independent Railway development environment.
- Production database URLs, production service domains, production secrets, certificates, PAN/CVV/PIN, and production customer/card data must not enter this branch or its deployment.
- Thredd, FOMO Pay, and sponsor-bank adapters remain `DISABLED` until official sandbox credentials are supplied. Disabled adapters must return `BLOCKED · External Dependency`, never synthetic PASS data.
- Promotion is one-way through reviewed pull requests: `feature/* -> dev -> main`. Direct development deployment from `main` is forbidden.

## Runtime contract

| Variable | Required development value |
|---|---|
| `VITE_FASTLINK_ENVIRONMENT` | `SANDBOX` |
| `VITE_FASTLINK_API_URL` | Dedicated Railway Dev API ending in `/api` |
| `VITE_FASTLINK_BUILD_SHA` | Deployed `dev` commit SHA |

## Gate

This baseline does not assert that cloud resources exist. The environment becomes usable only after:

1. A dedicated Supabase test project is created and migrations are applied there.
2. A dedicated Railway development environment/service deploys this repository's `dev` branch.
3. Runtime health reports `environment=SANDBOX`.
4. Development CORS origins are explicit and the production origins are not reused as a shortcut.
5. Negative isolation probes confirm the development database and URL are different from production.
