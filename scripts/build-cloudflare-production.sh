#!/usr/bin/env bash
set -euo pipefail

: "${FASTLINK_BUILD_SHA:?FASTLINK_BUILD_SHA is required}"

if [[ ! "$FASTLINK_BUILD_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "FASTLINK_BUILD_SHA must be a full Git SHA" >&2
  exit 1
fi

VITE_FASTLINK_ENVIRONMENT="PRODUCTION" \
VITE_FASTLINK_API_URL="https://fastlink-wallet.adhesive-snowshoe.workers.dev/api" \
VITE_FASTLINK_BUILD_SHA="$FASTLINK_BUILD_SHA" \
VITE_PUBLIC_BASE="/" \
npm run build

grep -R -F "fastlink-wallet.adhesive-snowshoe.workers.dev/api" dist >/dev/null
if grep -R -E "fastlink-backend-(dev|test)|exquisite-surprise-production" dist >/dev/null; then
  echo "Build contains a direct Backend origin" >&2
  exit 1
fi
