import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  CardReplacementConfirmationError,
  cardReplacementPostChainFailureIsAmbiguous,
  readCardReplacementConfirmation,
  runCardReplacementPostChain,
} from "../src/cardReplacementPostChain.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;

const predecessor = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_replace_old_1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Travel",
  availableBalanceMinor: "2500",
  createdAt: "2026-08-01T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const closedPredecessor = (overrides: Partial<CardRecord> = {}): CardRecord => predecessor({
  status: "CLOSED",
  capabilities: { freeze: false, unfreeze: false, replace: false, renew: false, updateLimits: false },
  ...overrides,
});

const successor = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_replace_new_1",
  type: "VIRTUAL",
  status: "PENDING",
  last4: null,
  expiryMonth: null,
  expiryYear: null,
  currency: "USD",
  alias: "Travel",
  availableBalanceMinor: "2500",
  createdAt: "2026-08-01T00:00:01.000Z",
  capabilities: { freeze: false, unfreeze: false, replace: false, renew: false, updateLimits: true },
  ...overrides,
});

const balance = () => ({
  cardId: successor().id,
  currency: "USD",
  availableBalanceMinor: "2500",
  currentBalanceMinor: "2500",
  pendingAmountMinor: "0",
  updatedAt: "2026-08-01T00:00:02.000Z",
});
const limits = () => ({
  cardId: successor().id,
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-08-01T00:00:02.000Z",
});
const transactions = () => ({ transactions: [], nextCursor: null });
const timeline = () => ({
  events: [{
    id: "event_replace_new_1",
    type: "CREATED",
    fromStatus: null,
    toStatus: "PENDING",
    occurredAt: "2026-08-01T00:00:01.000Z",
  }],
  nextCursor: null,
});

type Deferred<T> = Readonly<{ promise: Promise<T>; resolve: (value: T) => void }>;
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
};

const confirmation = (submitted: CardRecord, signal?: AbortSignal) => readCardReplacementConfirmation({
  card: async id => id === predecessor().id ? closedPredecessor() : successor(),
  cards: async () => ({ cards: [successor(), closedPredecessor()], nextCursor: null }),
}, predecessor(), submitted, signal);

mounted(`one accepted POST is confirmed before one atomic successor refresh (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: string[] = [];
  let commitReady = 0;
  const delayedTimeline = deferred<unknown>();
  const operation = runCardReplacementPostChain({
    selected: predecessor(),
    submit: async () => { calls.push("POST"); return successor(); },
    confirm: (submitted, signal) => readCardReplacementConfirmation({
      card: async id => { calls.push(`GET_DETAIL:${id}`); return id === predecessor().id ? closedPredecessor() : successor(); },
      cards: async () => { calls.push("GET_LIST"); return { cards: [successor(), closedPredecessor()], nextCursor: null }; },
    }, predecessor(), submitted, signal),
    refresh: {
      card: async () => { calls.push("GET_CARD_REFRESH"); return successor(); },
      balance: async () => { calls.push("GET_BALANCE"); return balance(); },
      limits: async () => { calls.push("GET_LIMITS"); return limits(); },
      transactions: async () => { calls.push("GET_TRANSACTIONS"); return transactions(); },
      timeline: async () => { calls.push("GET_TIMELINE"); return delayedTimeline.promise; },
    },
    isCurrent: () => true,
  }).then(result => { if (result?.status === "COMPLETE") commitReady += 1; return result; });

  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(commitReady, 0, "selection/list/detail must not partially commit");
  assert.equal(calls.filter(call => call === "POST").length, 1);
  assert.deepEqual(new Set(calls.slice(1, 4)), new Set([
    `GET_DETAIL:${predecessor().id}`,
    `GET_DETAIL:${successor().id}`,
    "GET_LIST",
  ]));
  assert.deepEqual(new Set(calls.slice(4)), new Set([
    "GET_CARD_REFRESH", "GET_BALANCE", "GET_LIMITS", "GET_TRANSACTIONS", "GET_TIMELINE",
  ]));
  delayedTimeline.resolve(timeline());
  const result = await operation;
  assert.equal(result?.status, "COMPLETE");
  if (!result || result.status !== "COMPLETE") throw new Error("complete replacement chain required");
  assert.equal(commitReady, 1);
  assert.equal(result.commit.card.id, successor().id);
  assert.equal(result.commit.predecessor.status, "CLOSED");
  assert.deepEqual(result.commit.cards.map(card => card.id), [successor().id, predecessor().id]);
  assert.equal(result.commit.balance.cardId, successor().id);
});

mounted("partial, missing, duplicate and mismatched persisted generations are rejected", async () => {
  const cases = [
    {
      card: async (id: string) => id === predecessor().id ? predecessor() : successor(),
      cards: async () => ({ cards: [closedPredecessor(), successor()], nextCursor: null }),
    },
    {
      card: async (id: string) => id === predecessor().id ? closedPredecessor() : successor(),
      cards: async () => ({ cards: [successor()], nextCursor: null }),
    },
    {
      card: async (id: string) => id === predecessor().id ? closedPredecessor() : successor(),
      cards: async () => ({ cards: [closedPredecessor(), successor(), successor()], nextCursor: null }),
    },
    {
      card: async (id: string) => id === predecessor().id ? closedPredecessor() : successor(),
      cards: async () => ({ cards: [closedPredecessor(), successor({ availableBalanceMinor: "2499" })], nextCursor: null }),
    },
  ];
  for (const readers of cases)
    await assert.rejects(() => readCardReplacementConfirmation(readers, predecessor(), successor()), CardReplacementConfirmationError);

  await assert.rejects(() => readCardReplacementConfirmation({
    card: async id => id === predecessor().id ? closedPredecessor() : successor(),
    cards: async () => ({ cards: [closedPredecessor(), successor()], nextCursor: null }),
  }, predecessor(), successor({ currency: "EUR" })), CardReplacementConfirmationError);
});

mounted("the paginated confirmation is bounded and an aborted generation performs no reads", async () => {
  let pages = 0;
  await assert.rejects(() => readCardReplacementConfirmation({
    card: async id => id === predecessor().id ? closedPredecessor() : successor(),
    cards: async () => {
      pages += 1;
      return { cards: [predecessor({ id: `card_other_${pages}` })], nextCursor: `cursor_${pages}` };
    },
  }, predecessor(), successor()), CardReplacementConfirmationError);
  assert.equal(pages, 25);

  let reads = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => readCardReplacementConfirmation({
    card: async () => { reads += 1; return successor(); },
    cards: async () => { reads += 1; return { cards: [], nextCursor: null }; },
  }, predecessor(), successor(), controller.signal), /cancelled/);
  assert.equal(reads, 0);
});

mounted("an unconfirmed accepted result never repeats POST and is explicitly ambiguous", async () => {
  let posts = 0;
  let refreshes = 0;
  const failure = await runCardReplacementPostChain({
    selected: predecessor(),
    submit: async () => { posts += 1; return successor(); },
    confirm: submitted => readCardReplacementConfirmation({
      card: async id => id === predecessor().id ? predecessor() : successor(),
      cards: async () => ({ cards: [closedPredecessor(), successor()], nextCursor: null }),
    }, predecessor(), submitted),
    refresh: {
      card: async () => { refreshes += 1; return successor(); },
      balance: async () => balance(),
      limits: async () => limits(),
      transactions: async () => transactions(),
      timeline: async () => timeline(),
    },
    isCurrent: () => true,
  }).then(() => null, value => value);
  assert.equal(posts, 1);
  assert.equal(refreshes, 0);
  assert.equal(cardReplacementPostChainFailureIsAmbiguous(failure), true);
});

mounted("a confirmed replacement plus any successor refresh failure yields only a safely invalidated commit", async () => {
  const failure = { status: 401, message: "Session expired" };
  for (const failed of ["card", "balance", "limits", "transactions", "timeline"] as const) {
    const result = await runCardReplacementPostChain({
      selected: predecessor(),
      submit: async () => successor(),
      confirm: confirmation,
      refresh: {
        card: async () => { if (failed === "card") throw failure; return successor(); },
        balance: async () => { if (failed === "balance") throw failure; return balance(); },
        limits: async () => { if (failed === "limits") throw failure; return limits(); },
        transactions: async () => { if (failed === "transactions") throw failure; return transactions(); },
        timeline: async () => { if (failed === "timeline") throw failure; return timeline(); },
      },
      isCurrent: () => true,
    });
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
    if (!result || result.status !== "CONFIRMED_REFRESH_FAILED") throw new Error("invalidated replacement required");
    assert.equal(result.commit.card.id, successor().id);
    assert.equal(result.commit.balance, null);
    assert.equal(result.commit.limits, null);
    assert.equal(result.commit.transactions, null);
    assert.equal(result.commit.timeline, null);
    assert.equal(sessionFailureRequiresClear(result.failure), true, "only the current explicit 401 invalidates the session");
  }
});

mounted("late success, error and 401 from a stale exact generation produce no commit or error write", async () => {
  for (const completion of ["success", "error", "401"] as const) {
    const delayed = deferred<unknown>();
    let current = true;
    const operation = runCardReplacementPostChain({
      selected: predecessor(),
      submit: async () => successor(),
      confirm: confirmation,
      refresh: {
        card: async () => successor(),
        balance: async () => delayed.promise,
        limits: async () => limits(),
        transactions: async () => transactions(),
        timeline: async () => timeline(),
      },
      isCurrent: () => current,
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    current = false;
    if (completion === "success") delayed.resolve(balance());
    else delayed.resolve(Promise.reject(completion === "401" ? { status: 401 } : { status: 503 }));
    assert.equal(await operation, null);
  }
});
