#!/bin/sh
set -eu

: "${VITE_FASTLINK_ENVIRONMENT:?VITE_FASTLINK_ENVIRONMENT is required}"
: "${VITE_FASTLINK_API_URL:?VITE_FASTLINK_API_URL is required}"
: "${RAILWAY_GIT_COMMIT_SHA:?RAILWAY_GIT_COMMIT_SHA is required}"

case "$VITE_FASTLINK_ENVIRONMENT" in
  LOCAL|SANDBOX|TEST|UAT|PRODUCTION) ;;
  *) echo "Invalid VITE_FASTLINK_ENVIRONMENT" >&2; exit 1 ;;
esac

case "$VITE_FASTLINK_API_URL" in
  /api|https://*) ;;
  *) echo "VITE_FASTLINK_API_URL must be same-origin /api or an explicit HTTPS URL" >&2; exit 1 ;;
esac

if [ "$VITE_FASTLINK_ENVIRONMENT" = "SANDBOX" ] \
  && [ "$VITE_FASTLINK_API_URL" != "/api" ]; then
  echo "SANDBOX Wallet must use the same-origin /api proxy" >&2
  exit 1
fi

envsubst '$VITE_FASTLINK_ENVIRONMENT $VITE_FASTLINK_API_URL $RAILWAY_GIT_COMMIT_SHA' \
  < /tmp/runtime-config.template.js \
  > /usr/share/nginx/html/runtime-config.js
