import assert from "node:assert/strict";
import test from "node:test";
import type { WalletAccountTransactionHistoryState } from "../src/walletTransactions.ts";
import type { WalletBalanceSummary } from "../src/walletBalanceSummary.ts";
import type { WalletAccountRecord } from "../src/walletData.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";
import {
  WALLET_ASSET_CATALOG_MAX_JSON_BYTES,
  WALLET_ASSET_CATALOG_PATH,
  classifyOwnedWalletBalances,
  createWalletAssetCatalogRequestIdentity,
  parseWalletAssetCatalog,
  readWalletAssetCatalog,
  walletAssetCatalogRequestIsCurrent,
  walletAssetCatalogRequestWasAborted,
  walletAssetClassForOwnedAsset,
  walletAssetClassForOwnedHistory,
} from "../src/walletAssets.ts";

const NOW = Date.parse("2026-08-03T08:00:00.000Z");
const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-assets-01",
  tenantId: "tenant-assets-01",
  customerId: "customer-assets-01",
  environment: "TEST" as const,
  expiresAt: "2026-08-03T09:00:00.000Z",
  ...overrides,
});
const items = [
  { assetCode: "EUR", assetClass: "FIAT" },
  { assetCode: "MYR", assetClass: "FIAT" },
  { assetCode: "SGD", assetClass: "FIAT" },
  { assetCode: "USD", assetClass: "FIAT" },
  { assetCode: "USDT", assetClass: "DIGITAL" },
] as const;
const payload = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  environment: "TEST",
  items,
  ...overrides,
});
const account = (id: string, assetCode: string): WalletAccountRecord => ({
  id,
  accountCode: `ACCOUNT:${id}`,
  name: `${assetCode} Wallet`,
  assetCode,
  status: "ACTIVE",
  currentBalance: "10",
  postedBalance: "10",
  pendingBalance: "0",
  availableBalance: "10",
  updatedAt: "2026-08-03T08:00:00.000Z",
});

test("parses only the exact environment-bound sorted asset catalog", () => {
  const catalog = parseWalletAssetCatalog(payload(), "TEST");
  assert.deepEqual(catalog, { environment: "TEST", items });
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.items), true);
  assert.equal(Object.isFrozen(catalog.items[0]), true);
  assert.deepEqual(Object.keys(catalog), ["environment", "items"]);
  assert.deepEqual(Object.keys(catalog.items[0]), ["assetCode", "assetClass"]);
});

test("fails closed for missing, extra, duplicate, unsorted, empty or invalid metadata", () => {
  const invalid: string[] = [
    JSON.stringify({ items }),
    JSON.stringify({ environment: "TEST", items, tenantId: "private" }),
    JSON.stringify({ environment: "SANDBOX", items }),
    JSON.stringify({ environment: "TEST", items: [] }),
    JSON.stringify({ environment: "TEST", items: [items[1], items[0]] }),
    JSON.stringify({ environment: "TEST", items: [items[0], items[0]] }),
    JSON.stringify({ environment: "TEST", items: [{ assetCode: "usd", assetClass: "FIAT" }] }),
    JSON.stringify({ environment: "TEST", items: [{ assetCode: "USD", assetClass: "CRYPTO" }] }),
    JSON.stringify({ environment: "TEST", items: [{ ...items[0], provider: "private" }] }),
    `{"environment":"TEST","items":${JSON.stringify(items)},"\\u0069tems":[]}`,
  ];
  for (const raw of invalid) assert.throws(() => parseWalletAssetCatalog(raw, "TEST"));
  assert.throws(
    () => parseWalletAssetCatalog(`{"padding":"${"€".repeat(WALLET_ASSET_CATALOG_MAX_JSON_BYTES)}"}`, "TEST"),
    /size/,
  );
  let accessed = false;
  const hostile = new Proxy({}, { get() { accessed = true; return "TEST"; } });
  assert.throws(() => parseWalletAssetCatalog(hostile, "TEST"));
  assert.equal(accessed, false);
});

test("binds one exact authenticated GET to actor, tenant, customer, environment and expiry", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "TEST", NOW);
  assert.ok(scope);
  const calls: unknown[] = [];
  const result = await readWalletAssetCatalog(async request => {
    calls.push(request);
    return payload();
  }, active, "TEST", scope, undefined, () => NOW);
  assert.equal(result.environment, "TEST");
  assert.deepEqual(calls, [{ path: WALLET_ASSET_CATALOG_PATH, method: "GET", signal: undefined }]);

  for (const altered of [
    session({ actorId: "actor-other" }),
    session({ tenantId: "tenant-other" }),
    session({ customerId: "customer-other" }),
    session({ environment: "SANDBOX" }),
    session({ expiresAt: "2026-08-03T08:00:00.000Z" }),
  ]) {
    let called = false;
    await assert.rejects(
      readWalletAssetCatalog(async () => { called = true; return payload(); }, altered, "TEST", scope, undefined, () => NOW),
      /session/,
    );
    assert.equal(called, false);
  }
});

test("rejects response environment substitution, expiry, identity mutation and abort after transport", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "TEST", NOW)!;
  await assert.rejects(
    readWalletAssetCatalog(async () => payload({ environment: "SANDBOX" }), active, "TEST", scope, undefined, () => NOW),
    /environment/,
  );
  let clock = NOW;
  await assert.rejects(readWalletAssetCatalog(async () => {
    clock = Date.parse(active.expiresAt);
    return payload();
  }, active, "TEST", scope, undefined, () => clock), /expired/);
  const mutable = session();
  const mutableScope = walletTransferSessionScope(mutable, "TEST", NOW)!;
  await assert.rejects(readWalletAssetCatalog(async () => {
    mutable.customerId = "customer-replacement";
    return payload();
  }, mutable, "TEST", mutableScope, undefined, () => NOW), /expired/);

  const preAborted = new AbortController();
  preAborted.abort();
  let calls = 0;
  await assert.rejects(
    readWalletAssetCatalog(async () => { calls += 1; return payload(); }, active, "TEST", scope, preAborted.signal, () => NOW),
    value => walletAssetCatalogRequestWasAborted(value),
  );
  assert.equal(calls, 0);
  const controller = new AbortController();
  let release!: (raw: string) => void;
  const pending = readWalletAssetCatalog(
    () => new Promise(resolve => { release = resolve; }),
    active,
    "TEST",
    scope,
    controller.signal,
    () => NOW,
  );
  await Promise.resolve();
  controller.abort();
  release(payload());
  await assert.rejects(pending, value => walletAssetCatalogRequestWasAborted(value));
});

test("generation identity rejects late success from a replacement session", () => {
  const request = createWalletAssetCatalogRequestIdentity(7, "scope-a");
  assert.equal(walletAssetCatalogRequestIsCurrent(request, 7, "scope-a", true), true);
  assert.equal(walletAssetCatalogRequestIsCurrent(request, 8, "scope-a", true), false);
  assert.equal(walletAssetCatalogRequestIsCurrent(request, 7, "scope-b", true), false);
  assert.equal(walletAssetCatalogRequestIsCurrent(request, 7, "scope-a", false), false);
});

test("classifies only existing owned balances and account-bound verified history", () => {
  const catalog = parseWalletAssetCatalog(payload(), "TEST");
  const accounts = [account("account-usd", "USD"), account("account-usdt", "USDT")];
  const summary: WalletBalanceSummary = {
    items: [
      { assetCode: "USD", availableBalance: "10", ledgerBalance: "10", pendingBalance: "0", updatedAt: "2026-08-03T08:00:00.000Z" },
      { assetCode: "USDT", availableBalance: "5", ledgerBalance: "5", pendingBalance: "0", updatedAt: "2026-08-03T08:00:00.000Z" },
    ],
  };
  assert.deepEqual(
    classifyOwnedWalletBalances(catalog, accounts, summary)?.map(item => [item.assetCode, item.assetClass]),
    [["USD", "FIAT"], ["USDT", "DIGITAL"]],
  );
  assert.equal(walletAssetClassForOwnedAsset(catalog, accounts, "EUR"), null);
  assert.equal(
    classifyOwnedWalletBalances(catalog, accounts, {
      items: [...summary.items, { assetCode: "EUR", availableBalance: "1", ledgerBalance: "1", pendingBalance: "0", updatedAt: "2026-08-03T08:00:00.000Z" }],
    }),
    null,
  );
  assert.equal(classifyOwnedWalletBalances(null, accounts, summary), null);

  const history: WalletAccountTransactionHistoryState = {
    accountId: "account-usdt",
    items: [{
      id: "transaction-usdt-01",
      operationId: null,
      type: "DEPOSIT",
      status: "COMPLETED",
      assetCode: "USDT",
      amount: "5",
      direction: "INCOMING",
      createdAt: "2026-08-03T08:00:00.000Z",
      updatedAt: "2026-08-03T08:00:00.000Z",
    }],
    nextCursor: null,
    filterKey: "ALL:ALL:USDT:25",
    cursorTrail: [],
  };
  assert.equal(walletAssetClassForOwnedHistory(catalog, accounts, accounts[1], history), "DIGITAL");
  assert.equal(walletAssetClassForOwnedHistory(catalog, accounts, accounts[0], history), null);
  assert.equal(walletAssetClassForOwnedHistory(catalog, [accounts[0]], accounts[1], history), null);
  assert.equal(walletAssetClassForOwnedHistory(null, accounts, accounts[1], history), null);
});
