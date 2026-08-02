import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  CardStatusConfirmationError,
  cardStatusPostChainFailureIsAmbiguous,
  readCardStatusConfirmation,
  runCardStatusPostChain,
} from "../src/cardStatusPostChain.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;

const active = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_status_1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Status Card",
  availableBalanceMinor: "2500",
  createdAt: "2026-08-01T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const frozen = (overrides: Partial<CardRecord> = {}): CardRecord => active({
  status: "FROZEN",
  capabilities: { freeze: false, unfreeze: true, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const balance = () => ({ cardId: active().id, currency: "USD", availableBalanceMinor: "2500", currentBalanceMinor: "2500", pendingAmountMinor: "0", updatedAt: "2026-08-01T00:00:01.000Z" });
const limits = () => ({ cardId: active().id, singleTransactionMinor: "10000", dailySpendMinor: "50000", monthlySpendMinor: "500000", dailyAtmMinor: "20000", updatedAt: "2026-08-01T00:00:01.000Z" });
const transactions = () => ({ transactions: [], nextCursor: null });
const timeline = (fromStatus: "ACTIVE" | "FROZEN", toStatus: "ACTIVE" | "FROZEN") => ({ events: [{ id: "event_status_1", type: toStatus === "FROZEN" ? "FROZEN" : "UNFROZEN", fromStatus, toStatus, occurredAt: "2026-08-01T00:00:01.000Z" }], nextCursor: null });

type Deferred<T> = Readonly<{ promise: Promise<T>; resolve: (value: T) => void }>;
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
};

mounted(`freeze and unfreeze each use one POST, two exact confirmation reads and one atomic five-resource refresh (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  for (const operation of ["freeze", "unfreeze"] as const) {
    const selected = operation === "freeze" ? active() : frozen();
    const changed = operation === "freeze" ? frozen() : active();
    const fromStatus = selected.status as "ACTIVE" | "FROZEN";
    const toStatus = changed.status as "ACTIVE" | "FROZEN";
    const calls: string[] = [];
    let commits = 0;
    const delayedTimeline = deferred<unknown>();
    const outcomePromise = runCardStatusPostChain({
      selected,
      operation,
      submit: async () => { calls.push("POST"); return changed; },
      confirm: (submitted, signal) => readCardStatusConfirmation({
        card: async () => { calls.push("GET_CARD_CONFIRM"); return changed; },
        cards: async () => { calls.push("GET_LIST_CONFIRM"); return { cards: [changed], nextCursor: null }; },
      }, selected, submitted, operation, signal),
      refresh: {
        card: async () => { calls.push("GET_CARD_REFRESH"); return changed; },
        balance: async () => { calls.push("GET_BALANCE"); return balance(); },
        limits: async () => { calls.push("GET_LIMITS"); return limits(); },
        transactions: async () => { calls.push("GET_TRANSACTIONS"); return transactions(); },
        timeline: async () => { calls.push("GET_TIMELINE"); return delayedTimeline.promise; },
      },
      isCurrent: () => true,
    }).then(outcome => { if (outcome?.status === "COMPLETE") commits += 1; return outcome; });

    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(commits, 0, "no partial result is commit-ready");
    assert.equal(calls.filter(call => call === "POST").length, 1);
    assert.deepEqual(calls.slice(0, 3), ["POST", "GET_CARD_CONFIRM", "GET_LIST_CONFIRM"]);
    assert.deepEqual(new Set(calls.slice(3)), new Set(["GET_CARD_REFRESH", "GET_BALANCE", "GET_LIMITS", "GET_TRANSACTIONS", "GET_TIMELINE"]));
    delayedTimeline.resolve(timeline(fromStatus, toStatus));
    const outcome = await outcomePromise;
    assert.equal(outcome?.status, "COMPLETE");
    if (!outcome || outcome.status !== "COMPLETE") throw new Error("complete status chain required");
    assert.equal(commits, 1);
    assert.equal(outcome.commit.card.status, toStatus);
    assert.equal(outcome.commit.cards[0].status, toStatus);
    assert.equal(outcome.commit.balance.cardId, selected.id);
  }
});

mounted("confirmation fails closed on a different selected generation or any detail/list public-version mismatch", async () => {
  await assert.rejects(() => readCardStatusConfirmation({
    card: async () => frozen({ alias: "Different persisted alias" }),
    cards: async () => ({ cards: [frozen()], nextCursor: null }),
  }, active(), frozen(), "freeze"), CardStatusConfirmationError);

  await assert.rejects(() => readCardStatusConfirmation({
    card: async () => frozen(),
    cards: async () => ({ cards: [frozen({ availableBalanceMinor: "2499" })], nextCursor: null }),
  }, active(), frozen(), "freeze"), CardStatusConfirmationError);

  await assert.rejects(() => readCardStatusConfirmation({
    card: async () => frozen(),
    cards: async () => ({ cards: [frozen()], nextCursor: null }),
  }, active({ alias: "Older generation" }), frozen(), "freeze"), CardStatusConfirmationError);
});

mounted("confirmation list search is bounded and cancellation stops before any persisted read", async () => {
  let pages = 0;
  await assert.rejects(() => readCardStatusConfirmation({
    card: async () => frozen(),
    cards: async () => {
      pages += 1;
      return { cards: [frozen({ id: `other_card_${pages}` })], nextCursor: `cursor_${pages}` };
    },
  }, active(), frozen(), "freeze"), CardStatusConfirmationError);
  assert.equal(pages, 25);

  let reads = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => readCardStatusConfirmation({
    card: async () => { reads += 1; return frozen(); },
    cards: async () => { reads += 1; return { cards: [frozen()], nextCursor: null }; },
  }, active(), frozen(), "freeze", controller.signal), /cancelled/);
  assert.equal(reads, 0);
});

mounted("an unconfirmed accepted response never auto-repeats the POST and is explicitly ambiguous", async () => {
  let posts = 0;
  let refreshes = 0;
  const failure = await runCardStatusPostChain({
    selected: active(),
    operation: "freeze",
    submit: async () => { posts += 1; return frozen(); },
    confirm: submitted => readCardStatusConfirmation({
      card: async () => frozen({ alias: "mismatch" }),
      cards: async () => ({ cards: [frozen()], nextCursor: null }),
    }, active(), submitted, "freeze"),
    refresh: {
      card: async () => { refreshes += 1; return frozen(); },
      balance: async () => balance(),
      limits: async () => limits(),
      transactions: async () => transactions(),
      timeline: async () => timeline("ACTIVE", "FROZEN"),
    },
    isCurrent: () => true,
  }).then(() => null, value => value);
  assert.equal(posts, 1);
  assert.equal(refreshes, 0);
  assert.equal(cardStatusPostChainFailureIsAmbiguous(failure), true);
});

mounted("confirmed status plus associated refresh failure produces only a safely invalidated commit", async () => {
  const failure = { status: 401, message: "Session expired" };
  const outcome = await runCardStatusPostChain({
    selected: active(),
    operation: "freeze",
    submit: async () => frozen(),
    confirm: submitted => readCardStatusConfirmation({
      card: async () => frozen(),
      cards: async () => ({ cards: [frozen()], nextCursor: null }),
    }, active(), submitted, "freeze"),
    refresh: {
      card: async () => frozen(),
      balance: async () => { throw failure; },
      limits: async () => limits(),
      transactions: async () => transactions(),
      timeline: async () => timeline("ACTIVE", "FROZEN"),
    },
    isCurrent: () => true,
  });
  assert.equal(outcome?.status, "CONFIRMED_REFRESH_FAILED");
  if (!outcome || outcome.status !== "CONFIRMED_REFRESH_FAILED") throw new Error("invalidated status chain required");
  assert.equal(outcome.commit.card.status, "FROZEN");
  assert.equal(outcome.commit.balance, null);
  assert.equal(outcome.commit.limits, null);
  assert.equal(outcome.commit.transactions, null);
  assert.equal(outcome.commit.timeline, null);
  assert.equal(sessionFailureRequiresClear(outcome.failure), true, "current explicit 401 is delegated to session invalidation");
});

mounted("late status refresh success, error or 401 returns no commit after the exact request generation becomes stale", async () => {
  for (const completion of ["success", "error", "401"] as const) {
    const delayed = deferred<unknown>();
    let current = true;
    const operation = runCardStatusPostChain({
      selected: active(),
      operation: "freeze",
      submit: async () => frozen(),
      confirm: submitted => readCardStatusConfirmation({
        card: async () => frozen(),
        cards: async () => ({ cards: [frozen()], nextCursor: null }),
      }, active(), submitted, "freeze"),
      refresh: {
        card: async () => frozen(),
        balance: async () => delayed.promise,
        limits: async () => limits(),
        transactions: async () => transactions(),
        timeline: async () => timeline("ACTIVE", "FROZEN"),
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
