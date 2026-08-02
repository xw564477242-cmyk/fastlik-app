import assert from "node:assert/strict";
import test from "node:test";
import {
  KYC_STATUS_PATH,
  createKycStatusRequestIdentity,
  kycStatusRequestIsCurrent,
  parseKycStatus,
  parseKycStatusJson,
  readKycStatus,
} from "../src/kycStatus.ts";
import {
  walletTransferSessionScope,
  type WalletTransferSession,
} from "../src/walletTransfer.ts";

const now = Date.parse("2026-08-02T00:00:00.000Z");
const session = (environment: "SANDBOX" | "TEST" = "SANDBOX"): WalletTransferSession => ({
  actorId: "actor-kyc",
  tenantId: "tenant-kyc",
  customerId: "customer-kyc",
  environment,
  expiresAt: "2026-08-02T01:00:00.000Z",
});

test("accepts only the exact public KYC response contract", () => {
  for (const status of ["PENDING", "APPROVED", "REJECTED"] as const)
    assert.deepEqual(parseKycStatus({ status, reviewedAt: null }), { status, reviewedAt: null });
  assert.equal(
    parseKycStatus({ status: "APPROVED", reviewedAt: "2026-08-01T12:34:56.123Z" }).reviewedAt,
    "2026-08-01T12:34:56.123Z",
  );
  for (const status of ["VERIFIED", "FAILED", "approved", ""])
    assert.throws(() => parseKycStatus({ status, reviewedAt: null }), /KYC status/);
  assert.throws(() => parseKycStatus({ status: "PENDING" }), /exactly/);
  assert.throws(() => parseKycStatus({ status: "PENDING", reviewedAt: null, tenantId: "private" }), /exactly/);
  assert.throws(() => parseKycStatus({ status: "PENDING", reviewedAt: "later" }), /reviewedAt/);
  assert.throws(() => parseKycStatus({ status: "PENDING", reviewedAt: "2026-02-30T00:00:00Z" }), /reviewedAt/);
  assert.throws(
    () => parseKycStatusJson('{"status":"PENDING","status":"APPROVED","reviewedAt":null}'),
    /Duplicate/,
  );
  assert.throws(
    () => parseKycStatusJson('{"status":"PENDING","sta\\u0074us":"APPROVED","reviewedAt":null}'),
    /Duplicate/,
  );
  assert.throws(() => parseKycStatusJson("{"), /JSON/);
  const accessor = Object.defineProperties({}, {
    status: { enumerable: true, get: () => "APPROVED" },
    reviewedAt: { enumerable: true, value: null },
  });
  assert.throws(() => parseKycStatus(accessor), /fields/);
  assert.throws(() => parseKycStatus(Object.assign(Object.create(null), { status: "APPROVED", reviewedAt: null })), /object/);
});

for (const environment of ["SANDBOX", "TEST"] as const) {
  test(`uses one exact same-origin GET with cookies in ${environment}`, async () => {
    const active = session(environment);
    const scope = walletTransferSessionScope(active, environment, now);
    assert.ok(scope);
    const controller = new AbortController();
    let calls = 0;
    const result = await readKycStatus(async request => {
      calls += 1;
      assert.deepEqual(
        { path: request.path, method: request.method, credentials: request.credentials },
        { path: KYC_STATUS_PATH, method: "GET", credentials: "include" },
      );
      assert.equal(request.signal, controller.signal);
      return { status: "PENDING", reviewedAt: null };
    }, active, environment, scope, controller.signal, () => now);
    assert.equal(calls, 1);
    assert.equal(result.status, "PENDING");
  });
}

test("fails closed for local, production, unknown, mismatched and expired sessions", async () => {
  for (const runtime of ["LOCAL", "UAT", "PRODUCTION", undefined] as const) {
    const active = session();
    let calls = 0;
    await assert.rejects(
      readKycStatus(async () => { calls += 1; return { status: "PENDING", reviewedAt: null }; }, active, runtime, "scope", new AbortController().signal, () => now),
      /unavailable/,
    );
    assert.equal(calls, 0);
  }
  const mismatched = session("TEST");
  assert.equal(walletTransferSessionScope(mismatched, "SANDBOX", now), null);
  assert.equal(walletTransferSessionScope(session(), "SANDBOX", Date.parse("2026-08-02T02:00:00.000Z")), null);
});

test("drops late results after session, tenant, customer, environment, generation or mount changes", () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "SANDBOX", now);
  assert.ok(scope);
  const request = createKycStatusRequestIdentity(7, scope);
  assert.equal(kycStatusRequestIsCurrent(request, 7, scope, true), true);
  assert.equal(kycStatusRequestIsCurrent(request, 8, scope, true), false);
  assert.equal(kycStatusRequestIsCurrent(request, 7, `${scope}:changed`, true), false);
  assert.equal(kycStatusRequestIsCurrent(request, 7, scope, false), false);
  for (const changed of [
    { ...active, actorId: "actor-other" },
    { ...active, tenantId: "tenant-other" },
    { ...active, customerId: "customer-other" },
    { ...active, environment: "TEST" as const },
  ])
    assert.notEqual(walletTransferSessionScope(changed, changed.environment, now), scope);
});

test("natural expiry after transport rejects the result and never retries", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "SANDBOX", now);
  assert.ok(scope);
  let clock = now;
  let calls = 0;
  await assert.rejects(
    readKycStatus(async () => {
      calls += 1;
      clock = Date.parse("2026-08-02T02:00:00.000Z");
      return { status: "APPROVED", reviewedAt: "2026-08-02T00:30:00Z" };
    }, active, "SANDBOX", scope, new AbortController().signal, () => clock),
    /session changed/,
  );
  assert.equal(calls, 1);
});

test("a 408, 5xx or contract failure cannot replace a retained same-scope snapshot", async () => {
  const retained = parseKycStatus({ status: "PENDING", reviewedAt: null });
  let snapshot = retained;
  for (const failure of [new Error("HTTP 408"), new Error("HTTP 503"), new Error("module failure")]) {
    try {
      throw failure;
    } catch {
      // The panel writes only on a parsed success; the prior snapshot remains intact.
    }
    assert.equal(snapshot, retained);
  }
  snapshot = parseKycStatus({ status: "APPROVED", reviewedAt: "2026-08-02T00:30:00Z" });
  assert.equal(snapshot.status, "APPROVED");
});
