import assert from "node:assert/strict";
import test from "node:test";
import worker, {
  proxyHeaders,
  readOnlyUatProxyRequestAllowed,
  resolvePreviewOriginPolicy,
  runtimeIdentity,
} from "../worker.js";

const PREVIEW_ORIGIN = "https://fastlink-wallet-pr-69-dev.adhesive-snowshoe.workers.dev";
const TRUSTED_DEV_ORIGIN = "https://fastlink-wallet-dev.adhesive-snowshoe.workers.dev";
const TEST_ENV = {
  FASTLINK_ENVIRONMENT: "TEST",
  FASTLINK_INTERACTION_MODE: "READ_ONLY_UAT",
  FASTLINK_API_URL: "/api",
  FASTLINK_SERVICE_NAME: "fastlink-wallet-pr-70-preview-test",
  FASTLINK_PROXY_ID: "wallet-pr-70-preview-test",
  FASTLINK_BUILD_SHA: "a".repeat(40),
};

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

test("READ_ONLY_UAT identity is TEST-only and FULL remains the default", () => {
  assert.equal(runtimeIdentity({...TEST_ENV, FASTLINK_INTERACTION_MODE: undefined}).interactionMode, "FULL");
  assert.equal(runtimeIdentity(TEST_ENV).interactionMode, "READ_ONLY_UAT");
  assert.throws(() => runtimeIdentity({
    ...TEST_ENV,
    FASTLINK_ENVIRONMENT: "SANDBOX",
    FASTLINK_SERVICE_NAME: "fastlink-wallet-pr-70-dev",
    FASTLINK_PROXY_ID: "wallet-pr-70-dev",
  }), /only in TEST/);
  assert.throws(() => runtimeIdentity({...TEST_ENV, FASTLINK_INTERACTION_MODE: "WRITE"}), /FULL or READ_ONLY_UAT/);
});

test("READ_ONLY_UAT Worker policy has the same exact read and auth lifecycle allowlist", () => {
  for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
    assert.equal(readOnlyUatProxyRequestAllowed("/api/v1/cards/products", method), true);
  }
  for (const path of ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"]) {
    assert.equal(readOnlyUatProxyRequestAllowed(path, "POST"), true);
    assert.equal(readOnlyUatProxyRequestAllowed(path, "POST", "?next=write"), false);
  }
  for (const path of [
    "/api/v1/auth/register",
    "/api/v1/cards/virtual",
    "/api/v1/wallet/transfers",
    "/api/v1/wallet/fx/quotes",
    "/api/v1/cards/card-a/freeze",
    "/api/v1/cards/card-a/replace",
    "/api/v1/cards/card-a/renew",
    "/api/v1/cards/card-a/limits",
    "/api/v2/onchain/deposits",
  ]) {
    assert.equal(readOnlyUatProxyRequestAllowed(path, "POST"), false, path);
  }
  assert.equal(readOnlyUatProxyRequestAllowed("/api/v1/cards/card-a/limits", "PATCH"), false);
});

test("READ_ONLY_UAT Worker returns a fixed denial and performs zero Backend fetches", async () => {
  const originalFetch = globalThis.fetch;
  let backendFetches = 0;
  globalThis.fetch = async () => {
    backendFetches += 1;
    throw new Error("Backend fetch must not run");
  };
  try {
    const response = await worker.fetch(
      new Request("https://fastlink-wallet-pr-70-preview-test.example/api/v1/cards/virtual", {method: "POST"}),
      TEST_ENV,
    );
    assert.equal(response.status, 403);
    assert.equal(backendFetches, 0);
    assert.deepEqual(await response.json(), {
      code: "READ_ONLY_UAT_WRITE_BLOCKED",
      message: "This isolated TEST preview permits authenticated reads only",
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.has("x-fastlink-api-proxy"), false);
    const queriedLogin = await worker.fetch(
      new Request("https://fastlink-wallet-pr-70-preview-test.example/api/v1/auth/login?next=write", {method: "POST"}),
      TEST_ENV,
    );
    assert.equal(queriedLogin.status, 403);
    assert.equal(backendFetches, 0);
    assert.deepEqual(await queriedLogin.json(), {
      code: "READ_ONLY_UAT_WRITE_BLOCKED",
      message: "This isolated TEST preview permits authenticated reads only",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public Worker identity GETs expose the exact READ_ONLY_UAT mode and full Build SHA", async () => {
  const health = await worker.fetch(
    new Request("https://fastlink-wallet-pr-70-preview-test.example/healthz"),
    TEST_ENV,
  );
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: TEST_ENV.FASTLINK_SERVICE_NAME,
    environment: "TEST",
    buildSha: TEST_ENV.FASTLINK_BUILD_SHA,
    interactionMode: "READ_ONLY_UAT",
  });
  const runtime = await worker.fetch(
    new Request("https://fastlink-wallet-pr-70-preview-test.example/runtime-config.js"),
    TEST_ENV,
  );
  const script = await runtime.text();
  assert.match(script, /"environment":"TEST"/);
  assert.match(script, /"interactionMode":"READ_ONLY_UAT"/);
  assert.match(script, new RegExp(TEST_ENV.FASTLINK_BUILD_SHA));
  assert.equal(runtime.headers.get("cache-control"), "no-store");
});
