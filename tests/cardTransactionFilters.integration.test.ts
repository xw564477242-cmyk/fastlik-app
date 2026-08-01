import assert from "node:assert/strict";
import test from "node:test";
import {
  cardTransactionHistoryRequestIsCurrent,
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
  type CardTransactionHistoryState,
} from "../src/cardTransactionHistory.ts";
import type { CardTransactionFilter } from "../src/cardTransactions.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;

const transaction = (id: string, status: Exclude<CardTransactionFilter, "ALL">) => ({
  id,
  status,
  amountMinor: "100",
  authorizedAmountMinor: "100",
  clearedAmountMinor: status === "AUTHORIZED" ? "0" : "100",
  settledAmountMinor: status === "SETTLED" ? "100" : "0",
  reversedAmountMinor: status === "REVERSED" ? "100" : "0",
  refundedAmountMinor: status === "REFUNDED" ? "100" : "0",
  currency: "USD",
  traceId: `trace:${id}`,
  merchantName: "Mounted Merchant",
  merchantCategory: "5411",
  occurredAt: "2026-08-01T01:00:00.000Z",
});

type Context = {
  mounted: boolean;
  requestId: number;
  scope: string | null;
  cardId: string | null;
  filter: CardTransactionFilter;
  cursor: string | null;
  controller: AbortController | null;
  history: CardTransactionHistoryState | null;
  selectedTransactionId: string | null;
};

const context = (): Context => ({
  mounted: true,
  requestId: 0,
  scope: "scope-a",
  cardId: "card:mounted-1",
  filter: "ALL",
  cursor: null,
  controller: null,
  history: null,
  selectedTransactionId: null,
});

const invalidate = (state: Context, filter: CardTransactionFilter) => {
  state.controller?.abort();
  state.controller = null;
  state.requestId += 1;
  state.filter = filter;
  state.cursor = null;
  state.history = null;
  state.selectedTransactionId = null;
};

mounted(`switching status aborts and clears the old filter before the new first page commits (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = context();
  const oldController = new AbortController();
  state.controller = oldController;
  const oldRequest = createCardTransactionHistoryRequestIdentity(++state.requestId, "scope-a", "card:mounted-1", "ALL", null);
  let resolveOld!: (value: unknown) => void;
  const oldPage = new Promise(resolve => { resolveOld = resolve; });
  const oldOperation = oldPage.then(page => {
    if (cardTransactionHistoryRequestIsCurrent(oldRequest, state.requestId, state.scope, state.cardId, state.filter, state.cursor, state.mounted)) {
      state.history = commitCardTransactionHistoryPage(null, oldRequest, page);
    }
  });

  invalidate(state, "SETTLED");
  assert.equal(oldController.signal.aborted, true);
  assert.equal(state.history, null);
  assert.equal(state.selectedTransactionId, null);
  assert.equal(state.cursor, null);
  resolveOld({ transactions: [transaction("tx-old", "AUTHORIZED")], nextCursor: null });
  await oldOperation;
  assert.equal(state.history, null, "an old-filter response must perform zero writes");

  const newController = new AbortController();
  state.controller = newController;
  const request = createCardTransactionHistoryRequestIdentity(++state.requestId, "scope-a", "card:mounted-1", "SETTLED", null);
  assert.equal(cardTransactionHistoryRequestIsCurrent(request, state.requestId, state.scope, state.cardId, state.filter, state.cursor, state.mounted), true);
  state.history = commitCardTransactionHistoryPage(null, request, {
    transactions: [transaction("tx-settled", "SETTLED")],
    nextCursor: "cursor-2",
  });
  assert.deepEqual(state.history.transactions.map(row => [row.id, row.status]), [["tx-settled", "SETTLED"]]);
});

mounted(`pagination keeps the selected status and rejects cross-filter or malformed pages (${environment ?? "ENVIRONMENT_REQUIRED"})`, () => {
  const state = context();
  state.filter = "REFUNDED";
  const first = createCardTransactionHistoryRequestIdentity(++state.requestId, "scope-a", "card:mounted-1", state.filter, null);
  state.history = commitCardTransactionHistoryPage(null, first, {
    transactions: [transaction("tx-1", "REFUNDED")],
    nextCursor: "cursor-2",
  });
  state.cursor = state.history.nextCursor;
  const page = createCardTransactionHistoryRequestIdentity(++state.requestId, "scope-a", "card:mounted-1", state.filter, state.cursor);
  const prior = state.history;
  assert.throws(() => commitCardTransactionHistoryPage(prior, page, {
    transactions: [transaction("tx-wrong", "SETTLED")],
    nextCursor: null,
  }), /active status filter/);
  assert.equal(state.history, prior);
  state.history = commitCardTransactionHistoryPage(prior, page, {
    transactions: [transaction("tx-2", "REFUNDED")],
    nextCursor: null,
  });
  assert.deepEqual(state.history.transactions.map(row => row.id), ["tx-1", "tx-2"]);
});

mounted(`Card switch, session change, logout and unmount invalidate the request with zero writes (${environment ?? "ENVIRONMENT_REQUIRED"})`, () => {
  const invalidations: Array<(state: Context) => void> = [
    state => { state.cardId = "card:mounted-2"; },
    state => { state.scope = "scope-b"; },
    state => { state.scope = null; state.cardId = null; },
    state => { state.mounted = false; },
  ];
  for (const mutate of invalidations) {
    const state = context();
    const request = createCardTransactionHistoryRequestIdentity(++state.requestId, "scope-a", "card:mounted-1", "ALL", null);
    mutate(state);
    assert.equal(cardTransactionHistoryRequestIsCurrent(request, state.requestId, state.scope, state.cardId, state.filter, state.cursor, state.mounted), false);
    assert.equal(state.history, null);
  }
});
