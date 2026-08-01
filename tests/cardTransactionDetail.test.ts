import assert from "node:assert/strict";
import test from "node:test";
import {
  createCardTransactionDetailSelection,
  reconcileCardTransactionDetailSelection,
} from "../src/cardTransactionDetail.ts";
import { parseCardTransaction } from "../src/cardTransactions.ts";

const rawTransaction = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  status: "SETTLED",
  amountMinor: "1250",
  authorizedAmountMinor: "1250",
  clearedAmountMinor: "1250",
  settledAmountMinor: "1250",
  reversedAmountMinor: "0",
  refundedAmountMinor: "0",
  currency: "USD",
  traceId: "trace:public-01",
  merchantName: "Public Merchant",
  merchantCategory: "5411",
  occurredAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const transaction = (id: string, overrides: Record<string, unknown> = {}) =>
  parseCardTransaction(rawTransaction(id, overrides));

test("selects only a transaction present in the current scoped Card list", () => {
  const rows = [transaction("transaction-1"), transaction("transaction-2")];
  const selected = createCardTransactionDetailSelection("session-a", "card:one", rows[1], rows);
  assert.equal(selected.scopeKey, "session-a");
  assert.equal(selected.cardId, "card:one");
  assert.equal(selected.transaction.id, "transaction-2");
  assert.throws(
    () => createCardTransactionDetailSelection("session-a", "card:one", transaction("missing"), rows),
    /no longer/,
  );
});

test("session, Card, logout and unmount boundaries clear the selection", () => {
  const rows = [transaction("transaction-1")];
  const selected = createCardTransactionDetailSelection("session-a", "card:one", rows[0], rows);
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:one", rows, true)?.transaction.id, "transaction-1");
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-b", "card:one", rows, true), null);
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:two", rows, true), null);
  assert.equal(reconcileCardTransactionDetailSelection(selected, null, null, [], true), null);
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:one", rows, false), null);
});

test("refresh retains the current transaction, replaces its public snapshot, and clears it when absent", () => {
  const before = [transaction("transaction-1")];
  const selected = createCardTransactionDetailSelection("session-a", "card:one", before[0], before);
  const refreshed = [transaction("transaction-1", { status: "REFUNDED", refundedAmountMinor: "1250" })];
  const retained = reconcileCardTransactionDetailSelection(selected, "session-a", "card:one", refreshed, true);
  assert.equal(retained?.transaction.status, "REFUNDED");
  assert.equal(retained?.transaction.refundedAmountMinor, "1250");
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:one", [], true), null);
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:one", [transaction("transaction-1", { currency: "EUR" })], true), null);
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:one", [transaction("transaction-1", { occurredAt: "2026-08-01T00:00:01.000Z" })], true), null);
});

test("an old response cannot move a selection across session or Card scope", () => {
  const priorRows = [transaction("transaction-shared", { merchantName: "Prior" })];
  const selected = createCardTransactionDetailSelection("session-a", "card:one", priorRows[0], priorRows);
  const hostileOldRows = [transaction("transaction-shared", { merchantName: "Old response" })];
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-b", "card:one", hostileOldRows, true), null);
  assert.equal(reconcileCardTransactionDetailSelection(selected, "session-a", "card:two", hostileOldRows, true), null);
});

test("malformed, forged and malicious selections fail closed", () => {
  const rows = [transaction("transaction-1")];
  assert.throws(() => createCardTransactionDetailSelection("", "card:one", rows[0], rows), /scope/);
  assert.throws(() => createCardTransactionDetailSelection("session-a", "../private", rows[0], rows), /Card ID/);
  assert.throws(() => createCardTransactionDetailSelection(
    "session-a",
    "card:one",
    { ...rawTransaction("transaction-1"), merchantName: "x".repeat(201) },
    rows,
  ), /merchantName/);
  const forged = transaction("transaction-1", { merchantName: "Forged but valid" });
  const selected = createCardTransactionDetailSelection("session-a", "card:one", forged, rows);
  assert.equal(selected.transaction.merchantName, "Public Merchant");
});
