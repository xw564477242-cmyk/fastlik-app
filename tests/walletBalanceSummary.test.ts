import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_BALANCE_SUMMARY_MAX_ITEMS,
  WALLET_BALANCE_SUMMARY_MAX_JSON_DEPTH,
  WALLET_BALANCE_SUMMARY_MAX_JSON_BYTES,
  WALLET_BALANCE_SUMMARY_PATH,
  captureWalletAccountsVersion,
  parseWalletBalanceSummary,
  readWalletBalanceSummary,
  walletBalanceSummaryReadAllowed,
  walletBalanceSummaryRequestIsCurrent,
  walletBalanceSummaryRequestWasAborted,
  walletBalanceSummaryRetainsSnapshotOnFailure,
} from "../src/walletBalanceSummary.ts";
import type { WalletAccountRecord } from "../src/walletData.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";
import { walletTransferSessionScope, type WalletTransferSession } from "../src/walletTransfer.ts";

const rawItem = (assetCode = "USD"): Record<string, unknown> => ({
  assetCode,
  availableBalance: "80",
  ledgerBalance: "100",
  pendingBalance: "20",
  updatedAt: "2026-07-31T08:00:00.000Z",
});

const parse = (value: unknown) => parseWalletBalanceSummary(JSON.stringify(value));
const parseItem = (value: unknown) => parse({ items: [value] }).items[0];

const account = (overrides: Partial<WalletAccountRecord> = {}): WalletAccountRecord => ({
  id: "account-1",
  accountCode: "CUSTOMER-USD",
  name: "Primary Wallet",
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: "100",
  postedBalance: "80",
  pendingBalance: "20",
  availableBalance: "80",
  updatedAt: "2026-07-31T08:00:00.000Z",
  ...overrides,
});

test("uses the existing bounded authenticated Wallet balance summary contract", () => {
  assert.equal(WALLET_BALANCE_SUMMARY_PATH, "/v1/wallet/balances");
  assert.equal(WALLET_BALANCE_SUMMARY_MAX_ITEMS, 50);
  assert.equal(WALLET_BALANCE_SUMMARY_MAX_JSON_BYTES, 32_768);
  assert.equal(WALLET_BALANCE_SUMMARY_MAX_JSON_DEPTH, 16);
  const summary = parse({ items: [] });
  assert.deepEqual(summary, { items: [] });
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.items), true);
});

test("reconstructs exactly the five public summary fields and verifies ledger arithmetic", () => {
  const item = parseItem(rawItem());
  assert.deepEqual(Object.keys(item).sort(), [
    "assetCode", "availableBalance", "ledgerBalance", "pendingBalance", "updatedAt",
  ]);
  assert.throws(() => parseItem({ ...rawItem(), ledgerBalance: "99" }), /ledger equation/);
  assert.equal(parseItem({
    ...rawItem(), availableBalance: "-1.5", pendingBalance: "2.25", ledgerBalance: "0.75",
  }).ledgerBalance, "0.75");
  assert.equal(parseItem({
    ...rawItem(), availableBalance: "0", pendingBalance: "0", ledgerBalance: "9000",
  }).ledgerBalance, "9000");
  assert.equal(parseItem({
    ...rawItem(), availableBalance: "80", pendingBalance: "20", ledgerBalance: "150",
  }).ledgerBalance, "150");
});

test("accepts only canonical bounded amount strings", () => {
  for (const availableBalance of [
    "-999999999999999999999999999999999999.999999999999999999",
    "-0.5",
    "0",
    "1",
    "1.123456789012345678",
  ]) {
    assert.equal(parseItem({
      ...rawItem(), availableBalance, pendingBalance: "0", ledgerBalance: availableBalance,
    }).availableBalance, availableBalance);
  }
  for (const availableBalance of ["-0", "00", "01", "+1", "1.0", "1.230", "1e3", "1.1234567890123456789", 1]) {
    assert.throws(() => parseItem({ ...rawItem(), availableBalance }), /availableBalance/);
  }
});

test("accepts only bounded raw JSON text and exact response fields", () => {
  assert.throws(() => parseWalletBalanceSummary("not-json"), /raw JSON/);
  assert.throws(() => parseWalletBalanceSummary(" ".repeat(WALLET_BALANCE_SUMMARY_MAX_JSON_BYTES + 1)), /raw JSON/);
  assert.throws(
    () => parseWalletBalanceSummary(`{"items":[],"padding":"${"€".repeat(11_000)}"}`),
    /raw JSON size/,
  );
  assert.throws(() => parse({ items: [], tenantId: "private" }), /fields/);
  assert.throws(() => parse({ items: [{ ...rawItem(), providerBalance: "secret" }] }), /fields/);
  assert.throws(
    () => parseWalletBalanceSummary('{"items":[],"items":[{"assetCode":"USD"}]}'),
    /Duplicate Wallet balance summary JSON object key/,
  );
  assert.throws(
    () => parseWalletBalanceSummary(`${"[".repeat(WALLET_BALANCE_SUMMARY_MAX_JSON_DEPTH + 2)}null${"]".repeat(WALLET_BALANCE_SUMMARY_MAX_JSON_DEPTH + 2)}`),
    /raw JSON/,
  );
});

test("rejects inherited and accessor objects at the raw-text boundary without getter execution", () => {
  const inherited = Object.create({ tenantId: "private" }) as Record<string, unknown>;
  Object.assign(inherited, { items: [rawItem()] });
  assert.throws(() => parseWalletBalanceSummary(inherited as unknown as string), /raw JSON/);

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "items", {
    enumerable: true,
    get() { getterCalls += 1; return [rawItem()]; },
  });
  assert.throws(() => parseWalletBalanceSummary(accessor as unknown as string), /raw JSON/);
  assert.equal(getterCalls, 0);
});

test("rejects Proxy before reflection with all relevant traps remaining zero", () => {
  const traps = { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 };
  const proxy = new Proxy({ items: [rawItem()] }, {
    get() { traps.get += 1; throw new Error("get trap must not run"); },
    getPrototypeOf() { traps.getPrototypeOf += 1; throw new Error("getPrototypeOf trap must not run"); },
    ownKeys() { traps.ownKeys += 1; throw new Error("ownKeys trap must not run"); },
    getOwnPropertyDescriptor() {
      traps.getOwnPropertyDescriptor += 1;
      throw new Error("getOwnPropertyDescriptor trap must not run");
    },
  });
  assert.throws(() => parseWalletBalanceSummary(proxy as unknown as string), /raw JSON/);
  assert.deepEqual(traps, { get: 0, getPrototypeOf: 0, ownKeys: 0, getOwnPropertyDescriptor: 0 });
});

test("rejects oversized, duplicate, non-monotonic and malformed asset summaries", () => {
  assert.throws(
    () => parse({ items: Array.from({ length: 51 }, (_, index) => rawItem(`A${String(index).padStart(2, "0")}`)) }),
    /item limit/,
  );
  assert.throws(() => parse({ items: [rawItem("USD"), rawItem("USD")] }), /asset order/);
  assert.throws(() => parse({ items: [rawItem("USD"), rawItem("EUR")] }), /asset order/);
  assert.throws(() => parse({ items: [rawItem("usd")] }), /assetCode/);
  assert.throws(() => parseWalletBalanceSummary('{"items":[null]}'), /item/);
});

test("accepts only canonical UTC millisecond timestamps", () => {
  for (const updatedAt of [
    "0",
    "2026-02-30T00:00:00.000Z",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.000+00:00",
    "2026-01-01 00:00:00.000Z",
  ]) assert.throws(() => parseItem({ ...rawItem(), updatedAt }), /updatedAt/);
});

test("binds completion to session scope, selected account, every visible account field and generation", () => {
  const accounts = [account(), account({ id: "account-2", accountCode: "CUSTOMER-EUR", assetCode: "EUR" })];
  const request = {
    requestId: 7,
    scopeKey: "actor|session|tenant|customer|TEST",
    accountId: accounts[0].id,
    accountsVersion: captureWalletAccountsVersion(accounts),
  };
  assert.equal(walletBalanceSummaryRequestIsCurrent(request, 7, request.scopeKey, accounts, accounts[0]), true);
  assert.equal(walletBalanceSummaryRequestIsCurrent(request, 8, request.scopeKey, accounts, accounts[0]), false);
  for (const scope of [
    "other-actor|session|tenant|customer|TEST",
    "actor|other-session|tenant|customer|TEST",
    "actor|session|other-tenant|customer|TEST",
    "actor|session|tenant|other-customer|TEST",
    "actor|session|tenant|customer|SANDBOX",
  ]) assert.equal(walletBalanceSummaryRequestIsCurrent(request, 7, scope, accounts, accounts[0]), false);
  assert.equal(walletBalanceSummaryRequestIsCurrent(request, 7, request.scopeKey, accounts, accounts[1]), false);
  assert.equal(walletBalanceSummaryRequestIsCurrent(request, 7, request.scopeKey, [account({ status: "FROZEN" }), accounts[1]], accounts[0]), false);
});

test("stale success, error and finally perform zero writes", () => {
  const accounts = [account()];
  const request = { requestId: 1, scopeKey: "scope-a", accountId: accounts[0].id, accountsVersion: captureWalletAccountsVersion(accounts) };
  const current = () => walletBalanceSummaryRequestIsCurrent(request, 2, "scope-b", accounts, accounts[0]);
  const writes = { success: 0, error: 0, finally: 0 };
  if (current()) writes.success += 1;
  if (current()) writes.error += 1;
  if (current()) writes.finally += 1;
  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
});

test("balance summary reads are restricted to matching SANDBOX and TEST", () => {
  assert.equal(walletBalanceSummaryReadAllowed("SANDBOX", "SANDBOX"), true);
  assert.equal(walletBalanceSummaryReadAllowed("TEST", "TEST"), true);
  assert.equal(walletBalanceSummaryReadAllowed("TEST", "SANDBOX"), false);
  assert.equal(walletBalanceSummaryReadAllowed("UAT", "UAT"), false);
  assert.equal(walletBalanceSummaryReadAllowed("PRODUCTION", "PRODUCTION"), false);
});

const NOW = Date.parse("2026-08-02T08:00:00.000Z");
const activeSession = (overrides: Partial<WalletTransferSession> = {}): WalletTransferSession => ({
  actorId: "actor-1",
  tenantId: "tenant-1",
  customerId: "customer-1",
  environment: "TEST",
  expiresAt: "2026-08-02T09:00:00.000Z",
  ...overrides,
});

test("binds the GET to the exact actor, tenant, customer, environment and expiry scope", async () => {
  const session = activeSession();
  const scope = walletTransferSessionScope(session, "TEST", NOW);
  assert.ok(scope);
  const controller = new AbortController();
  const seen: unknown[] = [];
  const summary = await readWalletBalanceSummary(async (request) => {
    seen.push(request);
    return JSON.stringify({ items: [rawItem()] });
  }, session, "TEST", scope, controller.signal, () => NOW);
  assert.deepEqual(summary, { items: [rawItem()] });
  assert.deepEqual(seen, [{ path: "/v1/wallet/balances", method: "GET", signal: controller.signal }]);

  let calls = 0;
  const transport = async () => { calls += 1; return JSON.stringify({ items: [] }); };
  for (const changed of [
    activeSession({ actorId: "actor-2" }),
    activeSession({ tenantId: "tenant-2" }),
    activeSession({ customerId: "customer-2" }),
    activeSession({ environment: "SANDBOX" }),
    activeSession({ expiresAt: "2026-08-02T10:00:00.000Z" }),
  ]) {
    await assert.rejects(
      readWalletBalanceSummary(transport, changed, changed.environment, scope, undefined, () => NOW),
      /unavailable for this session/,
    );
  }
  await assert.rejects(
    readWalletBalanceSummary(transport, session, "TEST", scope, undefined, () => Date.parse(session.expiresAt!)),
    /unavailable for this session/,
  );
  await assert.rejects(
    readWalletBalanceSummary(transport, activeSession({ environment: "PRODUCTION" }), "PRODUCTION", scope, undefined, () => NOW),
    /unavailable for this session/,
  );
  assert.equal(calls, 0);
});

test("rejects expiry during the request and an aborted late response before parsing or commit", async () => {
  const session = activeSession();
  const scope = walletTransferSessionScope(session, "TEST", NOW);
  assert.ok(scope);
  let clockReads = 0;
  await assert.rejects(
    readWalletBalanceSummary(
      async () => JSON.stringify({ items: [rawItem()] }),
      session,
      "TEST",
      scope,
      undefined,
      () => (++clockReads === 1 ? NOW : Date.parse(session.expiresAt!) + 1),
    ),
    /expired during the request/,
  );

  const controller = new AbortController();
  let resolve!: (value: string) => void;
  const response = new Promise<string>((done) => { resolve = done; });
  let commits = 0;
  const read = readWalletBalanceSummary(() => response, session, "TEST", scope, controller.signal, () => NOW)
    .then(() => { commits += 1; });
  controller.abort();
  resolve('{"items":[],"items":[{"assetCode":"USD"}]}');
  await assert.rejects(read, (value) => walletBalanceSummaryRequestWasAborted(value));
  assert.equal(commits, 0);

  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let transportCalls = 0;
  await assert.rejects(
    readWalletBalanceSummary(async () => { transportCalls += 1; return '{"items":[]}'; }, session, "TEST", scope, alreadyAborted.signal, () => NOW),
    (value) => walletBalanceSummaryRequestWasAborted(value),
  );
  assert.equal(transportCalls, 0);
});

test("401 clears the session while transient failures retain only an already verified snapshot", () => {
  const error = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
  assert.equal(sessionFailureRequiresClear(error(401)), true);
  assert.equal(walletBalanceSummaryRetainsSnapshotOnFailure(error(401)), false);
  assert.equal(sessionFailureRequiresClear(error(403)), false);
  assert.equal(walletBalanceSummaryRetainsSnapshotOnFailure(error(403)), false);
  for (const status of [0, 408, 429, 500, 503]) {
    assert.equal(sessionFailureRequiresClear(error(status)), false);
    assert.equal(walletBalanceSummaryRetainsSnapshotOnFailure(error(status)), true);
  }
  for (const status of [200, 400, 404]) {
    assert.equal(walletBalanceSummaryRetainsSnapshotOnFailure(error(status)), false);
  }
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "status", { get() { getterCalls += 1; return 503; } });
  assert.equal(walletBalanceSummaryRetainsSnapshotOnFailure(accessor), false);
  assert.equal(getterCalls, 0);
});
