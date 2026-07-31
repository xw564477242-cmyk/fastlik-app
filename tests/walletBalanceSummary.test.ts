import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_BALANCE_SUMMARY_MAX_ITEMS,
  WALLET_BALANCE_SUMMARY_PATH,
  captureWalletAccountsVersion,
  parseWalletBalanceSummary,
  parseWalletBalanceSummaryItem,
  walletBalanceSummaryReadAllowed,
  walletBalanceSummaryRequestIsCurrent,
} from "../src/walletBalanceSummary.ts";
import type { WalletAccountRecord } from "../src/walletData.ts";

const rawItem = (assetCode = "USD"): Record<string, unknown> => ({
  assetCode,
  availableBalance: "80",
  ledgerBalance: "100",
  pendingBalance: "20",
  updatedAt: "2026-07-31T08:00:00.000Z",
});

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
  assert.deepEqual(parseWalletBalanceSummary({ items: [] }), { items: [] });
});

test("reconstructs exactly the five public summary fields and verifies ledger arithmetic", () => {
  const item = parseWalletBalanceSummaryItem(rawItem());
  assert.deepEqual(Object.keys(item).sort(), [
    "assetCode", "availableBalance", "ledgerBalance", "pendingBalance", "updatedAt",
  ]);
  assert.throws(
    () => parseWalletBalanceSummaryItem({ ...rawItem(), ledgerBalance: "99" }),
    /ledger equation/,
  );
  assert.equal(parseWalletBalanceSummaryItem({
    ...rawItem(), availableBalance: "-1.5", pendingBalance: "2.25", ledgerBalance: "0.75",
  }).ledgerBalance, "0.75");
});

test("accepts only canonical bounded amount strings", () => {
  for (const availableBalance of [
    "-999999999999999999999999999999999999.999999999999999999",
    "-0.5",
    "0",
    "1",
    "1.123456789012345678",
  ]) {
    const pendingBalance = "0";
    assert.equal(parseWalletBalanceSummaryItem({
      ...rawItem(), availableBalance, pendingBalance, ledgerBalance: availableBalance,
    }).availableBalance, availableBalance);
  }
  for (const availableBalance of ["-0", "00", "01", "+1", "1.0", "1.230", "1e3", "1.1234567890123456789", 1]) {
    assert.throws(() => parseWalletBalanceSummaryItem({ ...rawItem(), availableBalance }), /availableBalance/);
  }
});

test("rejects inherited, accessor, Proxy and unknown payloads without getter execution", () => {
  assert.throws(() => parseWalletBalanceSummaryItem({ ...rawItem(), providerBalance: "secret" }), /fields/);
  assert.throws(() => parseWalletBalanceSummary({ items: [], tenantId: "private" }), /fields/);

  const inherited = Object.create({ tenantId: "private" });
  Object.assign(inherited, rawItem());
  assert.throws(() => parseWalletBalanceSummaryItem(inherited), /item/);

  let getterCalls = 0;
  const accessor = rawItem();
  Object.defineProperty(accessor, "providerBalance", {
    enumerable: true,
    get() { getterCalls += 1; return "must-not-read"; },
  });
  assert.throws(() => parseWalletBalanceSummaryItem(accessor), /item/);
  assert.equal(getterCalls, 0);

  let proxyGets = 0;
  const proxy = new Proxy(rawItem(), {
    get(target, property, receiver) { proxyGets += 1; return Reflect.get(target, property, receiver); },
  });
  assert.throws(() => parseWalletBalanceSummaryItem(proxy), /item/);
  assert.equal(proxyGets, 0);
});

test("rejects oversized, duplicate, non-monotonic and malformed asset summaries", () => {
  assert.throws(
    () => parseWalletBalanceSummary({ items: Array.from({ length: 51 }, (_, index) => rawItem(`A${String(index).padStart(2, "0")}`)) }),
    /item limit/,
  );
  assert.throws(() => parseWalletBalanceSummary({ items: [rawItem("USD"), rawItem("USD")] }), /asset order/);
  assert.throws(() => parseWalletBalanceSummary({ items: [rawItem("USD"), rawItem("EUR")] }), /asset order/);
  assert.throws(() => parseWalletBalanceSummary({ items: [rawItem("usd")] }), /assetCode/);
  const sparse = new Array(1);
  assert.throws(() => parseWalletBalanceSummary({ items: sparse }), /items fields/);
  const extended = [rawItem()];
  Object.defineProperty(extended, "debug", { value: "private", enumerable: true });
  assert.throws(() => parseWalletBalanceSummary({ items: extended }), /items fields/);
});

test("accepts only canonical UTC millisecond timestamps", () => {
  for (const updatedAt of [
    "0",
    "2026-02-30T00:00:00.000Z",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.000+00:00",
    "2026-01-01 00:00:00.000Z",
  ]) assert.throws(() => parseWalletBalanceSummaryItem({ ...rawItem(), updatedAt }), /updatedAt/);
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
