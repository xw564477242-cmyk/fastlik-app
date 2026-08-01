import assert from "node:assert/strict";
import test from "node:test";
import {
  CardDetailRefreshError,
  cardDetailRefreshCanRetainSnapshot,
  cardDetailRefreshRequestIsCurrent,
  cardDetailRefreshRequestWasAborted,
  createCardDetailRefreshRequestIdentity,
  readCardDetailRefresh,
} from "../src/cardDetailRefresh.ts";

const selectedCardId = "card:detail.1";

const rawCard = (overrides: Record<string, unknown> = {}) => ({
  id: selectedCardId,
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Primary",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerCardId: "private-provider-card",
  ...overrides,
});

const rawBalance = (overrides: Record<string, unknown> = {}) => ({
  cardId: selectedCardId,
  currency: "USD",
  availableBalanceMinor: "2500",
  currentBalanceMinor: "3000",
  pendingAmountMinor: "500",
  updatedAt: "2026-08-01T00:00:00Z",
  ledgerAccountId: "private-ledger-account",
  ...overrides,
});

const rawLimits = (overrides: Record<string, unknown> = {}) => ({
  cardId: selectedCardId,
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-08-01T00:00:00Z",
  providerPayload: "private-provider-payload",
  ...overrides,
});

const rawTransactions = (overrides: Record<string, unknown> = {}) => ({
  transactions: [{
    id: "card-transaction-01",
    status: "SETTLED",
    amountMinor: "1250",
    authorizedAmountMinor: "1250",
    clearedAmountMinor: "1250",
    settledAmountMinor: "1250",
    reversedAmountMinor: "0",
    refundedAmountMinor: "0",
    currency: "USD",
    traceId: "trace:public-01",
    merchantName: "Coffee",
    merchantCategory: "5812",
    occurredAt: "2026-08-01T00:00:00.000Z",
    authorizationCode: "private-authorization",
  }],
  nextCursor: "next-page",
  internalQuery: "private-query",
  ...overrides,
});

const readers = (overrides: Partial<{
  card: () => Promise<unknown>;
  balance: () => Promise<unknown>;
  limits: () => Promise<unknown>;
  transactions: () => Promise<unknown>;
}> = {}) => ({
  card: async () => rawCard(),
  balance: async () => rawBalance(),
  limits: async () => rawLimits(),
  transactions: async () => rawTransactions(),
  ...overrides,
});

test("builds one exact allowlisted Card screen snapshot after all four reads", async () => {
  const calls: string[] = [];
  const snapshot = await readCardDetailRefresh({
    card: async id => { calls.push(`card:${id}`); return rawCard(); },
    balance: async id => { calls.push(`balance:${id}`); return rawBalance(); },
    limits: async id => { calls.push(`limits:${id}`); return rawLimits(); },
    transactions: async id => { calls.push(`transactions:${id}`); return rawTransactions(); },
  }, selectedCardId);

  assert.deepEqual(calls.sort(), [
    `balance:${selectedCardId}`,
    `card:${selectedCardId}`,
    `limits:${selectedCardId}`,
    `transactions:${selectedCardId}`,
  ]);
  assert.deepEqual(Object.keys(snapshot.card).sort(), [
    "alias", "availableBalanceMinor", "capabilities", "createdAt", "currency", "expiryMonth",
    "expiryYear", "id", "last4", "status", "type",
  ]);
  assert.deepEqual(Object.keys(snapshot.balance).sort(), [
    "availableBalanceMinor", "cardId", "currency", "currentBalanceMinor", "pendingAmountMinor", "updatedAt",
  ]);
  assert.deepEqual(Object.keys(snapshot.limits).sort(), [
    "cardId", "dailyAtmMinor", "dailySpendMinor", "monthlySpendMinor", "singleTransactionMinor", "updatedAt",
  ]);
  assert.deepEqual(Object.keys(snapshot.transactions).sort(), ["nextCursor", "transactions"]);
  assert.equal("authorizationCode" in snapshot.transactions.transactions[0], false);
});

test("passes one shared cancellation signal to all four Card detail reads", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const recordSignal = (signal: AbortSignal | undefined) => {
    assert.ok(signal);
    signals.push(signal);
  };

  await readCardDetailRefresh({
    card: async (_id, signal) => { recordSignal(signal); return rawCard(); },
    balance: async (_id, signal) => { recordSignal(signal); return rawBalance(); },
    limits: async (_id, signal) => { recordSignal(signal); return rawLimits(); },
    transactions: async (_id, signal) => { recordSignal(signal); return rawTransactions(); },
  }, selectedCardId, controller.signal);

  assert.equal(signals.length, 4);
  assert.ok(signals.every(signal => signal === controller.signal));
});

test("rejects without parsing when the shared Card detail request is aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;

  await assert.rejects(() => readCardDetailRefresh({
    card: async () => { calls += 1; return rawCard(); },
    balance: async () => { calls += 1; return rawBalance(); },
    limits: async () => { calls += 1; return rawLimits(); },
    transactions: async () => { calls += 1; return rawTransactions(); },
  }, selectedCardId, controller.signal), cardDetailRefreshRequestWasAborted);

  assert.equal(calls, 0);
});

test("fails the whole refresh when any component rejects or crosses the selected Card", async () => {
  await assert.rejects(() => readCardDetailRefresh(readers({
    limits: async () => { throw new Error("private provider failure"); },
  }), selectedCardId), (value: unknown) => value instanceof CardDetailRefreshError && value.resource === "limits");
  await assert.rejects(() => readCardDetailRefresh(readers({
    card: async () => rawCard({ id: "card:detail.2" }),
  }), selectedCardId), /selected Card/);
  await assert.rejects(() => readCardDetailRefresh(readers({
    balance: async () => rawBalance({ currency: "EUR" }),
  }), selectedCardId), /currencies/);
});

test("never reads additional internal response properties", async () => {
  let getterExecutions = 0;
  const hostileCard = rawCard();
  Object.defineProperty(hostileCard, "providerPayload", {
    enumerable: true,
    get() { getterExecutions += 1; throw new Error("must never execute"); },
  });
  const snapshot = await readCardDetailRefresh(readers({ card: async () => hostileCard }), selectedCardId);
  assert.equal(getterExecutions, 0);
  assert.equal("providerPayload" in snapshot.card, false);
});

test("request identity rejects stale generation, scope, Card and unmounted work", () => {
  const request = createCardDetailRefreshRequestIdentity(7, "scope-a", selectedCardId);
  assert.equal(cardDetailRefreshRequestIsCurrent(request, 7, "scope-a", selectedCardId, true), true);
  assert.equal(cardDetailRefreshRequestIsCurrent(request, 8, "scope-a", selectedCardId, true), false);
  assert.equal(cardDetailRefreshRequestIsCurrent(request, 7, "scope-b", selectedCardId, true), false);
  assert.equal(cardDetailRefreshRequestIsCurrent(request, 7, "scope-a", "card:detail.2", true), false);
  assert.equal(cardDetailRefreshRequestIsCurrent(request, 7, "scope-a", selectedCardId, false), false);
  assert.throws(() => createCardDetailRefreshRequestIdentity(0, "scope-a", selectedCardId));
  assert.throws(() => createCardDetailRefreshRequestIdentity(1, "", selectedCardId));
  assert.throws(() => createCardDetailRefreshRequestIdentity(1, "scope-a", "../private"));
});

test("retains only a complete snapshot owned by the same selected Card", () => {
  assert.equal(cardDetailRefreshCanRetainSnapshot(selectedCardId, selectedCardId), true);
  assert.equal(cardDetailRefreshCanRetainSnapshot(null, selectedCardId), false);
  assert.equal(cardDetailRefreshCanRetainSnapshot("card:detail.2", selectedCardId), false);
});
