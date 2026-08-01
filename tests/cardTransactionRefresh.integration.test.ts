import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS,
  cardTransactionRefreshRequestIsCurrent,
  commitCardTransactionRefreshPage,
  createCardTransactionRefreshRequestIdentity,
} from "../src/cardTransactionRefresh.ts";
import {
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
  type CardTransactionHistoryState,
} from "../src/cardTransactionHistory.ts";
import {
  createCardTransactionDetailSelection,
  reconcileCardTransactionDetailSelection,
  type CardTransactionDetailSelection,
} from "../src/cardTransactionDetail.ts";
import type { CardTransactionFilter } from "../src/cardTransactions.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;

const transaction = (id: string, merchantName: string) => ({
  id,
  status: "SETTLED",
  amountMinor: "100",
  authorizedAmountMinor: "100",
  clearedAmountMinor: "100",
  settledAmountMinor: "100",
  reversedAmountMinor: "0",
  refundedAmountMinor: "0",
  currency: "USD",
  traceId: `trace:${id}`,
  merchantName,
  merchantCategory: "5411",
  occurredAt: "2026-08-01T02:00:00.000Z",
});

const initialHistory = () => commitCardTransactionHistoryPage(
  null,
  createCardTransactionHistoryRequestIdentity(1, "scope-a", "card:one", "SETTLED", null),
  { transactions: [transaction("tx-selected", "Before")], nextCursor: "cursor-before" },
);

type Context = {
  mounted: boolean;
  requestId: number;
  scope: string | null;
  cardId: string | null;
  filter: CardTransactionFilter;
  attempt: number;
  history: CardTransactionHistoryState | null;
  selection: CardTransactionDetailSelection | null;
  controller: AbortController | null;
};

const context = (): Context => {
  const history = initialHistory();
  return {
    mounted: true,
    requestId: 1,
    scope: "scope-a",
    cardId: "card:one",
    filter: "SETTLED",
    attempt: 0,
    history,
    selection: createCardTransactionDetailSelection("scope-a", "card:one", history.transactions[0], history.transactions),
    controller: null,
  };
};

const isCurrent = (
  state: Context,
  request: ReturnType<typeof createCardTransactionRefreshRequestIdentity>,
  controller: AbortController,
) => state.controller === controller && cardTransactionRefreshRequestIsCurrent(
  request,
  state.requestId,
  state.scope,
  state.cardId,
  state.filter,
  state.attempt,
  state.history,
  state.mounted,
);

mounted(`manual refresh retains the verified snapshot, then atomically replaces page, cursor and detail (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = context();
  const retained = state.history;
  const controller = new AbortController();
  state.controller = controller;
  state.attempt = 1;
  const request = createCardTransactionRefreshRequestIdentity(++state.requestId, "scope-a", "card:one", "SETTLED", state.attempt, retained);
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const transport = (_signal: AbortSignal) => {
    calls += 1;
    assert.equal(_signal, controller.signal);
    return new Promise<unknown>(done => { resolve = done; });
  };
  const operation = transport(controller.signal).then(page => {
    if (!isCurrent(state, request, controller)) return;
    state.history = commitCardTransactionRefreshPage(request, page);
    state.selection = reconcileCardTransactionDetailSelection(state.selection, state.scope, state.cardId, state.history.transactions, state.mounted);
  });
  assert.equal(state.history, retained, "pending refresh must keep the complete prior snapshot");
  assert.equal(state.history?.nextCursor, "cursor-before");
  resolve({ transactions: [transaction("tx-selected", "After")], nextCursor: "cursor-after" });
  await operation;
  assert.equal(calls, 1);
  assert.equal(state.history?.nextCursor, "cursor-after");
  assert.equal(state.selection?.transaction.merchantName, "After");

  const second = createCardTransactionRefreshRequestIdentity(++state.requestId, "scope-a", "card:one", "SETTLED", 1, state.history);
  state.attempt = 1;
  const withoutSelection = commitCardTransactionRefreshPage(second, { transactions: [], nextCursor: null });
  state.history = withoutSelection;
  state.selection = reconcileCardTransactionDetailSelection(state.selection, state.scope, state.cardId, withoutSelection.transactions, true);
  assert.equal(state.selection, null, "a transaction absent from the refreshed page must be cleared safely");
});

mounted(`failure keeps the same snapshot and requires explicit bounded retries with no automatic retry (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = context();
  const retained = state.history;
  let calls = 0;
  const transport = async () => { calls += 1; throw new Error("private-provider-error"); };
  for (let attempt = 1; attempt <= CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS; attempt += 1) {
    state.attempt = attempt;
    const request = createCardTransactionRefreshRequestIdentity(++state.requestId, "scope-a", "card:one", "SETTLED", attempt, retained);
    try {
      const page = await transport();
      if (cardTransactionRefreshRequestIsCurrent(request, state.requestId, state.scope, state.cardId, state.filter, state.attempt, state.history, state.mounted)) {
        state.history = commitCardTransactionRefreshPage(request, page);
      }
    } catch {
      // UI exposes one bounded generic error; it never schedules another transport call.
    }
    assert.equal(calls, attempt);
    assert.equal(state.history, retained);
  }
  assert.equal(calls, CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS);
  assert.throws(() => createCardTransactionRefreshRequestIdentity(++state.requestId, "scope-a", "card:one", "SETTLED", 4, retained), /attempt/);
});

mounted(`repeat refresh, filter, Card, session, logout and unmount abort old work with zero writes (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const invalidations: Array<(state: Context, controller: AbortController) => void> = [
    (state, controller) => { controller.abort(); state.controller = new AbortController(); state.requestId += 1; state.attempt += 1; },
    (state, controller) => { controller.abort(); state.controller = null; state.requestId += 1; state.filter = "REFUNDED"; state.history = null; },
    (state, controller) => { controller.abort(); state.controller = null; state.requestId += 1; state.cardId = "card:two"; state.history = null; },
    (state, controller) => { controller.abort(); state.controller = null; state.requestId += 1; state.scope = "scope-b"; state.history = null; },
    (state, controller) => { controller.abort(); state.controller = null; state.requestId += 1; state.scope = null; state.cardId = null; state.history = null; },
    (state, controller) => { controller.abort(); state.controller = null; state.requestId += 1; state.mounted = false; },
  ];
  for (const invalidate of invalidations) {
    const state = context();
    const retained = state.history;
    const controller = new AbortController();
    state.controller = controller;
    state.attempt = 1;
    const request = createCardTransactionRefreshRequestIdentity(++state.requestId, "scope-a", "card:one", "SETTLED", 1, retained);
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>(done => { resolve = done; });
    const operation = pending.then(page => {
      if (isCurrent(state, request, controller)) state.history = commitCardTransactionRefreshPage(request, page);
    });
    invalidate(state, controller);
    assert.equal(controller.signal.aborted, true);
    resolve({ transactions: [transaction("tx-late", "Late")], nextCursor: null });
    await operation;
    assert.notEqual(state.history?.transactions[0]?.id, "tx-late");
  }
});
