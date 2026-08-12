import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_LIST_PAGE_SIZE,
  CARD_LIST_MAX_JSON_BYTES,
  cardListRequestIsCurrent,
  cardRequestIsCurrent,
  cardStatusActionDecision,
  cardListPath,
  createCardListRequestIdentity,
  mergeCardPages,
  parseCardPage,
  parseCardPageRaw,
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

const cursor = (value: string): string => Buffer.from(value).toString("base64url");

const fullPage = (): Record<string, unknown>[] =>
  Array.from({ length: CARD_LIST_PAGE_SIZE }, (_, index) => ({
    ...rawCard(`card-${String(CARD_LIST_PAGE_SIZE - index).padStart(2, "0")}`),
    createdAt: new Date(Date.parse("2026-07-31T00:00:00.000Z") - index * 1_000).toISOString(),
  }));

test("builds the canonical bounded card list request", () => {
  assert.equal(CARD_LIST_PAGE_SIZE, 20);
  assert.equal(cardListPath(), "/v1/cards?limit=20");
  const next = cursor("opaque-cursor");
  assert.equal(cardListPath(next), `/v1/cards?limit=20&cursor=${next}`);
  assert.throws(() => cardListPath("opaque cursor/+"), /cursor/);
});

test("normalizes an exact public card page", () => {
  const page = parseCardPage({
    cards: [rawCard("card-1")],
    nextCursor: null,
  });

  assert.equal(page.nextCursor, null);
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
});

test("accepts and strips the backend effective fee extension from list records", () => {
  const page = parseCardPage({
    cards: [{ ...rawCard("card-1"), effectiveFees: { source: "PRODUCT_TEMPLATE" } }],
    nextCursor: null,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(page.cards[0], "effectiveFees"), false);
});

test("accepts an empty terminal page", () => {
  assert.deepEqual(parseCardPage({ cards: [], nextCursor: null }), { cards: [], nextCursor: null });
});

test("fails closed for extra, malformed, duplicated, unordered, or oversized data", () => {
  assert.throws(() => parseCardPage([]), /Invalid card page/);
  assert.throws(() => parseCardPage({ cards: [rawCard("card-1")], nextCursor: "" }), /cursor/);
  assert.throws(
    () => parseCardPage({ cards: [{ ...rawCard("card-1"), pan: "4111111111111111" }], nextCursor: null }),
    /fields/,
  );
  assert.throws(
    () => parseCardPage({ cards: [rawCard("card-1"), rawCard("card-1")], nextCursor: null }),
    /Duplicate card id/,
  );
  assert.throws(
    () => parseCardPage({ cards: [rawCard("card-1"), rawCard("card-2")], nextCursor: null }),
    /monotonic/,
  );
  assert.throws(
    () => parseCardPage({ cards: [rawCard("card-1")], nextCursor: cursor("next") }),
    /full page/,
  );
  assert.throws(() => parseCardRecord({ ...rawCard("card-1"), last4: "4111111111111111" }), /last4/);
  assert.throws(
    () => parseCardRecord({ ...rawCard("card-1"), availableBalanceMinor: 100 }),
    /balance/,
  );
  assert.throws(
    () => parseCardPageRaw('{"cards":[],"cards":[],"nextCursor":null}'),
    /Duplicate Card list JSON object key/,
  );
  assert.throws(
    () => parseCardPageRaw(`{"cards":[],"nextCursor":null,"padding":"${"x".repeat(CARD_LIST_MAX_JSON_BYTES)}"}`),
    /exceeds the consumer limit/,
  );
});

test("accepts a full ordered page only with a canonical bounded cursor", () => {
  const page = parseCardPage({ cards: fullPage(), nextCursor: cursor("next-page") });
  assert.equal(page.cards.length, CARD_LIST_PAGE_SIZE);
  assert.equal(page.nextCursor, cursor("next-page"));
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

test("rejects late Card list work after cursor, scope, generation, or mount changes", () => {
  const request = createCardListRequestIdentity(7, "scope-a", cursor("page-2"));
  assert.equal(cardListRequestIsCurrent(request, 7, "scope-a", cursor("page-2"), true), true);
  assert.equal(cardListRequestIsCurrent(request, 8, "scope-a", cursor("page-2"), true), false);
  assert.equal(cardListRequestIsCurrent(request, 7, "scope-b", cursor("page-2"), true), false);
  assert.equal(cardListRequestIsCurrent(request, 7, "scope-a", cursor("page-3"), true), false);
  assert.equal(cardListRequestIsCurrent(request, 7, "scope-a", cursor("page-2"), false), false);
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
