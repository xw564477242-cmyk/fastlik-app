import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  cardStatusFailureKind,
  cardStatusRequestIsCurrent,
  cardStatusRetryKey,
  cardStatusSessionScope,
  createCardStatusIdempotencyKey,
  createCardStatusRequestIdentity,
  submitCardStatusAction,
  type CardStatusSession,
} from "../src/cardStatusAction.ts";
import {
  readCardActivationConfirmation,
  runCardActivationPostChain,
} from "../src/cardActivation.ts";
import type { CardDetailRefreshReaders } from "../src/cardDetailRefresh.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const now = Date.parse("2026-08-01T00:00:00Z");
const randomUuid = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const session = (overrides: Partial<CardStatusSession> = {}): CardStatusSession => ({
  actorId: "actor-activation-01",
  tenantId: "tenant-activation-01",
  customerId: "customer-activation-01",
  environment: runtime,
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const pending = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_activation_1",
  type: "VIRTUAL",
  status: "PENDING",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Activation",
  availableBalanceMinor: "2500",
  createdAt: "2026-08-01T00:00:00.000Z",
  capabilities: { freeze: false, unfreeze: false, replace: false, renew: false, updateLimits: true },
  ...overrides,
});

const active = (overrides: Partial<CardRecord> = {}): CardRecord => pending({
  status: "ACTIVE",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const wireActive = (overrides: Record<string, unknown> = {}) => ({
  ...active(),
  providerOperationRef: "must-never-reach-consumer-state",
  ...overrides,
});

const balance = (id = pending().id) => ({ cardId: id, currency: "USD", availableBalanceMinor: "2500", currentBalanceMinor: "2500", pendingAmountMinor: "0", updatedAt: "2026-08-01T00:00:01.000Z" });
const limits = (id = pending().id) => ({ cardId: id, singleTransactionMinor: "10000", dailySpendMinor: "50000", monthlySpendMinor: "500000", dailyAtmMinor: "20000", updatedAt: "2026-08-01T00:00:01.000Z" });
const transactions = () => ({ transactions: [], nextCursor: null });
const timeline = () => ({ events: [{ id: "event_activation_1", type: "ACTIVATED", fromStatus: "PENDING", toStatus: "ACTIVE", occurredAt: "2026-08-01T00:00:01.000Z" }], nextCursor: null });

const completeRefreshReaders = (
  overrides: Partial<CardDetailRefreshReaders> = {},
): CardDetailRefreshReaders => ({
  card: async () => active(),
  balance: async id => balance(id),
  limits: async id => limits(id),
  transactions: async () => transactions(),
  timeline: async () => timeline(),
  ...overrides,
});

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (failure: unknown) => void;
}>;

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
};

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

mounted(`PENDING Card activation uses one bodyless POST then atomically refreshes the whole Card screen (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const activeSession = session();
  const selected = pending();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("activation scope required");
  const key = createCardStatusIdempotencyKey("activate", randomUuid);
  const post = deferred<unknown>();
  const confirmationCard = deferred<CardRecord>();
  const confirmationList = deferred<{ cards: CardRecord[]; nextCursor: null }>();
  const refreshCard = deferred<unknown>();
  const refreshBalance = deferred<unknown>();
  const refreshLimits = deferred<unknown>();
  const refreshTransactions = deferred<unknown>();
  const refreshTimeline = deferred<unknown>();
  const calls: Array<Record<string, unknown>> = [];
  const reads: string[] = [];
  let commits = 0;
  const operation = runCardActivationPostChain({
    selected,
    submit: signal => submitCardStatusAction(
      async request => { calls.push(request); return post.promise; },
      activeSession, runtime, scope, selected.id, selected, "activate", key, now, signal,
    ),
    confirm: signal => readCardActivationConfirmation({
      card: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}`); return confirmationCard.promise; },
      cards: async cursor => { reads.push(`GET /v1/cards?limit=20${cursor ? `&cursor=${cursor}` : ""}`); return confirmationList.promise; },
    }, selected, signal),
    refresh: {
      card: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}`); return refreshCard.promise; },
      balance: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}/balance`); return refreshBalance.promise; },
      limits: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}/limits`); return refreshLimits.promise; },
      transactions: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}/transactions`); return refreshTransactions.promise; },
      timeline: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}/timeline`); return refreshTimeline.promise; },
    },
    isCurrent: () => true,
    signal: new AbortController().signal,
  }).then(result => {
    if (result?.status === "COMPLETE") commits += 1;
    return result;
  });

  await nextTurn();
  assert.equal(commits, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(calls[0]).filter(([name]) => name !== "signal")), {
    path: "/v1/cards/card_activation_1/activate",
    method: "POST",
    idempotencyKey: key,
  });
  assert.equal("body" in calls[0], false);
  post.resolve(wireActive());
  await nextTurn();
  assert.equal(commits, 0);
  assert.deepEqual(reads, ["GET /v1/cards/card_activation_1"]);
  confirmationCard.resolve(active());
  await nextTurn();
  assert.equal(commits, 0);
  confirmationList.resolve({ cards: [active()], nextCursor: null });
  await nextTurn();
  assert.equal(commits, 0);
  assert.equal(reads.length, 7);
  refreshCard.resolve(active());
  refreshBalance.resolve(balance());
  refreshLimits.resolve(limits());
  refreshTransactions.resolve(transactions());
  await nextTurn();
  assert.equal(commits, 0);
  refreshTimeline.resolve(timeline());
  const result = await operation;
  assert.equal(commits, 1);
  assert.equal(result?.status, "COMPLETE");
  if (!result || result.status !== "COMPLETE") throw new Error("complete activation required");
  assert.deepEqual(reads, [
    "GET /v1/cards/card_activation_1",
    "GET /v1/cards?limit=20",
    "GET /v1/cards/card_activation_1",
    "GET /v1/cards/card_activation_1/balance",
    "GET /v1/cards/card_activation_1/limits",
    "GET /v1/cards/card_activation_1/transactions",
    "GET /v1/cards/card_activation_1/timeline",
  ]);
  assert.equal(result.commit.card.status, "ACTIVE");
  assert.equal(result.commit.balance.cardId, selected.id);
  assert.equal(result.commit.limits.cardId, selected.id);
  assert.equal(result.commit.timeline.events[0]?.type, "ACTIVATED");
});

mounted("each confirmed associated GET failure produces one ACTIVE/list-only invalidation commit and never a second POST", async () => {
  const activeSession = session();
  const selected = pending();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("activation scope required");
  for (const resource of ["card", "balance", "limits", "transactions", "timeline"] as const) {
    let posts = 0;
    let commits = 0;
    const failure = { status: 503, resource };
    const outcome = await runCardActivationPostChain({
      selected,
      submit: async () => { posts += 1; return active(); },
      confirm: signal => readCardActivationConfirmation({
        card: async () => active(),
        cards: async () => ({ cards: [active()], nextCursor: null }),
      }, selected, signal),
      refresh: completeRefreshReaders({ [resource]: async () => { throw failure; } }),
      isCurrent: () => true,
    });
    if (outcome) commits += 1;
    assert.equal(posts, 1, `${resource} failure must not resubmit activation`);
    assert.equal(commits, 1, `${resource} failure has one caller-visible fallback commit`);
    assert.equal(outcome?.status, "CONFIRMED_REFRESH_FAILED");
    if (!outcome || outcome.status !== "CONFIRMED_REFRESH_FAILED") throw new Error("confirmed failure required");
    assert.equal(outcome.commit.card.status, "ACTIVE");
    assert.equal(outcome.commit.cards.find(row => row.id === selected.id)?.status, "ACTIVE");
    assert.equal(outcome.commit.balance, null);
    assert.equal(outcome.commit.limits, null);
    assert.equal(outcome.commit.transactions, null);
    assert.equal(outcome.commit.timeline, null);
  }
});

mounted("a current associated GET 401 is surfaced for Session clearing instead of retaining Card state", async () => {
  const selected = pending();
  const failure = { status: 401, message: "Session expired" };
  const outcome = await runCardActivationPostChain({
    selected,
    submit: async () => active(),
    confirm: signal => readCardActivationConfirmation({
      card: async () => active(),
      cards: async () => ({ cards: [active()], nextCursor: null }),
    }, selected, signal),
    refresh: completeRefreshReaders({ balance: async () => { throw failure; } }),
    isCurrent: () => true,
  });
  assert.equal(outcome?.status, "CONFIRMED_REFRESH_FAILED");
  if (!outcome || outcome.status !== "CONFIRMED_REFRESH_FAILED") throw new Error("confirmed 401 required");
  let sessionClears = 0;
  let cardCommits = 0;
  if (sessionFailureRequiresClear(outcome.failure)) sessionClears += 1;
  else cardCommits += 1;
  assert.equal(sessionClears, 1);
  assert.equal(cardCommits, 0);
});

mounted("Session, environment, Card and generation replacement make late success/error/401/finally write zero", async () => {
  const invalidations = ["Session", "environment", "Card", "generation"] as const;
  const completions = ["success", "error", "401"] as const;
  for (const invalidation of invalidations) {
    for (const completion of completions) {
      const activeSession = session();
      const selected = pending();
      const scope = cardStatusSessionScope(activeSession, runtime, now);
      if (!scope) throw new Error("activation scope required");
      const request = createCardStatusRequestIdentity(9, scope, "activate", activeSession, selected, createCardStatusIdempotencyKey("activate", randomUuid));
      const context: {
        generation: number;
        currentSession: CardStatusSession;
        currentRuntime: "SANDBOX" | "TEST";
        currentCard: CardRecord;
      } = { generation: 9, currentSession: activeSession, currentRuntime: runtime, currentCard: selected };
      const delayedBalance = deferred<unknown>();
      const isCurrent = () => cardStatusRequestIsCurrent(
        request,
        context.generation,
        context.currentSession,
        context.currentRuntime,
        scope,
        context.currentCard,
        now,
      );
      const writes = { success: 0, error: 0, unauthorized: 0, finally: 0 };
      const operation = runCardActivationPostChain({
        selected,
        submit: async () => active(),
        confirm: signal => readCardActivationConfirmation({
          card: async () => active(),
          cards: async () => ({ cards: [active()], nextCursor: null }),
        }, selected, signal),
        refresh: completeRefreshReaders({ balance: async () => delayedBalance.promise }),
        isCurrent,
      }).then(
        outcome => {
          if (!isCurrent() || !outcome) return;
          if (outcome.status === "COMPLETE") writes.success += 1;
          else if (sessionFailureRequiresClear(outcome.failure)) writes.unauthorized += 1;
          else writes.error += 1;
        },
        failure => {
          if (!isCurrent()) return;
          if (sessionFailureRequiresClear(failure)) writes.unauthorized += 1;
          else writes.error += 1;
        },
      ).finally(() => { if (isCurrent()) writes.finally += 1; });

      await nextTurn();
      if (invalidation === "Session") context.currentSession = session();
      else if (invalidation === "environment") context.currentRuntime = runtime === "SANDBOX" ? "TEST" : "SANDBOX";
      else if (invalidation === "Card") context.currentCard = pending();
      else context.generation += 1;

      if (completion === "success") delayedBalance.resolve(balance());
      else if (completion === "401") delayedBalance.reject({ status: 401, message: "Late Session expired" });
      else delayedBalance.reject({ status: 503, message: "Late refresh failure" });
      await operation;
      assert.deepEqual(writes, { success: 0, error: 0, unauthorized: 0, finally: 0 }, `${invalidation}/${completion}`);
    }
  }
});

mounted("409 and timeout/server ambiguity reuse exactly one activation key while 401/403/404 stay distinct", () => {
  const activeSession = session();
  const selected = pending();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("activation scope required");
  const key = createCardStatusIdempotencyKey("activate", randomUuid);
  const first = createCardStatusRequestIdentity(1, scope, "activate", activeSession, selected, key);
  assert.equal(cardStatusRetryKey(first, activeSession, scope, selected, "activate"), key);
  const retry = createCardStatusRequestIdentity(2, scope, "activate", activeSession, selected, key, true);
  assert.equal(cardStatusRetryKey(retry, activeSession, scope, selected, "activate"), null);
  assert.equal(cardStatusFailureKind({ status: 401 }), "UNAUTHORIZED");
  assert.equal(cardStatusFailureKind({ status: 403 }), "FORBIDDEN");
  assert.equal(cardStatusFailureKind({ status: 404 }), "NOT_FOUND");
  assert.equal(cardStatusFailureKind({ status: 409 }), "CONFLICT");
  assert.equal(cardStatusFailureKind({ status: 408 }), "AMBIGUOUS");
  assert.equal(cardStatusFailureKind({ status: 503 }), "AMBIGUOUS");
});

mounted("PRODUCTION and expired sessions fail before the activation transport", async () => {
  let calls = 0;
  const selected = pending();
  const key = createCardStatusIdempotencyKey("activate", randomUuid);
  for (const [candidate, candidateRuntime] of [
    [session({ environment: "PRODUCTION" }), "PRODUCTION"],
    [session({ expiresAt: "2026-08-01T00:00:00Z" }), runtime],
  ] as const) {
    await assert.rejects(() => submitCardStatusAction(
      async () => { calls += 1; return wireActive(); },
      candidate, candidateRuntime, "invalid-scope", selected.id, selected, "activate", key, now,
    ));
  }
  assert.equal(calls, 0);
});
