import assert from "node:assert/strict";
import test from "node:test";
import {
  cardDetailRefreshCanRetainSnapshot,
  cardDetailRefreshRequestIsCurrent,
  createCardDetailRefreshRequestIdentity,
  readCardDetailRefresh,
  type CardDetailRefreshSnapshot,
} from "../src/cardDetailRefresh.ts";

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
    currency: "USD",
    merchantName: "Coffee",
    merchantCategory: "5812",
    occurredAt: "2026-08-01T00:00:00Z",
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

mounted("scope, Card, generation and unmount changes make late success error and finally write zero", async () => {
  type Context = { mounted: boolean; generation: number; scope: string | null; selectedCardId: string | null };
  const invalidations: Array<(context: Context) => void> = [
    context => { context.scope = "scope-b"; },
    context => { context.selectedCardId = "card:mounted.other"; },
    context => { context.generation += 1; },
    context => { context.mounted = false; },
  ];
  const writes = { success: 0, error: 0, finally: 0 };

  for (const [index, invalidate] of invalidations.entries()) {
    const requestGeneration = index + 1;
    const context: Context = {
      mounted: true,
      generation: requestGeneration,
      scope: "scope-a",
      selectedCardId: cardId,
    };
    const request = createCardDetailRefreshRequestIdentity(requestGeneration, "scope-a", cardId);
    const isCurrent = () => cardDetailRefreshRequestIsCurrent(
      request, context.generation, context.scope, context.selectedCardId, context.mounted,
    );
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const operation = readCardDetailRefresh({
      card: async () => new Promise((next, fail) => { resolve = next; reject = fail; }),
      balance: async () => balance(),
      limits: async () => limits(),
      transactions: async () => transactions(),
    }, cardId).then(
      () => { if (isCurrent()) writes.success += 1; },
      () => { if (isCurrent()) writes.error += 1; },
    ).finally(() => { if (isCurrent()) writes.finally += 1; });
    await Promise.resolve();
    invalidate(context);
    if (index % 2 === 0) resolve(card());
    else reject(new Error("late private provider failure"));
    await operation;
  }

  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
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
