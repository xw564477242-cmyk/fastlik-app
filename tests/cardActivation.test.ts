import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_ACTIVATION_LIST_MAX_PAGES,
  CardActivationConfirmationError,
  CardActivationPostRefreshError,
  cardActivationFailureIsAmbiguous,
  createCardActivationCommit,
  readCardActivationConfirmation,
} from "../src/cardActivation.ts";
import { readCardDetailRefresh } from "../src/cardDetailRefresh.ts";
import type { CardPage, CardRecord } from "../src/cardList.ts";

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
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

const active = (overrides: Partial<CardRecord> = {}): CardRecord => card({
  status: "ACTIVE",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const completeActiveSnapshot = (overrides: Partial<CardRecord> = {}) => readCardDetailRefresh({
  card: async () => active(overrides),
  balance: async () => ({ cardId: card().id, currency: "USD", availableBalanceMinor: "2500", currentBalanceMinor: "2500", pendingAmountMinor: "0", updatedAt: "2026-08-01T00:00:01.000Z" }),
  limits: async () => ({ cardId: card().id, singleTransactionMinor: "10000", dailySpendMinor: "50000", monthlySpendMinor: "500000", dailyAtmMinor: "20000", updatedAt: "2026-08-01T00:00:01.000Z" }),
  transactions: async () => ({ transactions: [], nextCursor: null }),
  timeline: async () => ({ events: [{ id: "event_activation_1", type: "ACTIVATED", fromStatus: "PENDING", toStatus: "ACTIVE", occurredAt: "2026-08-01T00:00:01.000Z" }], nextCursor: null }),
}, card().id);

test("commits only when canonical Card GET and paginated list agree on the same ACTIVE Card", async () => {
  const selected = card();
  const verified = active();
  const cursors: Array<string | null> = [];
  const result = await readCardActivationConfirmation({
    card: async id => {
      assert.equal(id, selected.id);
      return verified;
    },
    cards: async (cursor, previous): Promise<CardPage> => {
      cursors.push(cursor);
      if (cursor === null) {
        assert.equal(previous.length, 0);
        return { cards: [active({ id: "card_newer_1", createdAt: "2026-08-02T00:00:00.000Z" })], nextCursor: "page-two" };
      }
      assert.equal(cursor, "page-two");
      assert.equal(previous.length, 1);
      return { cards: [verified], nextCursor: null };
    },
  }, selected);
  assert.deepEqual(cursors, [null, "page-two"]);
  assert.equal(result.card, verified);
  assert.equal(result.cards.at(-1), verified);
  assert.equal(result.nextCursor, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.cards), true);
});

test("fails closed when either real read is stale, cross-Card, internally inconsistent or absent", async () => {
  const selected = card();
  const cases: Array<{ detail: CardRecord; page: CardPage }> = [
    { detail: card(), page: { cards: [active()], nextCursor: null } },
    { detail: active({ id: "card_other_1" }), page: { cards: [active()], nextCursor: null } },
    { detail: active(), page: { cards: [card()], nextCursor: null } },
    { detail: active(), page: { cards: [active({ alias: "Mismatch" })], nextCursor: null } },
    { detail: active(), page: { cards: [], nextCursor: null } },
  ];
  for (const item of cases) {
    await assert.rejects(
      () => readCardActivationConfirmation({ card: async () => item.detail, cards: async () => item.page }, selected),
      CardActivationConfirmationError,
    );
  }
  assert.equal(cardActivationFailureIsAmbiguous(new CardActivationConfirmationError()), true);
  assert.equal(cardActivationFailureIsAmbiguous(new Error("local")), false);
});

test("creates one atomic activation commit only after detail, list and complete Card snapshot agree", async () => {
  const verified = active();
  const confirmation = Object.freeze({ card: verified, cards: Object.freeze([verified]), nextCursor: null });
  const snapshot = await completeActiveSnapshot();
  const commit = createCardActivationCommit(confirmation, snapshot);
  assert.equal(commit.card.status, "ACTIVE");
  assert.equal(commit.cards[0], commit.card);
  assert.equal(commit.balance.cardId, commit.card.id);
  assert.equal(commit.limits.cardId, commit.card.id);
  assert.equal(commit.timeline.events[0]?.type, "ACTIVATED");
  assert.equal(Object.isFrozen(commit), true);
  assert.equal(Object.isFrozen(commit.cards), true);

  await assert.rejects(async () => createCardActivationCommit(
    confirmation,
    await completeActiveSnapshot({ alias: "Cross-generation" }),
  ), CardActivationPostRefreshError);
  assert.equal(cardActivationFailureIsAmbiguous(new CardActivationPostRefreshError()), false);
});

test("rejects non-PENDING selection before reads and propagates cancellation without a commit", async () => {
  let calls = 0;
  const readers = {
    card: async () => { calls += 1; return active(); },
    cards: async () => { calls += 1; return { cards: [active()], nextCursor: null }; },
  };
  await assert.rejects(() => readCardActivationConfirmation(readers, active()), CardActivationConfirmationError);
  assert.equal(calls, 0);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => readCardActivationConfirmation(readers, card(), controller.signal),
    (value: unknown) => value instanceof DOMException && value.name === "AbortError",
  );
  assert.equal(calls, 0);
});

test("bounds list confirmation work and never searches indefinitely", async () => {
  let pages = 0;
  await assert.rejects(() => readCardActivationConfirmation({
    card: async () => active(),
    cards: async (): Promise<CardPage> => {
      pages += 1;
      return {
        cards: [active({ id: `card_other_${pages}`, createdAt: `2026-07-${String(31 - pages).padStart(2, "0")}T00:00:00.000Z` })],
        nextCursor: `page-${pages + 1}`,
      };
    },
  }, card()), CardActivationConfirmationError);
  assert.equal(pages, CARD_ACTIVATION_LIST_MAX_PAGES);
});
