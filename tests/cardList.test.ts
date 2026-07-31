import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_LIST_PAGE_SIZE,
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
