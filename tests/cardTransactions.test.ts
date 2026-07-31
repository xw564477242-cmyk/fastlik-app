import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TRANSACTION_PAGE_SIZE,
  cardTransactionPath,
  mergeCardTransactionPages,
  parseCardTransaction,
  parseCardTransactionPage,
} from "../src/cardTransactions.ts";

const rawTransaction = (id: string): Record<string, unknown> => ({
  id,
  status: "SETTLED",
  amountMinor: "12345",
  authorizedAmountMinor: "12345",
  clearedAmountMinor: "12345",
  settledAmountMinor: "12345",
  reversedAmountMinor: "0",
  refundedAmountMinor: "0",
  currency: "USD",
  traceId: "trace-private-to-ui",
  merchantName: "Example Merchant",
  merchantCategory: "5411",
  occurredAt: "2026-07-31T01:02:03.000Z",
  providerPublicToken: "provider-secret",
  pan: "4111111111111111",
  journalIds: ["journal-1"],
  payload: { raw: true },
  metadata: { internal: true },
});

test("builds the bounded canonical card transaction request", () => {
  assert.equal(CARD_TRANSACTION_PAGE_SIZE, 25);
  assert.equal(cardTransactionPath("card/1"), "/v1/cards/card%2F1/transactions?limit=25");
  assert.equal(
    cardTransactionPath("card-1", "opaque cursor/+"),
    "/v1/cards/card-1/transactions?limit=25&cursor=opaque+cursor%2F%2B",
  );
});

test("reconstructs only the UI public-field allowlist", () => {
  const transaction = parseCardTransaction(rawTransaction("transaction-1"));

  assert.deepEqual(Object.keys(transaction).sort(), [
    "amountMinor",
    "currency",
    "id",
    "merchantCategory",
    "merchantName",
    "occurredAt",
    "status",
  ]);
  for (const forbidden of [
    "providerPublicToken",
    "pan",
    "journalIds",
    "payload",
    "metadata",
    "traceId",
    "authorizedAmountMinor",
  ])
    assert.equal(forbidden in transaction, false);
});

test("accepts empty pages and rejects malformed records or cursors", () => {
  assert.deepEqual(parseCardTransactionPage({ transactions: [], nextCursor: null }), {
    transactions: [],
    nextCursor: null,
  });
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), amountMinor: 123 }), /amount/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), status: "RAW" }), /status/);
  assert.throws(
    () => parseCardTransactionPage({ transactions: [rawTransaction("transaction-1")], nextCursor: "" }),
    /cursor/,
  );
});

test("appends transaction pages without duplicate ids", () => {
  const first = parseCardTransaction(rawTransaction("transaction-1"));
  const updated = parseCardTransaction({ ...rawTransaction("transaction-1"), status: "REFUNDED" });
  const second = parseCardTransaction(rawTransaction("transaction-2"));

  assert.deepEqual(
    mergeCardTransactionPages([first], [updated, second]).map((item) => [item.id, item.status]),
    [
      ["transaction-1", "REFUNDED"],
      ["transaction-2", "SETTLED"],
    ],
  );
});
