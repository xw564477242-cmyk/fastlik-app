import assert from "node:assert/strict";
import test from "node:test";
import {
  cardTransactionDetailRefreshRequestIsCurrent,
  cardTransactionDetailRefreshWasAborted,
  createCardTransactionDetailRefreshRequestIdentity,
  readCardTransactionDetailRefresh,
} from "../src/cardTransactionDetailRefresh.ts";
import {
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
  type CardTransactionHistoryState,
} from "../src/cardTransactionHistory.ts";
import type {CardTransactionRecord} from "../src/cardTransactions.ts";
import {walletTransferSessionScope} from "../src/walletTransfer.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mountedTest = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const baseNow = Date.parse("2026-08-01T02:00:00.000Z");
const session = {actorId: "actor", tenantId: "tenant", customerId: "customer", environment: runtime, expiresAt: "2026-08-01T03:00:00.000Z"};
const scope = () => walletTransferSessionScope(session, runtime, baseNow)!;
const transaction = (merchantName = "Before", id = "tx:selected") => ({
  id, status: "SETTLED", amountMinor: "100", authorizedAmountMinor: "100", clearedAmountMinor: "100", settledAmountMinor: "100", reversedAmountMinor: "0", refundedAmountMinor: "0", currency: "USD", traceId: "trace:selected", merchantName, merchantCategory: "5411", occurredAt: "2026-08-01T02:00:00.000Z",
});
const history = () => commitCardTransactionHistoryPage(null, createCardTransactionHistoryRequestIdentity(1, scope(), "card:one", "SETTLED", null), {transactions: [transaction()], nextCursor: null});

type State = {
  mounted: boolean;
  requestId: number;
  scopeKey: string | null;
  cardId: string | null;
  filter: "SETTLED" | "REFUNDED";
  history: CardTransactionHistoryState | null;
  selected: CardTransactionRecord | null;
  controller: AbortController | null;
  loading: boolean;
  error: string;
  writes: {success: number; error: number; finally: number};
};
const state = (): State => {const list = history(); return {mounted: true, requestId: 0, scopeKey: scope(), cardId: "card:one", filter: "SETTLED", history: list, selected: list.transactions[0], controller: null, loading: false, error: "", writes: {success: 0, error: 0, finally: 0}};};

const start = (current: State, transport: Parameters<typeof readCardTransactionDetailRefresh>[0], clock: () => number = () => baseNow) => {
  current.controller?.abort();
  current.requestId += 1;
  const controller = new AbortController();
  current.controller = controller;
  const list = current.history!;
  const selected = list.transactions.find(row => row.id === current.selected?.id)!;
  const request = createCardTransactionDetailRefreshRequestIdentity(current.requestId, current.scopeKey!, current.cardId!, current.filter, selected.id, list);
  const isCurrent = () => current.controller === controller && walletTransferSessionScope(session, runtime, clock()) === request.scopeKey && cardTransactionDetailRefreshRequestIsCurrent(request, current.requestId, current.scopeKey, current.cardId, current.filter, current.history, current.selected?.id ?? null, current.mounted);
  current.loading = true;
  current.error = "";
  const operation = readCardTransactionDetailRefresh(transport, session, runtime, request.scopeKey, request.cardId, selected, controller.signal, clock).then(detail => {
    if (!isCurrent()) return;
    current.selected = detail;
    current.writes.success += 1;
  }).catch(value => {
    if (isCurrent() && !cardTransactionDetailRefreshWasAborted(value)) {
      current.error = "Card transaction detail unavailable for this session";
      current.writes.error += 1;
    }
  }).finally(() => {
    if (isCurrent()) {
      current.controller = null;
      current.loading = false;
      current.writes.finally += 1;
    }
  });
  return {controller, operation};
};

mountedTest(`one click keeps the old detail pending and atomically replaces it after one GET (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const pending = start(current, request => {calls += 1; assert.equal(request.method, "GET"); return new Promise(done => {resolve = done;});});
  assert.equal(current.selected?.merchantName, "Before");
  assert.equal(current.loading, true);
  resolve(transaction("After"));
  await pending.operation;
  assert.equal(calls, 1);
  assert.equal(current.selected?.merchantName, "After");
  assert.deepEqual(current.writes, {success: 1, error: 0, finally: 1});
});

mountedTest(`failure retains the verified detail, emits one stable error and never retries (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  let calls = 0;
  await start(current, async () => {calls += 1; throw new Error("private Provider stack");}).operation;
  assert.equal(calls, 1);
  assert.equal(current.selected?.merchantName, "Before");
  assert.equal(current.error, "Card transaction detail unavailable for this session");
  assert.equal(current.error.includes("Provider"), false);
  assert.deepEqual(current.writes, {success: 0, error: 1, finally: 1});
});

mountedTest(`repeat click, Card, filter, session, logout, list replacement and unmount abort late work with zero writes (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const invalidations: Array<(current: State, controller: AbortController) => void> = [
    (current, controller) => {controller.abort(); current.requestId += 1; current.controller = new AbortController();},
    (current, controller) => {controller.abort(); current.requestId += 1; current.cardId = "card:two";},
    (current, controller) => {controller.abort(); current.requestId += 1; current.filter = "REFUNDED";},
    (current, controller) => {controller.abort(); current.requestId += 1; current.scopeKey = JSON.stringify(["other"]);},
    (current, controller) => {controller.abort(); current.requestId += 1; current.scopeKey = null; current.cardId = null; current.selected = null;},
    (current, controller) => {controller.abort(); current.requestId += 1; current.history = history();},
    (current, controller) => {controller.abort(); current.requestId += 1; current.mounted = false;},
  ];
  for (const invalidate of invalidations) {
    const current = state();
    let resolve!: (value: unknown) => void;
    const pending = start(current, () => new Promise(done => {resolve = done;}));
    invalidate(current, pending.controller);
    assert.equal(pending.controller.signal.aborted, true);
    resolve(transaction("Late"));
    await pending.operation;
    assert.deepEqual(current.writes, {success: 0, error: 0, finally: 0});
    assert.notEqual(current.selected?.merchantName, "Late");
  }
});

mountedTest(`natural expiry makes late success, error and finally perform zero writes (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  let now = baseNow;
  let resolve!: (value: unknown) => void;
  const pending = start(current, () => new Promise(done => {resolve = done;}), () => now);
  now = Date.parse(session.expiresAt);
  resolve(transaction("Late"));
  await pending.operation;
  assert.deepEqual(current.writes, {success: 0, error: 0, finally: 0});
  assert.equal(current.selected?.merchantName, "Before");
});
