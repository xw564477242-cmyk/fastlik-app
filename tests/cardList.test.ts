import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_LIST_PAGE_SIZE,
  cardRequestIsCurrent,
  cardStatusActionDecision,
  cardListPath,
  mergeCardPages,
  parseCardPage,
  parseCardRecord,
  type CardRecord,
} from "../src/cardList.ts";

const rawCard = (id: string): Record<string, unknown> => ({
  id,
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Travel",
  availableBalanceMinor: "12345",
  createdAt: "2026-07-31T00:00:00.000Z",
  capabilities: {
    freeze: true,
    unfreeze: false,
    replace: true,
    renew: true,
    updateLimits: true,
  },
});

test("builds the canonical bounded card list request", () => {
  assert.equal(CARD_LIST_PAGE_SIZE, 20);
  assert.equal(cardListPath(), "/v1/cards?limit=20");
  assert.equal(cardListPath("opaque cursor/+"), "/v1/cards?limit=20&cursor=opaque+cursor%2F%2B");
});

test("normalizes a card page and exposes only public fields", () => {
  const page = parseCardPage({
    cards: [{ ...rawCard("card-1"), providerPublicToken: "must-not-leak", pan: "4111111111111111" }],
    nextCursor: "next-page",
  });

  assert.equal(page.nextCursor, "next-page");
  assert.deepEqual(Object.keys(page.cards[0]).sort(), [
    "alias",
    "availableBalanceMinor",
    "capabilities",
    "createdAt",
    "currency",
    "expiryMonth",
    "expiryYear",
    "id",
    "last4",
    "status",
    "type",
  ]);
  assert.equal("providerPublicToken" in page.cards[0], false);
  assert.equal("pan" in page.cards[0], false);
});

test("accepts an empty terminal page", () => {
  assert.deepEqual(parseCardPage({ cards: [], nextCursor: null }), { cards: [], nextCursor: null });
});

test("fails safely for malformed records and cursors", () => {
  assert.throws(() => parseCardPage([]), /Invalid card page/);
  assert.throws(() => parseCardPage({ cards: [rawCard("card-1")], nextCursor: "" }), /cursor/);
  assert.throws(() => parseCardRecord({ ...rawCard("card-1"), last4: "4111111111111111" }), /last4/);
  assert.throws(
    () => parseCardRecord({ ...rawCard("card-1"), availableBalanceMinor: 100 }),
    /balance/,
  );
});

test("appends pages without duplicating a card id", () => {
  const first = parseCardRecord(rawCard("card-1"));
  const updated = parseCardRecord({ ...rawCard("card-1"), alias: "Updated" });
  const second = parseCardRecord(rawCard("card-2"));
  assert.deepEqual(
    mergeCardPages([first], [updated, second]).map((card: CardRecord) => [card.id, card.alias]),
    [
      ["card-1", "Updated"],
      ["card-2", "Travel"],
    ],
  );
});

test("rejects a late Card A response after Card B becomes the target", () => {
  const cardARequest = { requestId: 11, scopeKey: "scope-1", cardId: "card-a" };

  assert.equal(cardRequestIsCurrent(cardARequest, 12, "scope-1", "card-b"), false);
  assert.equal(cardRequestIsCurrent(cardARequest, 11, "scope-1", "card-b"), false);
});

test("rejects success, error and completion work after the session scope changes", () => {
  const oldSessionRequest = { requestId: 20, scopeKey: "scope-old", cardId: "card-a" };

  assert.equal(cardRequestIsCurrent(oldSessionRequest, 20, "scope-new", "card-a"), false);
  assert.equal(cardRequestIsCurrent(oldSessionRequest, 20, "scope-old", "card-a"), true);
});

test("authorizes only the capability matching the current card status", () => {
  const active = parseCardRecord(rawCard("card-active"));
  const frozen = parseCardRecord({
    ...rawCard("card-frozen"),
    status: "FROZEN",
    capabilities: {
      freeze: false,
      unfreeze: true,
      replace: true,
      renew: true,
      updateLimits: true,
    },
  });

  assert.deepEqual(cardStatusActionDecision(active, "scope", "scope", active.id), {
    operation: "freeze",
    label: "Freeze",
    allowed: true,
    reason: null,
  });
  assert.deepEqual(cardStatusActionDecision(frozen, "scope", "scope", frozen.id), {
    operation: "unfreeze",
    label: "Unfreeze",
    allowed: true,
    reason: null,
  });
});

test("denies an operation when capability, status, scope, or selected card is unsafe", () => {
  const noFreeze = parseCardRecord({
    ...rawCard("card-a"),
    capabilities: { ...(rawCard("card-a").capabilities as object), freeze: false },
  });
  const pending = parseCardRecord({ ...rawCard("card-pending"), status: "PENDING" });

  assert.equal(cardStatusActionDecision(noFreeze, "scope", "scope", noFreeze.id).allowed, false);
  assert.match(
    cardStatusActionDecision(noFreeze, "scope", "scope", noFreeze.id).reason ?? "",
    /not permitted by the current card capabilities/,
  );
  assert.equal(cardStatusActionDecision(pending, "scope", "scope", pending.id).operation, null);
  assert.equal(cardStatusActionDecision(noFreeze, "scope-old", "scope-new", noFreeze.id).allowed, false);
  assert.equal(cardStatusActionDecision(noFreeze, "scope", "scope", "card-b").operation, null);
});
