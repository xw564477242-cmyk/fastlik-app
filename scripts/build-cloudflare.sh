#!/usr/bin/env bash
set -euo pipefail

: "${FASTLINK_ENVIRONMENT:?FASTLINK_ENVIRONMENT is required}"
: "${FASTLINK_BUILD_SHA:?FASTLINK_BUILD_SHA is required}"

case "$FASTLINK_ENVIRONMENT" in
  SANDBOX|TEST|PRODUCTION) ;;
  *) echo "FASTLINK_ENVIRONMENT must be SANDBOX, TEST, or PRODUCTION" >&2; exit 1 ;;
esac

if [[ ! "$FASTLINK_BUILD_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "FASTLINK_BUILD_SHA must be a full Git SHA" >&2
  exit 1
fi

VITE_FASTLINK_ENVIRONMENT="$FASTLINK_ENVIRONMENT" \
VITE_FASTLINK_API_URL="/api" \
VITE_FASTLINK_BUILD_SHA="$FASTLINK_BUILD_SHA" \
VITE_FASTLINK_DATA_SOURCE="backend" \
VITE_PUBLIC_BASE="/" \
npm run build

npm run test:cloudflare
