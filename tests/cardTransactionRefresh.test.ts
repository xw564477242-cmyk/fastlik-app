import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS,
  cardTransactionRefreshAllowed,
  cardTransactionRefreshRequestIsCurrent,
  commitCardTransactionRefreshPage,
  createCardTransactionRefreshRequestIdentity,
} from "../src/cardTransactionRefresh.ts";
import {
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
} from "../src/cardTransactionHistory.ts";

const transaction = (id: string, status = "SETTLED") => ({
  id,
  status,
  amountMinor: "100",
  authorizedAmountMinor: "100",
  clearedAmountMinor: "100",
  settledAmountMinor: status === "SETTLED" ? "100" : "0",
  reversedAmountMinor: status === "REVERSED" ? "100" : "0",
  refundedAmountMinor: status === "REFUNDED" ? "100" : "0",
  currency: "USD",
  traceId: `trace:${id}`,
  merchantName: "Refresh Merchant",
  merchantCategory: "5411",
  occurredAt: "2026-08-01T02:00:00.000Z",
});

const history = () => commitCardTransactionHistoryPage(
  null,
  createCardTransactionHistoryRequestIdentity(1, "scope-a", "card:one", "SETTLED", null),
  { transactions: [transaction("tx-prior")], nextCursor: "cursor-prior" },
);

test("allows a manual refresh only for the exact current SANDBOX/TEST scope, Card and filter", () => {
  const prior = history();
  for (const environment of ["SANDBOX", "TEST"]) {
    assert.equal(cardTransactionRefreshAllowed(environment, environment, "scope-a", "scope-a", "card:one", "card:one", "SETTLED", "SETTLED", prior), true);
  }
  assert.equal(cardTransactionRefreshAllowed("PRODUCTION", "PRODUCTION", "scope-a", "scope-a", "card:one", "card:one", "SETTLED", "SETTLED", prior), false);
  assert.equal(cardTransactionRefreshAllowed("TEST", "SANDBOX", "scope-a", "scope-a", "card:one", "card:one", "SETTLED", "SETTLED", prior), false);
  assert.equal(cardTransactionRefreshAllowed("TEST", "TEST", "scope-b", "scope-a", "card:one", "card:one", "SETTLED", "SETTLED", prior), false);
  assert.equal(cardTransactionRefreshAllowed("TEST", "TEST", "scope-a", "scope-a", "card:two", "card:one", "SETTLED", "SETTLED", prior), false);
  assert.equal(cardTransactionRefreshAllowed("TEST", "TEST", "scope-a", "scope-a", "card:one", "card:one", "REFUNDED", "SETTLED", prior), false);
});

test("binds refresh completion to generation, scope, Card, filter, attempt, snapshot and mount", () => {
  const prior = history();
  const request = createCardTransactionRefreshRequestIdentity(2, "scope-a", "card:one", "SETTLED", 1, prior);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", 1, prior, true), true);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 3, "scope-a", "card:one", "SETTLED", 1, prior, true), false);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-b", "card:one", "SETTLED", 1, prior, true), false);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-a", "card:two", "SETTLED", 1, prior, true), false);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "REFUNDED", 1, prior, true), false);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", 2, prior, true), false);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", 1, { ...prior }, true), false);
  assert.equal(cardTransactionRefreshRequestIsCurrent(request, 2, "scope-a", "card:one", "SETTLED", 1, prior, false), false);
});

test("atomically replaces the first page and cursor while retaining the exact 13-field parser", () => {
  const prior = history();
  const request = createCardTransactionRefreshRequestIdentity(2, "scope-a", "card:one", "SETTLED", 1, prior);
  const refreshed = commitCardTransactionRefreshPage(request, {
    transactions: [transaction("tx-new")],
    nextCursor: "cursor-new",
  });
  assert.deepEqual(refreshed.transactions.map(row => row.id), ["tx-new"]);
  assert.equal(refreshed.nextCursor, "cursor-new");
  assert.deepEqual(prior.transactions.map(row => row.id), ["tx-prior"], "the retained snapshot must remain immutable");
  assert.throws(() => commitCardTransactionRefreshPage(request, {
    transactions: [transaction("tx-wrong", "REFUNDED")],
    nextCursor: null,
  }), /active status filter/);
});

test("permits only the initial attempt plus two explicit retries", () => {
  assert.equal(CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS, 3);
  const prior = history();
  for (let attempt = 1; attempt <= CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    assert.equal(createCardTransactionRefreshRequestIdentity(attempt + 1, "scope-a", "card:one", "SETTLED", attempt, prior).attempt, attempt);
  }
  assert.throws(() => createCardTransactionRefreshRequestIdentity(5, "scope-a", "card:one", "SETTLED", 4, prior), /attempt/);
  assert.throws(() => createCardTransactionRefreshRequestIdentity(2, "scope-a", "card:one", "REFUNDED", 1, prior), /snapshot/);
});
