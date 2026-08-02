import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  VirtualCardCreateConfirmationError,
  readVirtualCardCreateConfirmation,
  runVirtualCardCreatePostChain,
  virtualCardCreatePostChainFailureCause,
  virtualCardCreatePostChainFailureIsAmbiguous,
} from "../src/virtualCardCreatePostChain.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;

const created = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_created_1",
  type: "VIRTUAL",
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

const existing = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  ...created({ id: "card_existing_1", type: "PHYSICAL", last4: "1111", alias: "Existing" }),
  ...overrides,
});

const balance = () => ({
  cardId: created().id,
  currency: "USD",
  availableBalanceMinor: "2500",
  currentBalanceMinor: "2500",
  pendingAmountMinor: "0",
  updatedAt: "2026-08-01T00:00:02.000Z",
});
const limits = () => ({
  cardId: created().id,
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-08-01T00:00:02.000Z",
});
const transactions = () => ({ transactions: [], nextCursor: null });
const timeline = () => ({
  events: [{
    id: "event_create_1",
    type: "CREATED",
    fromStatus: null,
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

const confirmation = (submitted: CardRecord, signal?: AbortSignal) => readVirtualCardCreateConfirmation({
  card: async () => created(),
  cards: async () => ({ cards: [created(), existing()], nextCursor: null }),
}, submitted, signal);

mounted(`one POST confirms one persisted created Card and commits one atomic snapshot (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: string[] = [];
  let commits = 0;
  const delayedTimeline = deferred<unknown>();
  const operation = runVirtualCardCreatePostChain({
    existingCards: [existing()],
    submit: async () => { calls.push("POST"); return created(); },
    confirm: (submitted, signal) => readVirtualCardCreateConfirmation({
      card: async () => { calls.push("GET_CREATED_DETAIL"); return created(); },
      cards: async () => { calls.push("GET_LIST"); return { cards: [created(), existing()], nextCursor: null }; },
    }, submitted, signal),
    refresh: {
      card: async () => { calls.push("GET_CARD_REFRESH"); return created(); },
      balance: async () => { calls.push("GET_BALANCE"); return balance(); },
      limits: async () => { calls.push("GET_LIMITS"); return limits(); },
      transactions: async () => { calls.push("GET_TRANSACTIONS"); return transactions(); },
      timeline: async () => { calls.push("GET_TIMELINE"); return delayedTimeline.promise; },
    },
    isCurrent: () => true,
  }).then(result => { if (result?.status === "COMPLETE") commits += 1; return result; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(commits, 0);
  assert.deepEqual(calls.slice(0, 3), ["POST", "GET_CREATED_DETAIL", "GET_LIST"]);
  assert.equal(calls.filter(call => call === "POST").length, 1);
  assert.deepEqual(new Set(calls.slice(3)), new Set([
    "GET_CARD_REFRESH", "GET_BALANCE", "GET_LIMITS", "GET_TRANSACTIONS", "GET_TIMELINE",
  ]));
  delayedTimeline.resolve(timeline());
  const result = await operation;
  assert.equal(result?.status, "COMPLETE");
  if (!result || result.status !== "COMPLETE") throw new Error("complete create chain required");
  assert.equal(commits, 1);
  assert.equal(result.commit.card.id, created().id);
  assert.equal(result.commit.cards.filter(card => card.id === created().id).length, 1);
  assert.equal(result.commit.balance.cardId, created().id);
});

mounted("created Card confirmation rejects collision, missing, duplicate and mismatched generations", async () => {
  let confirms = 0;
  const collision = await runVirtualCardCreatePostChain({
    existingCards: [created()],
    submit: async () => created(),
    confirm: async () => { confirms += 1; return confirmation(created()); },
    refresh: {
      card: async () => created(), balance: async () => balance(), limits: async () => limits(),
      transactions: async () => transactions(), timeline: async () => timeline(),
    },
    isCurrent: () => true,
  }).then(() => null, value => value);
  assert.equal(confirms, 0);
  assert.equal(virtualCardCreatePostChainFailureIsAmbiguous(collision), true);

  const cases = [
    { card: async () => existing(), cards: async () => ({ cards: [created()], nextCursor: null }) },
    { card: async () => created(), cards: async () => ({ cards: [], nextCursor: null }) },
    { card: async () => created(), cards: async () => ({ cards: [created(), created()], nextCursor: null }) },
    { card: async () => created(), cards: async () => ({ cards: [created({ alias: "Other" })], nextCursor: null }) },
  ];
  for (const readers of cases)
    await assert.rejects(() => readVirtualCardCreateConfirmation(readers, created()), VirtualCardCreateConfirmationError);
  await assert.rejects(() => readVirtualCardCreateConfirmation({
    card: async () => created({ type: "PHYSICAL" }),
    cards: async () => ({ cards: [created({ type: "PHYSICAL" })], nextCursor: null }),
  }, created({ type: "PHYSICAL" })), VirtualCardCreateConfirmationError);
});

mounted("created Card list confirmation is bounded and pre-cancellation performs no read", async () => {
  let pages = 0;
  await assert.rejects(() => readVirtualCardCreateConfirmation({
    card: async () => created(),
    cards: async () => {
      pages += 1;
      return { cards: [existing({ id: `card_other_${pages}` })], nextCursor: `cursor_${pages}` };
    },
  }, created()), VirtualCardCreateConfirmationError);
  assert.equal(pages, 25);

  let reads = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => readVirtualCardCreateConfirmation({
    card: async () => { reads += 1; return created(); },
    cards: async () => { reads += 1; return { cards: [], nextCursor: null }; },
  }, created(), controller.signal), /cancelled/);
  assert.equal(reads, 0);
});

mounted("submission and persisted-confirmation ambiguity never repeats POST or begins refresh", async () => {
  for (const phase of ["submit", "confirm"] as const) {
    let posts = 0;
    let refreshes = 0;
    const explicit = { status: 401, message: "expired" };
    const failure = await runVirtualCardCreatePostChain({
      existingCards: [existing()],
      submit: async () => { posts += 1; if (phase === "submit") throw explicit; return created(); },
      confirm: async () => { throw explicit; },
      refresh: {
        card: async () => { refreshes += 1; return created(); },
        balance: async () => balance(), limits: async () => limits(),
        transactions: async () => transactions(), timeline: async () => timeline(),
      },
      isCurrent: () => true,
    }).then(() => null, value => value);
    assert.equal(posts, 1);
    assert.equal(refreshes, 0);
    assert.equal(virtualCardCreatePostChainFailureIsAmbiguous(failure), true);
    assert.equal(virtualCardCreatePostChainFailureCause(failure), explicit);
    assert.equal(sessionFailureRequiresClear(virtualCardCreatePostChainFailureCause(failure)), true);
  }
});

mounted("each confirmed created Card resource failure yields only a safely invalidated commit", async () => {
  const failure = { status: 503 };
  for (const failed of ["card", "balance", "limits", "transactions", "timeline"] as const) {
    const result = await runVirtualCardCreatePostChain({
      existingCards: [existing()],
      submit: async () => created(),
      confirm: confirmation,
      refresh: {
        card: async () => { if (failed === "card") throw failure; return created(); },
        balance: async () => { if (failed === "balance") throw failure; return balance(); },
        limits: async () => { if (failed === "limits") throw failure; return limits(); },
        transactions: async () => { if (failed === "transactions") throw failure; return transactions(); },
        timeline: async () => { if (failed === "timeline") throw failure; return timeline(); },
      },
      isCurrent: () => true,
    });
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
    if (!result || result.status !== "CONFIRMED_REFRESH_FAILED") throw new Error("invalidated create required");
    assert.equal(result.commit.card.id, created().id);
    assert.equal(result.commit.balance, null);
    assert.equal(result.commit.limits, null);
    assert.equal(result.commit.transactions, null);
    assert.equal(result.commit.timeline, null);
  }
});

mounted("stale generation late success, error and 401 produce zero commit or error write", async () => {
  for (const completion of ["success", "error", "401"] as const) {
    const delayed = deferred<unknown>();
    let current = true;
    const operation = runVirtualCardCreatePostChain({
      existingCards: [existing()],
      submit: async () => created(),
      confirm: confirmation,
      refresh: {
        card: async () => created(),
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
