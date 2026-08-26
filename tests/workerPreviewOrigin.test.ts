import assert from "node:assert/strict";
import test from "node:test";
import { proxyHeaders, resolvePreviewOriginPolicy } from "../worker.js";

const PREVIEW_ORIGIN = "https://fastlink-wallet-pr-69-dev.adhesive-snowshoe.workers.dev";
const TRUSTED_DEV_ORIGIN = "https://fastlink-wallet-dev.adhesive-snowshoe.workers.dev";

test("shared Workers preserve the existing proxy behavior when preview bindings are absent", () => {
  const url = new URL("https://fastlink-wallet-dev.adhesive-snowshoe.workers.dev/api/v1/session");
  assert.equal(resolvePreviewOriginPolicy({}, url, undefined), undefined);
  const headers = proxyHeaders(new Request(url, { headers: { origin: url.origin } }), url, undefined);
  assert.equal(headers.get("origin"), url.origin);
});

test("preview policy requires both exact HTTPS origin bindings", () => {
  const url = new URL(`${PREVIEW_ORIGIN}/api/v1/session`);
  assert.throws(
    () => resolvePreviewOriginPolicy({ FASTLINK_PUBLIC_ORIGIN: PREVIEW_ORIGIN }, url, PREVIEW_ORIGIN),
    /configured together/,
  );
  assert.throws(
    () => resolvePreviewOriginPolicy({
      FASTLINK_ENVIRONMENT: "SANDBOX",
      FASTLINK_PUBLIC_ORIGIN: `${PREVIEW_ORIGIN}/path`,
      FASTLINK_UPSTREAM_ORIGIN: TRUSTED_DEV_ORIGIN,
    }, url, PREVIEW_ORIGIN),
    /HTTPS origins without paths/,
  );
});

test("preview policy rejects host mismatch and browser Origin near-matches", () => {
  const env = {
    FASTLINK_ENVIRONMENT: "SANDBOX",
    FASTLINK_PUBLIC_ORIGIN: PREVIEW_ORIGIN,
    FASTLINK_UPSTREAM_ORIGIN: TRUSTED_DEV_ORIGIN,
  };
  assert.throws(
    () => resolvePreviewOriginPolicy(env, new URL("https://evil.example/api/v1/session"), PREVIEW_ORIGIN),
    /request host does not match/,
  );
  assert.deepEqual(
    resolvePreviewOriginPolicy(env, new URL(`${PREVIEW_ORIGIN}/api/v1/session`), `${PREVIEW_ORIGIN}.evil.example`),
    { allowed: false },
  );
});

test("preview policy rewrites only a validated browser Origin for the trusted Backend guard", () => {
  const url = new URL(`${PREVIEW_ORIGIN}/api/v1/auth/login`);
  const policy = resolvePreviewOriginPolicy({
    FASTLINK_ENVIRONMENT: "SANDBOX",
    FASTLINK_PUBLIC_ORIGIN: PREVIEW_ORIGIN,
    FASTLINK_UPSTREAM_ORIGIN: TRUSTED_DEV_ORIGIN,
  }, url, PREVIEW_ORIGIN);
  assert.deepEqual(policy, { allowed: true, upstreamOrigin: TRUSTED_DEV_ORIGIN });
  const headers = proxyHeaders(new Request(url, {
    method: "POST",
    headers: { origin: PREVIEW_ORIGIN, "x-forwarded-host": "evil.example" },
  }), url, policy);
  assert.equal(headers.get("origin"), TRUSTED_DEV_ORIGIN);
  assert.equal(headers.get("x-forwarded-host"), url.host);
});

test("non-browser reads without Origin remain possible but never synthesize an Origin", () => {
  const url = new URL(`${PREVIEW_ORIGIN}/api/health`);
  const policy = resolvePreviewOriginPolicy({
    FASTLINK_ENVIRONMENT: "SANDBOX",
    FASTLINK_PUBLIC_ORIGIN: PREVIEW_ORIGIN,
    FASTLINK_UPSTREAM_ORIGIN: TRUSTED_DEV_ORIGIN,
  }, url, null);
  const headers = proxyHeaders(new Request(url), url, policy);
  assert.equal(policy?.allowed, true);
  assert.equal(headers.has("origin"), false);
});

test("preview Origin mapping is impossible outside SANDBOX or to another upstream", () => {
  const url = new URL(`${PREVIEW_ORIGIN}/api/health`);
  assert.throws(() => resolvePreviewOriginPolicy({
    FASTLINK_ENVIRONMENT: "PRODUCTION",
    FASTLINK_PUBLIC_ORIGIN: PREVIEW_ORIGIN,
    FASTLINK_UPSTREAM_ORIGIN: TRUSTED_DEV_ORIGIN,
  }, url, PREVIEW_ORIGIN), /only in SANDBOX/);
  assert.throws(() => resolvePreviewOriginPolicy({
    FASTLINK_ENVIRONMENT: "SANDBOX",
    FASTLINK_PUBLIC_ORIGIN: PREVIEW_ORIGIN,
    FASTLINK_UPSTREAM_ORIGIN: "https://fastlink-admin-dev.adhesive-snowshoe.workers.dev",
  }, url, PREVIEW_ORIGIN), /trusted Dev Wallet Origin/);
});
