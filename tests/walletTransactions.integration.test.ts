import assert from "node:assert/strict";
import test from "node:test";
import {
  createWalletTransactionHistoryRequestIdentity,
  normalizeWalletTransactionFilters,
  readWalletTransactionHistory,
  walletTransactionFilterKey,
  walletTransactionHistoryRequestIsCurrent,
  walletTransactionPath,
  type WalletTransactionTransportRequest,
} from "../src/walletTransactions.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment =
  configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
    ? configuredEnvironment
    : null;
const integration = environment ? test : test.skip;

const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-integration-01",
  tenantId: "tenant-integration-01",
  customerId: "customer-integration-01",
  environment: environment!,
  expiresAt: "2099-08-01T08:00:00.000Z",
  ...overrides,
});

const transaction = (id: string, minute: number, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: "25.5",
  direction: "OUTGOING",
  createdAt: `2026-08-01T00:${String(minute).padStart(2, "0")}:00.000Z`,
  updatedAt: `2026-08-01T00:${String(minute).padStart(2, "0")}:00.000Z`,
  ...overrides,
});

const filters = normalizeWalletTransactionFilters({
  type: "TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  limit: 25,
});
const cursorPage2 = "Y3Vyc29yLXBhZ2UtMg";

integration(`Wallet transaction history exact consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: WalletTransactionTransportRequest[] = [];
  const firstItems = Array.from({ length: 25 }, (_, index) =>
    transaction(`transaction-${String(99 - index).padStart(2, "0")}`, 59 - index));
  const transport = async (request: WalletTransactionTransportRequest) => {
    calls.push(request);
    return request.path.includes("cursor=")
      ? JSON.stringify({ items: [transaction("transaction-74", 34)], nextCursor: null })
      : JSON.stringify({ items: firstItems, nextCursor: cursorPage2 });
  };
  const currentSession = session();
  const first = await readWalletTransactionHistory(
    transport,
    currentSession,
    environment!,
    filters,
  );
  const second = await readWalletTransactionHistory(
    transport,
    currentSession,
    environment!,
    filters,
    first,
  );
  assert.deepEqual(calls, [
    { path: walletTransactionPath(filters), method: "GET" },
    { path: walletTransactionPath(filters, cursorPage2), method: "GET" },
  ]);
  assert.equal(second.items.length, 26);
  assert.equal(second.nextCursor, null);
  for (const item of second.items)
    assert.deepEqual(Object.keys(item).sort(), [
      "amount",
      "assetCode",
      "createdAt",
      "direction",
      "id",
      "status",
      "type",
      "updatedAt",
    ]);
});

integration("makes one GET per page, never retries, and keeps filter-bound cursor state", async () => {
  let calls = 0;
  const failingTransport = async () => {
    calls += 1;
    throw new Error("mock failure");
  };
  await assert.rejects(
    readWalletTransactionHistory(failingTransport, session(), environment!, filters),
    /mock failure/,
  );
  assert.equal(calls, 1);

  const fullPage = Array.from({ length: 25 }, (_, index) =>
    transaction(`transaction-${String(99 - index).padStart(2, "0")}`, 59 - index));
  const first = await readWalletTransactionHistory(
    async () => JSON.stringify({ items: fullPage, nextCursor: cursorPage2 }),
    session(),
    environment!,
    filters,
  );
  await assert.rejects(
    readWalletTransactionHistory(
      async () => {
        calls += 1;
        return "{}";
      },
      session(),
      environment!,
      { ...filters, assetCode: "EUR" },
      first,
    ),
    /filters changed/,
  );
  assert.equal(calls, 1);
});

integration("denies environment mismatch and expiry before transport and rejects stale writes", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return JSON.stringify({ items: [], nextCursor: null });
  };
  await assert.rejects(
    readWalletTransactionHistory(
      transport,
      session({ environment: environment === "SANDBOX" ? "TEST" : "SANDBOX" }),
      environment!,
      filters,
    ),
    /unavailable/,
  );
  await assert.rejects(
    readWalletTransactionHistory(
      transport,
      session({ expiresAt: "2020-01-01T00:00:00.000Z" }),
      environment!,
      filters,
    ),
    /unavailable/,
  );
  assert.equal(calls, 0);

  const scope = walletTransferSessionScope(session(), environment!)!;
  const request = createWalletTransactionHistoryRequestIdentity(1, scope, filters, null);
  const key = walletTransactionFilterKey(filters);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 1, scope, key, null), true);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 2, scope, key, null), false);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 1, null, null, null), false);
});

integration("fails closed on internal fields, duplicate IDs, cursor loops and page regression", async () => {
  const unsafe = async () =>
    JSON.stringify({
      items: [transaction("transaction-01", 59, { journalIds: ["private"] })],
      nextCursor: null,
    });
  await assert.rejects(
    readWalletTransactionHistory(unsafe, session(), environment!, filters),
    /fields/,
  );

  const fullPage = Array.from({ length: 25 }, (_, index) =>
    transaction(`transaction-${String(99 - index).padStart(2, "0")}`, 59 - index));
  const first = await readWalletTransactionHistory(
    async () => JSON.stringify({ items: fullPage, nextCursor: cursorPage2 }),
    session(),
    environment!,
    filters,
  );
  await assert.rejects(
    readWalletTransactionHistory(
      async () =>
        JSON.stringify({ items: [transaction("transaction-99", 59)], nextCursor: null }),
      session(),
      environment!,
      filters,
      first,
    ),
    /Duplicate|monotonic/,
  );
  await assert.rejects(
    readWalletTransactionHistory(
      async () =>
        JSON.stringify({
          items: Array.from({ length: 25 }, (_, index) =>
            transaction(`transaction-${String(74 - index).padStart(2, "0")}`, 34 - index)),
          nextCursor: cursorPage2,
        }),
      session(),
      environment!,
      filters,
      first,
    ),
    /loop|rollback/,
  );
});
