import assert from "node:assert/strict";
import test from "node:test";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";
import {
  WALLET_ACCOUNT_BALANCE_MAX_JSON_BYTES,
  parseWalletAccountBalance,
  readWalletAccountBalance,
  walletAccountBalancePath,
  walletAccountBalanceRequestWasAborted,
  walletAccountBalanceRetainsSnapshotOnFailure,
} from "../src/walletAccountBalance.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";

const NOW = Date.parse("2026-08-02T08:00:00.000Z");
const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-balance-01",
  tenantId: "tenant-balance-01",
  customerId: "customer-balance-01",
  environment: "TEST" as const,
  expiresAt: "2026-08-02T09:00:00.000Z",
  ...overrides,
});
const account = {
  id: "account-1",
  accountCode: "WALLET-USD-1",
  name: "Primary USD",
  assetCode: "USD",
  status: "ACTIVE" as const,
  currentBalance: "100",
  postedBalance: "80",
  pendingBalance: "20",
  availableBalance: "80",
  updatedAt: "2026-08-02T08:00:00.000Z",
};
const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  accountId: "account-1",
  customerId: "customer-private",
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: "100",
  postedBalance: "80",
  pendingBalance: "20",
  holdBalance: "20",
  availableBalance: "80",
  updatedAt: "2026-08-02T08:00:00.000Z",
  ...overrides,
});

test("builds only the exact account balance GET path", () => {
  assert.equal(walletAccountBalancePath("account-1"), "/v1/wallet/accounts/account-1/balance");
  for (const invalid of ["a", "../tenant", "account/1", " account-1", "", null]) {
    assert.throws(() => walletAccountBalancePath(invalid), /account id/);
  }
});

test("selects and freezes only the public account balance fields", () => {
  const parsed = parseWalletAccountBalance(payload({ providerSecret: "not-public" }));
  assert.deepEqual(Object.keys(parsed), [
    "accountId", "assetCode", "status", "currentBalance", "postedBalance",
    "pendingBalance", "holdBalance", "availableBalance", "updatedAt",
  ]);
  assert.equal(Object.hasOwn(parsed, "customerId"), false);
  assert.equal(Object.hasOwn(parsed, "providerSecret"), false);
  assert.equal(Object.isFrozen(parsed), true);
});

test("rejects oversized, deep, duplicate-key and accessor-like JSON inputs", () => {
  assert.throws(
    () => parseWalletAccountBalance(`{"padding":"${"x".repeat(WALLET_ACCOUNT_BALANCE_MAX_JSON_BYTES)}"}`),
    /consumer limit/,
  );
  const nested = `${"[".repeat(18)}0${"]".repeat(18)}`;
  assert.throws(() => parseWalletAccountBalance(`{"extra":${nested},${payload().slice(1)}`), /Invalid/);
  assert.throws(
    () => parseWalletAccountBalance(payload().replace('"accountId":"account-1"', '"accountId":"account-1","\\u0061ccountId":"account-2"')),
    /Duplicate/,
  );
  const inherited = Object.create({ accountId: "account-1" });
  assert.throws(() => parseWalletAccountBalance(inherited), /response|consumer/);
});

test("enforces canonical decimal, ledger, enum and timestamp invariants", () => {
  for (const invalid of [
    { currentBalance: "101" },
    { holdBalance: "19" },
    { availableBalance: "79" },
    { postedBalance: "080" },
    { postedBalance: "1234567890123456789" },
    { pendingBalance: "20.0" },
    { assetCode: "usd" },
    { status: "PENDING" },
    { updatedAt: "2026-08-02T08:00:00Z" },
  ]) assert.throws(() => parseWalletAccountBalance(payload(invalid)), /Invalid/);
});

test("binds the exact GET to actor, tenant, customer, environment and expiry", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "TEST", NOW);
  assert.ok(scope);
  const calls: unknown[] = [];
  const result = await readWalletAccountBalance(async request => {
    calls.push(request);
    return payload();
  }, active, "TEST", scope, account, undefined, () => NOW);
  assert.equal(result.accountId, account.id);
  assert.deepEqual(calls, [{ path: "/v1/wallet/accounts/account-1/balance", method: "GET", signal: undefined }]);

  for (const altered of [
    session({ actorId: "actor-other" }), session({ tenantId: "tenant-other" }),
    session({ customerId: "customer-other" }), session({ environment: "SANDBOX" }),
    session({ expiresAt: "2026-08-02T08:00:00.000Z" }),
  ]) {
    let called = false;
    await assert.rejects(
      readWalletAccountBalance(async () => { called = true; return payload(); }, altered, "TEST", scope, account, undefined, () => NOW),
      /session/,
    );
    assert.equal(called, false);
  }
});

test("rejects expiry, account or asset changes after transport without committing data", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "TEST", NOW)!;
  let clock = NOW;
  await assert.rejects(readWalletAccountBalance(async () => {
    clock = Date.parse(active.expiresAt);
    return payload();
  }, active, "TEST", scope, account, undefined, () => clock), /expired/);
  await assert.rejects(readWalletAccountBalance(async () => payload({ accountId: "account-2" }), active, "TEST", scope, account, undefined, () => NOW), /selected account/);
  await assert.rejects(readWalletAccountBalance(async () => payload({ assetCode: "EUR" }), active, "TEST", scope, account, undefined, () => NOW), /selected account/);
});

test("aborts before transport and rejects an in-flight late response", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "TEST", NOW)!;
  const preAborted = new AbortController();
  preAborted.abort();
  let calls = 0;
  await assert.rejects(readWalletAccountBalance(async () => { calls += 1; return payload(); }, active, "TEST", scope, account, preAborted.signal, () => NOW), value => walletAccountBalanceRequestWasAborted(value));
  assert.equal(calls, 0);

  const controller = new AbortController();
  let release!: (raw: string) => void;
  const pending = readWalletAccountBalance(() => new Promise(resolve => { release = resolve; }), active, "TEST", scope, account, controller.signal, () => NOW);
  await Promise.resolve();
  controller.abort();
  release(payload());
  await assert.rejects(pending, value => walletAccountBalanceRequestWasAborted(value));
});

test("clears on 401 and retains a verified snapshot only for transient failures", () => {
  const error = (status: number, message = "failure") => Object.freeze({ status, message });
  assert.equal(sessionFailureRequiresClear(error(401)), true);
  assert.equal(walletAccountBalanceRetainsSnapshotOnFailure(error(401)), false);
  assert.equal(sessionFailureRequiresClear(error(403)), false);
  assert.equal(walletAccountBalanceRetainsSnapshotOnFailure(error(403)), false);
  for (const status of [0, 408, 429, 500, 503]) {
    assert.equal(sessionFailureRequiresClear(error(status)), false);
    assert.equal(walletAccountBalanceRetainsSnapshotOnFailure(error(status)), true);
  }
  let accessed = false;
  const hostile = Object.defineProperty({}, "status", { get() { accessed = true; return 500; } });
  assert.equal(walletAccountBalanceRetainsSnapshotOnFailure(hostile), false);
  assert.equal(sessionFailureRequiresClear(hostile), false);
  assert.equal(accessed, false);
});
