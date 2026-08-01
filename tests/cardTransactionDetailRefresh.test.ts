import assert from "node:assert/strict";
import test from "node:test";
import {
  cardTransactionDetailPath,
  cardTransactionDetailRefreshRequestIsCurrent,
  createCardTransactionDetailRefreshRequestIdentity,
  parseExactCardTransactionDetail,
  readCardTransactionDetailRefresh,
} from "../src/cardTransactionDetailRefresh.ts";
import {
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
} from "../src/cardTransactionHistory.ts";
import {walletTransferSessionScope} from "../src/walletTransfer.ts";

const transaction = (overrides: Record<string, unknown> = {}) => ({
  id: "tx:one",
  status: "SETTLED",
  amountMinor: "100",
  authorizedAmountMinor: "100",
  clearedAmountMinor: "100",
  settledAmountMinor: "100",
  reversedAmountMinor: "0",
  refundedAmountMinor: "0",
  currency: "USD",
  traceId: "trace:one",
  merchantName: "Before",
  merchantCategory: "5411",
  occurredAt: "2026-08-01T02:00:00.000Z",
  ...overrides,
});

const history = () => commitCardTransactionHistoryPage(
  null,
  createCardTransactionHistoryRequestIdentity(1, "scope-a", "card:one", "SETTLED", null),
  {transactions: [transaction()], nextCursor: null},
);

test("builds only the validated public selected Card transaction route", () => {
  assert.equal(cardTransactionDetailPath("card:one", "tx:one"), "/v1/cards/card%3Aone/transactions/tx%3Aone");
  assert.throws(() => cardTransactionDetailPath("../card", "tx:one"), /Invalid/);
  assert.throws(() => cardTransactionDetailPath("card:one", "tx/one"), /Invalid/);
});

test("accepts exactly 13 own data fields and fails closed on wrong identity", () => {
  const requested = history().transactions[0];
  assert.equal(parseExactCardTransactionDetail(transaction({merchantName: "After"}), requested).merchantName, "After");
  assert.throws(() => parseExactCardTransactionDetail({...transaction(), internalProviderId: "secret"}, requested), /exactly/);
  const missing = transaction();
  delete missing.traceId;
  assert.throws(() => parseExactCardTransactionDetail(missing, requested), /exactly/);
  const accessor = transaction();
  Object.defineProperty(accessor, "merchantName", {get: () => "side effect", enumerable: true});
  assert.throws(() => parseExactCardTransactionDetail(accessor, requested), /data properties/);
  assert.throws(() => parseExactCardTransactionDetail(transaction({id: "tx:wrong"}), requested), /requested transaction/);
  assert.throws(() => parseExactCardTransactionDetail(transaction({currency: "EUR"}), requested), /immutable identity/);
  assert.throws(() => parseExactCardTransactionDetail(transaction({occurredAt: "2026-08-01T02:00:01.000Z"}), requested), /immutable identity/);
});

test("binds completion to generation, actor scope, Card, filter, list snapshot and selected id", () => {
  const snapshot = history();
  const request = createCardTransactionDetailRefreshRequestIdentity(2, "scope-a", "card:one", "SETTLED", "tx:one", snapshot);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", snapshot, "tx:one", true), true);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 3, "scope-a", "card:one", "SETTLED", snapshot, "tx:one", true), false);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-b", "card:one", "SETTLED", snapshot, "tx:one", true), false);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-a", "card:two", "SETTLED", snapshot, "tx:one", true), false);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "REFUNDED", snapshot, "tx:one", true), false);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", {...snapshot}, "tx:one", true), false);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", snapshot, "tx:other", true), false);
  assert.equal(cardTransactionDetailRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", snapshot, "tx:one", false), false);
  assert.throws(() => createCardTransactionDetailRefreshRequestIdentity(2, "scope-a", "card:one", "SETTLED", "tx:other", snapshot), /list snapshot/);
});

test("performs at most one GET and checks the exact unexpired session before and after transport", async () => {
  let now = Date.parse("2026-08-01T02:00:00.000Z");
  const session = {actorId: "actor", tenantId: "tenant", customerId: "customer", environment: "TEST" as const, expiresAt: "2026-08-01T03:00:00.000Z"};
  const scope = walletTransferSessionScope(session, "TEST", now)!;
  let calls = 0;
  const controller = new AbortController();
  const detail = await readCardTransactionDetailRefresh(async request => {
    calls += 1;
    assert.deepEqual({path: request.path, method: request.method, signal: request.signal}, {path: "/v1/cards/card%3Aone/transactions/tx%3Aone", method: "GET", signal: controller.signal});
    return transaction({merchantName: "After"});
  }, session, "TEST", scope, "card:one", history().transactions[0], controller.signal, () => now);
  assert.equal(calls, 1);
  assert.equal(detail.merchantName, "After");

  calls = 0;
  await assert.rejects(readCardTransactionDetailRefresh(async () => {calls += 1; return transaction();}, session, "SANDBOX", scope, "card:one", history().transactions[0], controller.signal, () => now), /session/);
  assert.equal(calls, 0, "an invalid session must fail before transport");

  now = Date.parse("2026-08-01T02:59:59.000Z");
  await assert.rejects(readCardTransactionDetailRefresh(async () => {calls += 1; now += 2_000; return transaction();}, session, "TEST", scope, "card:one", history().transactions[0], controller.signal, () => now), /expired/);
  assert.equal(calls, 1);
});
