import assert from "node:assert/strict";
import test from "node:test";
import {
  cardTransactionHistoryRequestIsCurrent,
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
} from "../src/cardTransactionHistory.ts";

const transaction = (id: string, status = "SETTLED") => ({
  id,
  status,
  amountMinor: "1250",
  authorizedAmountMinor: "1250",
  clearedAmountMinor: "1250",
  settledAmountMinor: status === "SETTLED" ? "1250" : "0",
  reversedAmountMinor: status === "REVERSED" ? "1250" : "0",
  refundedAmountMinor: status === "REFUNDED" ? "1250" : "0",
  currency: "USD",
  traceId: `trace:${id}`,
  merchantName: "Bounded Merchant",
  merchantCategory: "5411",
  occurredAt: "2026-08-01T00:00:00.000Z",
});

test("binds a history request to generation, scope, Card, filter, cursor and mount", () => {
  const request = createCardTransactionHistoryRequestIdentity(7, "scope-a", "card:1", "SETTLED", "cursor-1");
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 7, "scope-a", "card:1", "SETTLED", "cursor-1", true), true);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 8, "scope-a", "card:1", "SETTLED", "cursor-1", true), false);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 7, "scope-b", "card:1", "SETTLED", "cursor-1", true), false);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 7, "scope-a", "card:2", "SETTLED", "cursor-1", true), false);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 7, "scope-a", "card:1", "REFUNDED", "cursor-1", true), false);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 7, "scope-a", "card:1", "SETTLED", "cursor-2", true), false);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, 7, "scope-a", "card:1", "SETTLED", "cursor-1", false), false);
});

test("commits a first page and paginates only the same scope, Card and filter", () => {
  const firstRequest = createCardTransactionHistoryRequestIdentity(1, "scope-a", "card:1", "SETTLED", null);
  const first = commitCardTransactionHistoryPage(null, firstRequest, {
    transactions: [transaction("tx-1")],
    nextCursor: "cursor-2",
  });
  assert.deepEqual(first.transactions.map(row => row.id), ["tx-1"]);
  assert.deepEqual(first.seenCursors, ["cursor-2"]);

  const secondRequest = createCardTransactionHistoryRequestIdentity(2, "scope-a", "card:1", "SETTLED", "cursor-2");
  const second = commitCardTransactionHistoryPage(first, secondRequest, {
    transactions: [transaction("tx-2")],
    nextCursor: "cursor-3",
  });
  assert.deepEqual(second.transactions.map(row => row.id), ["tx-1", "tx-2"]);
  assert.equal(second.filter, "SETTLED");
  assert.equal(second.nextCursor, "cursor-3");
});

test("rejects cross-filter rows, stale pagination, duplicate rows and cursor loops atomically", () => {
  const firstRequest = createCardTransactionHistoryRequestIdentity(1, "scope-a", "card:1", "SETTLED", null);
  const first = commitCardTransactionHistoryPage(null, firstRequest, {
    transactions: [transaction("tx-1")],
    nextCursor: "cursor-2",
  });
  const snapshot = JSON.stringify(first);

  assert.throws(() => commitCardTransactionHistoryPage(null, firstRequest, {
    transactions: [transaction("tx-refund", "REFUNDED")],
    nextCursor: null,
  }), /active status filter/);
  assert.throws(() => commitCardTransactionHistoryPage(first, createCardTransactionHistoryRequestIdentity(2, "scope-a", "card:1", "SETTLED", "wrong-cursor"), {
    transactions: [transaction("tx-2")],
    nextCursor: null,
  }), /Stale/);
  assert.throws(() => commitCardTransactionHistoryPage(first, createCardTransactionHistoryRequestIdentity(2, "scope-a", "card:1", "SETTLED", "cursor-2"), {
    transactions: [transaction("tx-1")],
    nextCursor: null,
  }), /Duplicate/);
  assert.throws(() => commitCardTransactionHistoryPage(first, createCardTransactionHistoryRequestIdentity(2, "scope-a", "card:1", "SETTLED", "cursor-2"), {
    transactions: [transaction("tx-2")],
    nextCursor: "cursor-2",
  }), /Repeated/);
  assert.equal(JSON.stringify(first), snapshot, "a rejected page must not mutate visible state");
});
