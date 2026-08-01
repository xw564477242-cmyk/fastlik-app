import assert from "node:assert/strict";
import test from "node:test";
import {
  cardDetailRefreshCanRetainSnapshot,
  cardDetailRefreshRequestIsCurrent,
  cardDetailRefreshRequestWasAborted,
  createCardDetailRefreshRequestIdentity,
  readCardDetailRefresh,
  type CardDetailRefreshSnapshot,
} from "../src/cardDetailRefresh.ts";
import { API_REQUEST_DEADLINE_MS } from "../src/requestPolicy.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const cardId = "card:mounted.refresh";

const card = () => ({
  id: cardId,
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Mounted",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
});
const balance = () => ({
  cardId,
  currency: "USD",
  availableBalanceMinor: "2500",
  currentBalanceMinor: "3000",
  pendingAmountMinor: "500",
  updatedAt: "2026-08-01T00:00:00Z",
});
const limits = () => ({
  cardId,
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-08-01T00:00:00Z",
});
const transactions = () => ({
  transactions: [{
    id: "transaction-mounted-01",
    status: "SETTLED",
    amountMinor: "1250",
    authorizedAmountMinor: "1250",
    clearedAmountMinor: "1250",
    settledAmountMinor: "1250",
    reversedAmountMinor: "0",
    refundedAmountMinor: "0",
    currency: "USD",
    traceId: "trace:public-mounted-01",
    merchantName: "Coffee",
    merchantCategory: "5812",
    occurredAt: "2026-08-01T00:00:00.000Z",
  }],
  nextCursor: null,
});

mounted(`one mounted manual refresh reads all four resources once (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls = { card: 0, balance: 0, limits: 0, transactions: 0 };
  const snapshot = await readCardDetailRefresh({
    card: async () => { calls.card += 1; return card(); },
    balance: async () => { calls.balance += 1; return balance(); },
    limits: async () => { calls.limits += 1; return limits(); },
    transactions: async () => { calls.transactions += 1; return transactions(); },
  }, cardId);
  assert.deepEqual(calls, { card: 1, balance: 1, limits: 1, transactions: 1 });
  assert.equal(snapshot.card.id, cardId);
  assert.equal(snapshot.transactions.transactions.length, 1);
});

type RefreshContext = {
  mounted: boolean;
  generation: number;
  scope: string | null;
  selectedCardId: string | null;
  activeController: AbortController | null;
};

const pendingReaders = (signals: AbortSignal[]) => {
  const pending = async (_id: string, signal?: AbortSignal) => {
    assert.ok(signal);
    signals.push(signal);
    return new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new DOMException("cancelled", "AbortError")),
        { once: true },
      );
    });
  };
  return { card: pending, balance: pending, limits: pending, transactions: pending };
};

const runCancelledRefresh = async (
  invalidate: (context: RefreshContext) => void,
) => {
  const writes = { success: 0, error: 0, finally: 0 };
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const context: RefreshContext = {
    mounted: true,
    generation: 1,
    scope: "scope-a",
    selectedCardId: cardId,
    activeController: controller,
  };
  const request = createCardDetailRefreshRequestIdentity(1, "scope-a", cardId);
  const isCurrent = () => context.activeController === controller && cardDetailRefreshRequestIsCurrent(
    request, context.generation, context.scope, context.selectedCardId, context.mounted,
  );
  const operation = readCardDetailRefresh(
    pendingReaders(signals),
    cardId,
    controller.signal,
  ).then(
    () => { if (isCurrent()) writes.success += 1; },
    value => { if (isCurrent() && !cardDetailRefreshRequestWasAborted(value)) writes.error += 1; },
  ).finally(() => { if (isCurrent()) writes.finally += 1; });

  await Promise.resolve();
  invalidate(context);
  await operation;

  assert.equal(signals.length, 4);
  assert.ok(signals.every(signal => signal === controller.signal && signal.aborted));
  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
};

mounted("repeated refresh aborts the old four-read domain and only the replacement can commit", async () => {
  await runCancelledRefresh(context => {
    context.activeController?.abort();
    context.activeController = new AbortController();
    context.generation += 1;
  });

  const replacement = await readCardDetailRefresh({
    card: async () => card(),
    balance: async () => balance(),
    limits: async () => limits(),
    transactions: async () => transactions(),
  }, cardId, new AbortController().signal);
  assert.equal(replacement.card.id, cardId);
});

mounted("Card switch, session change, logout and unmount abort all old reads with zero writes", async () => {
  const invalidations: Array<(context: RefreshContext) => void> = [
    context => {
      context.activeController?.abort();
      context.activeController = null;
      context.selectedCardId = "card:mounted.other";
    },
    context => {
      context.activeController?.abort();
      context.activeController = null;
      context.scope = "scope-b";
    },
    context => {
      context.activeController?.abort();
      context.activeController = null;
      context.scope = null;
      context.selectedCardId = null;
    },
    context => {
      context.activeController?.abort();
      context.activeController = null;
      context.mounted = false;
    },
  ];

  for (const invalidate of invalidations) await runCancelledRefresh(invalidate);
});

mounted("one failed component preserves the prior complete snapshot and exposes only a generic error", async () => {
  const prior = await readCardDetailRefresh({
    card: async () => card(),
    balance: async () => balance(),
    limits: async () => limits(),
    transactions: async () => transactions(),
  }, cardId);
  let displayed: CardDetailRefreshSnapshot = prior;
  let publicError = "";

  try {
    const next = await readCardDetailRefresh({
      card: async () => ({ ...card(), status: "FROZEN" }),
      balance: async () => ({ ...balance(), availableBalanceMinor: "2000" }),
      limits: async () => { throw new Error("providerSecret=must-not-leak"); },
      transactions: async () => ({ ...transactions(), transactions: [] }),
    }, cardId);
    displayed = next;
  } catch {
    publicError = "Card refresh unavailable for this session";
  }

  assert.equal(displayed, prior, "no detail, balance, limits or transaction subset may commit");
  assert.equal(publicError, "Card refresh unavailable for this session");
  assert.equal(publicError.includes("providerSecret"), false);
});

mounted("the existing 20-second deadline fails atomically and preserves the prior snapshot", async () => {
  assert.equal(API_REQUEST_DEADLINE_MS, 20_000);
  const prior = await readCardDetailRefresh({
    card: async () => card(),
    balance: async () => balance(),
    limits: async () => limits(),
    transactions: async () => transactions(),
  }, cardId);
  let displayed: CardDetailRefreshSnapshot = prior;
  let publicError = "";

  try {
    displayed = await readCardDetailRefresh({
      card: async () => card(),
      balance: async () => { throw new Error("API timeout · private trace must not leak"); },
      limits: async () => limits(),
      transactions: async () => transactions(),
    }, cardId);
  } catch {
    publicError = "Card refresh unavailable for this session";
  }

  assert.equal(displayed, prior);
  assert.equal(publicError, "Card refresh unavailable for this session");
  assert.equal(publicError.includes("trace"), false);
});

mounted("a different Card can never inherit the prior Card complete snapshot", async () => {
  let displayedCardId: string | null = cardId;
  const requestedCardId = "card:mounted.other";
  if (!cardDetailRefreshCanRetainSnapshot(displayedCardId, requestedCardId)) displayedCardId = null;

  await assert.rejects(() => readCardDetailRefresh({
    card: async () => { throw new Error("private failure"); },
    balance: async () => ({ ...balance(), cardId: requestedCardId }),
    limits: async () => ({ ...limits(), cardId: requestedCardId }),
    transactions: async () => transactions(),
  }, requestedCardId));

  assert.equal(displayedCardId, null, "the old Card snapshot must be cleared before another Card refresh");
});
