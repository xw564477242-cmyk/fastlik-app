import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TRANSACTION_FILTERS,
  CARD_TRANSACTION_PAGE_SIZE,
  CARD_TRANSACTION_PUBLIC_FIELDS,
  cardTransactionLifecycleType,
  cardTransactionPath,
  mergeCardTransactionPages,
  parseCardTransaction,
  parseCardTransactionFilter,
  parseCardTransactionPage,
} from "../src/cardTransactions.ts";

const rawTransaction = (id: string, status = "SETTLED"): Record<string, unknown> => ({
  id,
  status,
  amountMinor: "12345",
  authorizedAmountMinor: "12345",
  clearedAmountMinor: "12345",
  settledAmountMinor: "12345",
  reversedAmountMinor: "0",
  refundedAmountMinor: "0",
  currency: "USD",
  traceId: "trace:public-01",
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
  assert.deepEqual(CARD_TRANSACTION_FILTERS, ["ALL", "AUTHORIZED", "CLEARED", "SETTLED", "DECLINED", "REVERSED", "REFUNDED"]);
  assert.equal(cardTransactionPath("card:1", { filter: "ALL" }), "/v1/cards/card%3A1/transactions?limit=25");
  assert.equal(
    cardTransactionPath("card-1", { filter: "SETTLED", cursor: "opaque:cursor-01" }),
    "/v1/cards/card-1/transactions?limit=25&status=SETTLED&cursor=opaque%3Acursor-01",
  );
  assert.equal(parseCardTransactionFilter("REFUNDED"), "REFUNDED");
  assert.throws(() => parseCardTransactionFilter("PENDING"), /status filter/);
  assert.throws(() => cardTransactionPath("card/1", { filter: "ALL" }), /Card ID/);
  assert.throws(() => cardTransactionPath("card-1", { filter: "ALL", cursor: "opaque cursor/+" }), /cursor/);
});

test("reconstructs exactly the verified 13-field public DTO", () => {
  const transaction = parseCardTransaction(rawTransaction("transaction-1"));

  assert.deepEqual(Object.keys(transaction).sort(), [...CARD_TRANSACTION_PUBLIC_FIELDS].sort());
  for (const forbidden of [
    "providerPublicToken",
    "pan",
    "journalIds",
    "payload",
    "metadata",
  ]) assert.equal(forbidden in transaction, false);
  assert.equal(cardTransactionLifecycleType(transaction.status), "SETTLEMENT");
});

test("bounds every money, identity, merchant, currency and timestamp field", () => {
  for (const field of [
    "amountMinor",
    "authorizedAmountMinor",
    "clearedAmountMinor",
    "settledAmountMinor",
    "reversedAmountMinor",
    "refundedAmountMinor",
  ]) {
    assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), [field]: "01" }), new RegExp(field));
    assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), [field]: "9223372036854775808" }), new RegExp(field));
  }
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), id: "../private" }), /id/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), traceId: "x".repeat(129) }), /traceId/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), currency: "usd" }), /currency/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), merchantName: "x".repeat(201) }), /merchantName/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), merchantName: "Unsafe\nMerchant" }), /merchantName/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), merchantCategory: "12A4" }), /merchantCategory/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), occurredAt: "2026-07-31" }), /occurredAt/);
});

test("accepts empty pages and rejects malformed records or cursors", () => {
  assert.deepEqual(parseCardTransactionPage({ transactions: [], nextCursor: null }), {
    transactions: [],
    nextCursor: null,
  });
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), amountMinor: 123 }), /amountMinor/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), status: "RAW" }), /status/);
  assert.throws(
    () => parseCardTransactionPage({ transactions: [rawTransaction("transaction-1")], nextCursor: "" }),
    /cursor/,
  );
  assert.throws(
    () => parseCardTransactionPage({ transactions: [rawTransaction("transaction-1", "AUTHORIZED")], nextCursor: null }, "SETTLED"),
    /active status filter/,
  );
  assert.throws(
    () => parseCardTransactionPage({ transactions: [rawTransaction("transaction-1"), rawTransaction("transaction-1")], nextCursor: null }),
    /Duplicate/,
  );
});

test("never executes unexpected accessors while reconstructing public fields", () => {
  let getterExecutions = 0;
  const hostile = rawTransaction("transaction-1");
  Object.defineProperty(hostile, "providerPayload", {
    enumerable: true,
    get() { getterExecutions += 1; throw new Error("must not execute"); },
  });
  const parsed = parseCardTransaction(hostile);
  assert.equal(getterExecutions, 0);
  assert.equal("providerPayload" in parsed, false);

  const hostilePublicField = rawTransaction("transaction-2");
  Object.defineProperty(hostilePublicField, "merchantName", {
    enumerable: true,
    get() { getterExecutions += 1; throw new Error("must not execute"); },
  });
  assert.throws(() => parseCardTransaction(hostilePublicField), /merchantName/);
  assert.equal(getterExecutions, 0);
});

test("fails closed when Backend returns more than the requested 25 records", () => {
  const oversizedPage = {
    transactions: Array.from({ length: 26 }, (_, index) => rawTransaction(`transaction-${index}`)),
    nextCursor: "unexpected-cursor",
  };

  assert.throws(() => parseCardTransactionPage(oversizedPage), /exceeds the consumer limit/);
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
