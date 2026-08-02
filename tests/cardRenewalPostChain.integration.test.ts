import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  CardRenewalConfirmationError,
  CardRenewalPredecessorError,
  cardRenewalPostChainFailureIsAmbiguous,
  confirmCardRenewalPredecessor,
  readCardRenewalConfirmation,
  runCardRenewalPostChain,
} from "../src/cardRenewalPostChain.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;

const predecessor = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_renew_1",
  type: "PHYSICAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Daily",
  availableBalanceMinor: "2500",
  createdAt: "2026-08-01T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const renewed = (overrides: Partial<CardRecord> = {}): CardRecord => predecessor({
  expiryMonth: 1,
  expiryYear: 2033,
  ...overrides,
});

const balance = () => ({
  cardId: predecessor().id,
  currency: "USD",
  availableBalanceMinor: "2500",
  currentBalanceMinor: "2500",
  pendingAmountMinor: "0",
  updatedAt: "2026-08-01T00:00:02.000Z",
});
const limits = () => ({
  cardId: predecessor().id,
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-08-01T00:00:02.000Z",
});
const transactions = () => ({ transactions: [], nextCursor: null });
const timeline = () => ({
  events: [{
    id: "event_renew_1",
    type: "RENEWED",
    fromStatus: "ACTIVE",
    toStatus: "ACTIVE",
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

const confirmation = (submitted: CardRecord, signal?: AbortSignal) => readCardRenewalConfirmation({
  card: async () => renewed(),
  cards: async () => ({ cards: [renewed()], nextCursor: null }),
}, predecessor(), submitted, signal);

mounted(`one exact predecessor GET, one POST and one atomic renewed snapshot (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: string[] = [];
  let commitReady = 0;
  const delayedTimeline = deferred<unknown>();
  const operation = runCardRenewalPostChain({
    selected: predecessor(),
    predecessor: async () => { calls.push("GET_PREDECESSOR"); return predecessor(); },
    submit: async () => { calls.push("POST"); return renewed(); },
    confirm: (submitted, signal) => readCardRenewalConfirmation({
      card: async () => { calls.push("GET_RENEWED_DETAIL"); return renewed(); },
      cards: async () => { calls.push("GET_LIST"); return { cards: [renewed()], nextCursor: null }; },
    }, predecessor(), submitted, signal),
    refresh: {
      card: async () => { calls.push("GET_CARD_REFRESH"); return renewed(); },
      balance: async () => { calls.push("GET_BALANCE"); return balance(); },
      limits: async () => { calls.push("GET_LIMITS"); return limits(); },
      transactions: async () => { calls.push("GET_TRANSACTIONS"); return transactions(); },
      timeline: async () => { calls.push("GET_TIMELINE"); return delayedTimeline.promise; },
    },
    isCurrent: () => true,
  }).then(result => { if (result?.status === "COMPLETE") commitReady += 1; return result; });

  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(commitReady, 0);
  assert.deepEqual(calls.slice(0, 4), ["GET_PREDECESSOR", "POST", "GET_RENEWED_DETAIL", "GET_LIST"]);
  assert.equal(calls.filter(call => call === "POST").length, 1);
  assert.deepEqual(new Set(calls.slice(4)), new Set([
    "GET_CARD_REFRESH", "GET_BALANCE", "GET_LIMITS", "GET_TRANSACTIONS", "GET_TIMELINE",
  ]));
  delayedTimeline.resolve(timeline());
  const result = await operation;
  assert.equal(result?.status, "COMPLETE");
  if (!result || result.status !== "COMPLETE") throw new Error("complete renewal chain required");
  assert.equal(commitReady, 1);
  assert.equal(result.commit.card.id, predecessor().id);
  assert.equal(result.commit.card.expiryYear, renewed().expiryYear);
  assert.equal(result.commit.predecessor.expiryYear, predecessor().expiryYear);
  assert.equal(result.commit.balance.cardId, predecessor().id);
});

mounted("a mismatched persisted predecessor fails before POST", async () => {
  let posts = 0;
  await assert.rejects(() => runCardRenewalPostChain({
    selected: predecessor(),
    predecessor: async () => predecessor({ availableBalanceMinor: "2499" }),
    submit: async () => { posts += 1; return renewed(); },
    confirm: confirmation,
    refresh: {
      card: async () => renewed(),
      balance: async () => balance(),
      limits: async () => limits(),
      transactions: async () => transactions(),
      timeline: async () => timeline(),
    },
    isCurrent: () => true,
  }), CardRenewalPredecessorError);
  assert.equal(posts, 0);
  assert.throws(() => confirmCardRenewalPredecessor(predecessor(), predecessor({ alias: "other" })), CardRenewalPredecessorError);
});

mounted("non-advancing, partial, missing, duplicate and mismatched renewed generations are rejected", async () => {
  await assert.rejects(() => readCardRenewalConfirmation({
    card: async () => predecessor(),
    cards: async () => ({ cards: [predecessor()], nextCursor: null }),
  }, predecessor(), predecessor()), CardRenewalConfirmationError);

  const cases = [
    {
      card: async () => predecessor(),
      cards: async () => ({ cards: [renewed()], nextCursor: null }),
    },
    {
      card: async () => renewed(),
      cards: async () => ({ cards: [], nextCursor: null }),
    },
    {
      card: async () => renewed(),
      cards: async () => ({ cards: [renewed(), renewed()], nextCursor: null }),
    },
    {
      card: async () => renewed(),
      cards: async () => ({ cards: [renewed({ availableBalanceMinor: "2499" })], nextCursor: null }),
    },
  ];
  for (const readers of cases)
    await assert.rejects(() => readCardRenewalConfirmation(readers, predecessor(), renewed()), CardRenewalConfirmationError);

  for (const invalid of [
    renewed({ status: "FROZEN" }),
    renewed({ availableBalanceMinor: "2499" }),
    renewed({ capabilities: { ...renewed().capabilities, renew: false } }),
  ]) await assert.rejects(() => readCardRenewalConfirmation({
    card: async () => invalid,
    cards: async () => ({ cards: [invalid], nextCursor: null }),
  }, predecessor(), invalid), CardRenewalConfirmationError);
});

mounted("the renewed list confirmation is bounded and cancellation performs no persisted read", async () => {
  let pages = 0;
  await assert.rejects(() => readCardRenewalConfirmation({
    card: async () => renewed(),
    cards: async () => {
      pages += 1;
      return { cards: [predecessor({ id: `card_other_${pages}` })], nextCursor: `cursor_${pages}` };
    },
  }, predecessor(), renewed()), CardRenewalConfirmationError);
  assert.equal(pages, 25);

  let reads = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => readCardRenewalConfirmation({
    card: async () => { reads += 1; return renewed(); },
    cards: async () => { reads += 1; return { cards: [], nextCursor: null }; },
  }, predecessor(), renewed(), controller.signal), /cancelled/);
  assert.equal(reads, 0);
});

mounted("an unconfirmed accepted renewal never repeats POST and is explicitly ambiguous", async () => {
  let posts = 0;
  let refreshes = 0;
  const failure = await runCardRenewalPostChain({
    selected: predecessor(),
    predecessor: async () => predecessor(),
    submit: async () => { posts += 1; return renewed(); },
    confirm: submitted => readCardRenewalConfirmation({
      card: async () => renewed({ alias: "mismatch" }),
      cards: async () => ({ cards: [renewed()], nextCursor: null }),
    }, predecessor(), submitted),
    refresh: {
      card: async () => { refreshes += 1; return renewed(); },
      balance: async () => balance(),
      limits: async () => limits(),
      transactions: async () => transactions(),
      timeline: async () => timeline(),
    },
    isCurrent: () => true,
  }).then(() => null, value => value);
  assert.equal(posts, 1);
  assert.equal(refreshes, 0);
  assert.equal(cardRenewalPostChainFailureIsAmbiguous(failure), true);
});

mounted("any confirmed renewed resource failure yields only a safely invalidated commit", async () => {
  const failure = { status: 401, message: "Session expired" };
  for (const failed of ["card", "balance", "limits", "transactions", "timeline"] as const) {
    const result = await runCardRenewalPostChain({
      selected: predecessor(),
      predecessor: async () => predecessor(),
      submit: async () => renewed(),
      confirm: confirmation,
      refresh: {
        card: async () => { if (failed === "card") throw failure; return renewed(); },
        balance: async () => { if (failed === "balance") throw failure; return balance(); },
        limits: async () => { if (failed === "limits") throw failure; return limits(); },
        transactions: async () => { if (failed === "transactions") throw failure; return transactions(); },
        timeline: async () => { if (failed === "timeline") throw failure; return timeline(); },
      },
      isCurrent: () => true,
    });
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
    if (!result || result.status !== "CONFIRMED_REFRESH_FAILED") throw new Error("invalidated renewal required");
    assert.equal(result.commit.card.expiryYear, renewed().expiryYear);
    assert.equal(result.commit.balance, null);
    assert.equal(result.commit.limits, null);
    assert.equal(result.commit.transactions, null);
    assert.equal(result.commit.timeline, null);
    assert.equal(sessionFailureRequiresClear(result.failure), true);
  }
});

mounted("stale generation late success, error and 401 produce zero commit or error write", async () => {
  for (const completion of ["success", "error", "401"] as const) {
    const delayed = deferred<unknown>();
    let current = true;
    const operation = runCardRenewalPostChain({
      selected: predecessor(),
      predecessor: async () => predecessor(),
      submit: async () => renewed(),
      confirm: confirmation,
      refresh: {
        card: async () => renewed(),
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
