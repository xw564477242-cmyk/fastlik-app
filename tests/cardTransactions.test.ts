import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TRANSACTION_PAGE_SIZE,
  acceptCardTransactionPage,
  captureCardTransactionCardVersion,
  cardTransactionCursorHistoryVersion,
  cardTransactionPath,
  cardTransactionReadAllowed,
  cardTransactionRequestIsCurrent,
  parseCardTransaction,
  parseCardTransactionPage,
} from "../src/cardTransactions.ts";
import type { CardRecord } from "../src/cardList.ts";

const rawTransaction = (
  id: string,
  occurredAt = "2026-07-31T01:02:03.000Z",
): Record<string, unknown> => ({
  id,
  status: "SETTLED",
  amountMinor: "12345",
  authorizedAmountMinor: "12345",
  clearedAmountMinor: "12345",
  settledAmountMinor: "12345",
  reversedAmountMinor: "0",
  refundedAmountMinor: "0",
  currency: "USD",
  traceId: "trace-public",
  merchantName: "Example Merchant",
  merchantCategory: "5411",
  occurredAt,
});

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card-1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Travel",
  availableBalanceMinor: "1000",
  createdAt: "2026-07-30T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

test("builds only the bounded canonical Card transaction request without parsing its opaque cursor", () => {
  assert.equal(CARD_TRANSACTION_PAGE_SIZE, 25);
  assert.equal(cardTransactionPath("card/1"), "/v1/cards/card%2F1/transactions?limit=25");
  assert.equal(
    cardTransactionPath("card-1", "opaque cursor/+"),
    "/v1/cards/card-1/transactions?limit=25&cursor=opaque+cursor%2F%2B",
  );
  assert.throws(() => cardTransactionPath("card-1", "\u0000provider"), /cursor/);
});

test("reconstructs only the finite Wallet transaction allowlist", () => {
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
    "traceId",
    "authorizedAmountMinor",
    "clearedAmountMinor",
    "settledAmountMinor",
    "reversedAmountMinor",
    "refundedAmountMinor",
  ]) assert.equal(forbidden in transaction, false);
});

test("rejects unknown, inherited, accessor and Proxy transaction payloads without getter execution", () => {
  assert.throws(
    () => parseCardTransaction({ ...rawTransaction("transaction-1"), providerPublicToken: "provider-secret" }),
    /fields/,
  );

  const inherited = Object.create({ provider: "inherited" });
  Object.assign(inherited, rawTransaction("transaction-1"));
  assert.throws(() => parseCardTransaction(inherited), /record/);

  let getterCalls = 0;
  const accessor = rawTransaction("transaction-1");
  Object.defineProperty(accessor, "provider", {
    enumerable: true,
    get() { getterCalls += 1; return "must-not-read"; },
  });
  assert.throws(() => parseCardTransaction(accessor), /record/);
  assert.equal(getterCalls, 0);

  let proxyGets = 0;
  const proxy = new Proxy(rawTransaction("transaction-1"), {
    get(target, property, receiver) {
      proxyGets += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(() => parseCardTransaction(proxy), /record/);
  assert.equal(proxyGets, 0);
});

test("accepts only canonical signed 64-bit minor strings for every amount", () => {
  for (const amountMinor of ["-9223372036854775808", "-1", "0", "9223372036854775807"]) {
    const raw = rawTransaction("transaction-1");
    for (const field of [
      "amountMinor",
      "authorizedAmountMinor",
      "clearedAmountMinor",
      "settledAmountMinor",
      "reversedAmountMinor",
      "refundedAmountMinor",
    ]) raw[field] = amountMinor;
    assert.equal(parseCardTransaction(raw).amountMinor, amountMinor);
  }
  for (const amountMinor of ["-9223372036854775809", "9223372036854775808", "00", "-0", "+1", "1.0"]) {
    assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), amountMinor }), /amountMinor/);
  }
  assert.throws(
    () => parseCardTransaction({ ...rawTransaction("transaction-1"), refundedAmountMinor: "9223372036854775808" }),
    /refundedAmountMinor/,
  );
});

test("enforces canonical status, currency, UTC millisecond time and MCC", () => {
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), status: "RAW" }), /status/);
  assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), currency: "usd" }), /currency/);
  for (const occurredAt of [
    "0",
    "2026-02-30T00:00:00.000Z",
    "2026-01-01T00:00:00Z",
    "2026-01-01T00:00:00.000+00:00",
    "2026-01-01 00:00:00.000Z",
  ]) assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), occurredAt }), /occurredAt/);
  for (const merchantCategory of ["541", "54110", "ABCD", 5411]) {
    assert.throws(() => parseCardTransaction({ ...rawTransaction("transaction-1"), merchantCategory }), /merchantCategory/);
  }
});

test("requires exact page shape, bounded size, unique ids and strict descending order", () => {
  assert.deepEqual(parseCardTransactionPage({ transactions: [], nextCursor: null }), {
    transactions: [], nextCursor: null,
  });
  assert.throws(() => parseCardTransactionPage({ transactions: [], nextCursor: null, raw: true }), /fields/);
  assert.throws(
    () => parseCardTransactionPage({
      transactions: Array.from({ length: 26 }, (_, index) => rawTransaction(`transaction-${index}`)),
      nextCursor: "next",
    }),
    /consumer limit/,
  );
  assert.throws(
    () => parseCardTransactionPage({
      transactions: [rawTransaction("transaction-1"), rawTransaction("transaction-1")],
      nextCursor: null,
    }),
    /order/,
  );
  assert.throws(
    () => parseCardTransactionPage({
      transactions: [
        rawTransaction("transaction-older", "2026-07-30T00:00:00.000Z"),
        rawTransaction("transaction-newer", "2026-07-31T00:00:00.000Z"),
      ],
      nextCursor: null,
    }),
    /order/,
  );
});

test("rejects cross-page duplicate, non-monotonic and looping cursors", () => {
  const firstPage = parseCardTransactionPage({
    transactions: [rawTransaction("transaction-3", "2026-07-31T03:00:00.000Z")],
    nextCursor: "cursor-1",
  });
  const first = acceptCardTransactionPage([], firstPage, null, new Set());
  assert.deepEqual([...first.cursorHistory], ["cursor-1"]);

  const secondPage = parseCardTransactionPage({
    transactions: [rawTransaction("transaction-2", "2026-07-31T02:00:00.000Z")],
    nextCursor: "cursor-2",
  });
  const second = acceptCardTransactionPage(first.transactions, secondPage, "cursor-1", first.cursorHistory);
  assert.deepEqual(second.transactions.map((item) => item.id), ["transaction-3", "transaction-2"]);

  assert.throws(
    () => acceptCardTransactionPage(first.transactions, {
      transactions: [first.transactions[0]], nextCursor: "cursor-2",
    }, "cursor-1", first.cursorHistory),
    /duplicate/,
  );
  assert.throws(
    () => acceptCardTransactionPage(first.transactions, {
      transactions: [parseCardTransaction(rawTransaction("transaction-4", "2026-08-01T00:00:00.000Z"))],
      nextCursor: "cursor-2",
    }, "cursor-1", first.cursorHistory),
    /order/,
  );
  assert.throws(
    () => acceptCardTransactionPage(first.transactions, { transactions: [], nextCursor: "cursor-1" }, "cursor-1", first.cursorHistory),
    /cursor loop/,
  );
  assert.throws(
    () => acceptCardTransactionPage(first.transactions, secondPage, "unknown-cursor", first.cursorHistory),
    /cursor history/,
  );
});

test("binds completion to session scope, full visible Card version, cursor history and generation", () => {
  const selected = card();
  const history = new Set(["cursor-1"]);
  const request = {
    requestId: 7,
    scopeKey: "actor|session|tenant|customer|TEST",
    cardId: selected.id,
    cardVersion: captureCardTransactionCardVersion(selected),
    cursor: "cursor-1",
    cursorHistoryVersion: cardTransactionCursorHistoryVersion(history),
  };
  assert.equal(cardTransactionRequestIsCurrent(request, 7, request.scopeKey, selected, "cursor-1", history), true);
  assert.equal(cardTransactionRequestIsCurrent(request, 8, request.scopeKey, selected, "cursor-1", history), false);
  for (const scopeKey of [
    "other-actor|session|tenant|customer|TEST",
    "actor|other-session|tenant|customer|TEST",
    "actor|session|other-tenant|customer|TEST",
    "actor|session|tenant|other-customer|TEST",
    "actor|session|tenant|customer|SANDBOX",
  ]) assert.equal(cardTransactionRequestIsCurrent(request, 7, scopeKey, selected, "cursor-1", history), false);
  assert.equal(cardTransactionRequestIsCurrent(request, 7, request.scopeKey, card({ status: "FROZEN" }), "cursor-1", history), false);
  assert.equal(cardTransactionRequestIsCurrent(request, 7, request.scopeKey, selected, "cursor-2", history), false);
  assert.equal(cardTransactionRequestIsCurrent(request, 7, request.scopeKey, selected, "cursor-1", new Set(["cursor-1", "cursor-2"])), false);
});

test("stale success, error and finally branches perform zero writes", () => {
  const selected = card();
  const history = new Set<string>();
  const request = {
    requestId: 1,
    scopeKey: "scope-a",
    cardId: selected.id,
    cardVersion: captureCardTransactionCardVersion(selected),
    cursor: null,
    cursorHistoryVersion: cardTransactionCursorHistoryVersion(history),
  };
  const writes = { success: 0, error: 0, finally: 0 };
  const current = () => cardTransactionRequestIsCurrent(request, 2, "scope-b", selected, null, history);
  if (current()) writes.success += 1;
  if (current()) writes.error += 1;
  if (current()) writes.finally += 1;
  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
});

test("Card transactions are restricted to matching SANDBOX and TEST sessions", () => {
  assert.equal(cardTransactionReadAllowed("SANDBOX", "SANDBOX"), true);
  assert.equal(cardTransactionReadAllowed("TEST", "TEST"), true);
  assert.equal(cardTransactionReadAllowed("TEST", "SANDBOX"), false);
  assert.equal(cardTransactionReadAllowed("PRODUCTION", "PRODUCTION"), false);
  assert.equal(cardTransactionReadAllowed("UAT", "UAT"), false);
});
