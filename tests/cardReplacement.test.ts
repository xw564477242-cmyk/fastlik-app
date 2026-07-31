import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_REPLACEMENT_REASONS,
  captureCardReplacementVersion,
  cardReplacementDecision,
  cardReplacementPath,
  cardReplacementRequestIsCurrent,
  cardReplacementVersionMatches,
  parseCardReplacementInput,
  parseCardReplacementResponse,
  replaceCardInCollection,
  validateCardReplacementIdempotencyKey,
} from "../src/cardReplacement.ts";
import type { CardRecord } from "../src/cardList.ts";

const selectedCard = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_old-1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Travel",
  createdAt: "2026-07-31T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const rawReplacement = (): Record<string, unknown> => ({
  id: "card_new-1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "9876",
  expiryMonth: 12,
  expiryYear: 2033,
  currency: "USD",
  alias: "Travel",
  createdAt: "2026-07-31T12:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerPublicToken: "provider-secret",
  maskedPan: "************9876",
  tenantId: "tenant-private",
  customerId: "customer-private",
  environment: "SANDBOX",
});

test("shows and executes replacement only for a replaceable selected Card in matching SANDBOX or TEST", () => {
  const card = selectedCard();
  for (const environment of ["SANDBOX", "TEST"] as const)
    assert.equal(cardReplacementDecision(card, environment, environment, "scope", "scope", card.id).allowed, true);
  for (const environment of ["LOCAL", "UAT", "PRODUCTION"] as const)
    assert.equal(cardReplacementDecision(card, environment, environment, "scope", "scope", card.id).allowed, false);
  assert.equal(cardReplacementDecision(card, "SANDBOX", "TEST", "scope", "scope", card.id).allowed, false);
  assert.equal(cardReplacementDecision(card, null, "TEST", "scope", "scope", card.id).allowed, false);
  assert.equal(cardReplacementDecision(card, "TEST", "TEST", "old", "new", card.id).allowed, false);
  assert.equal(cardReplacementDecision(card, "TEST", "TEST", "scope", "scope", "card_other").allowed, false);
  assert.equal(cardReplacementDecision(
    selectedCard({ capabilities: { ...card.capabilities, replace: false } }),
    "TEST",
    "TEST",
    "scope",
    "scope",
    card.id,
  ).allowed, false);
});

test("allows only the Backend replacement reason allowlist without executing input accessors", () => {
  assert.deepEqual(CARD_REPLACEMENT_REASONS, ["LOST", "STOLEN", "DAMAGED", "OTHER"]);
  for (const reason of CARD_REPLACEMENT_REASONS)
    assert.deepEqual(parseCardReplacementInput({ reason }), { reason });
  for (const reason of ["DESTROYED", "lost", "", null, 1])
    assert.throws(() => parseCardReplacementInput({ reason }), /reason/);
  assert.throws(() => parseCardReplacementInput(Object.create({ reason: "LOST" })), /input/);
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "reason", { get: () => { getterCalls += 1; return "LOST"; } });
  assert.throws(() => parseCardReplacementInput(accessor), /reason/);
  assert.equal(getterCalls, 0);
});

test("uses the existing endpoint and one validated caller-owned idempotency key", () => {
  assert.equal(cardReplacementPath("card_old-1"), "/v1/cards/card_old-1/replace");
  assert.equal(cardReplacementPath("card.old:1"), "/v1/cards/card.old%3A1/replace");
  assert.throws(() => cardReplacementPath("bad/id"), /old Card ID/);
  const key = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(validateCardReplacementIdempotencyKey(key), key);
  for (const invalid of [
    "123e4567-e89b-12d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000",
    "short",
    "123e4567-e89b-42d3-7456-426614174000",
  ])
    assert.throws(() => validateCardReplacementIdempotencyKey(invalid), /idempotency key/);
});

test("reconstructs only the public Card allowlist and requires a distinct replacement identity", () => {
  const replacement = parseCardReplacementResponse(rawReplacement(), "card_old-1");
  assert.deepEqual(Object.keys(replacement).sort(), [
    "alias", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  assert.equal(replacement.id, "card_new-1");
  for (const forbidden of ["providerPublicToken", "maskedPan", "pan", "token", "tenantId", "customerId", "environment"])
    assert.equal(forbidden in replacement, false);
  assert.throws(
    () => parseCardReplacementResponse({ ...rawReplacement(), id: "card_old-1" }, "card_old-1"),
    /distinct Card identity/,
  );
  assert.equal(parseCardReplacementResponse({ ...rawReplacement(), id: "card.new:1" }, "card.old:1").id, "card.new:1");
});

test("atomically removes the selected old Card, inserts the replacement, and rejects ID collisions", () => {
  const oldCard = selectedCard();
  const otherCard = selectedCard({ id: "card_other-1", last4: "1111" });
  const replacement = parseCardReplacementResponse(rawReplacement(), oldCard.id);
  const current = [oldCard, otherCard];
  const next = replaceCardInCollection(current, oldCard.id, replacement);
  assert.deepEqual(next.map((card) => card.id), [replacement.id, otherCard.id]);
  assert.equal(next[0], replacement);
  assert.deepEqual(current.map((card) => card.id), [oldCard.id, otherCard.id]);
  assert.throws(
    () => replaceCardInCollection(current, oldCard.id, selectedCard({ id: otherCard.id })),
    /collides/,
  );
  assert.throws(() => replaceCardInCollection([otherCard], oldCard.id, replacement), /unavailable or duplicated/);
  assert.throws(() => replaceCardInCollection([oldCard, oldCard], oldCard.id, replacement), /unavailable or duplicated/);
});

test("requires ordinary response objects and own data fields without executing getters", () => {
  assert.throws(() => parseCardReplacementResponse(Object.create(rawReplacement()), "card_old-1"), /response/);
  assert.throws(
    () => parseCardReplacementResponse(Object.assign(Object.create(null), rawReplacement()), "card_old-1"),
    /response/,
  );
  class ProviderResponse {
    constructor() { Object.assign(this, rawReplacement()); }
  }
  assert.throws(() => parseCardReplacementResponse(new ProviderResponse(), "card_old-1"), /response/);

  const missing = rawReplacement();
  delete missing.id;
  assert.throws(() => parseCardReplacementResponse(missing, "card_old-1"), /new Card ID/);

  let getterCalls = 0;
  const accessor = rawReplacement();
  Object.defineProperty(accessor, "id", {
    configurable: true,
    get: () => { getterCalls += 1; return "card_new-1"; },
  });
  assert.throws(() => parseCardReplacementResponse(accessor, "card_old-1"), /new Card ID/);
  assert.equal(getterCalls, 0);
});

test("never reflects or reads unknown Provider, PAN, token or scope accessors", () => {
  let getterCalls = 0;
  const response = rawReplacement();
  for (const key of ["providerPublicToken", "maskedPan", "pan", "token", "tenantId", "customerId", "environment", "internalError"])
    Object.defineProperty(response, key, {
      configurable: true,
      get: () => { getterCalls += 1; throw new Error(`Unknown ${key} was read`); },
    });
  assert.equal(parseCardReplacementResponse(response, "card_old-1").id, "card_new-1");
  assert.equal(getterCalls, 0);
});

test("rejects capabilities accessors and non-ordinary capabilities with zero getter executions", () => {
  let getterCalls = 0;
  const responseAccessor = rawReplacement();
  Object.defineProperty(responseAccessor, "capabilities", {
    configurable: true,
    get: () => { getterCalls += 1; return {}; },
  });
  assert.throws(() => parseCardReplacementResponse(responseAccessor, "card_old-1"), /capabilities/);
  assert.equal(getterCalls, 0);

  const capabilityAccessor = rawReplacement();
  const capabilities = capabilityAccessor.capabilities as Record<string, unknown>;
  Object.defineProperty(capabilities, "replace", {
    configurable: true,
    get: () => { getterCalls += 1; return true; },
  });
  assert.throws(() => parseCardReplacementResponse(capabilityAccessor, "card_old-1"), /capability replace/);
  assert.equal(getterCalls, 0);

  class ProviderCapabilities {
    freeze = true;
    unfreeze = false;
    replace = true;
    renew = true;
    updateLimits = true;
  }
  assert.throws(
    () => parseCardReplacementResponse({ ...rawReplacement(), capabilities: new ProviderCapabilities() }, "card_old-1"),
    /capabilities/,
  );
});

test("validates all public Card fields and canonical signed-64 optional balance", () => {
  for (const availableBalanceMinor of ["0", "1", "-1", "9223372036854775807", "-9223372036854775808"])
    assert.equal(
      parseCardReplacementResponse({ ...rawReplacement(), availableBalanceMinor }, "card_old-1").availableBalanceMinor,
      availableBalanceMinor,
    );
  for (const availableBalanceMinor of ["-0", "00", "01", "-01", "+1", "9223372036854775808", "-9223372036854775809"])
    assert.throws(
      () => parseCardReplacementResponse({ ...rawReplacement(), availableBalanceMinor }, "card_old-1"),
      /balance/,
    );
  assert.throws(() => parseCardReplacementResponse({ ...rawReplacement(), last4: "4111111111111111" }, "card_old-1"), /last4/);
  assert.throws(() => parseCardReplacementResponse({ ...rawReplacement(), createdAt: "2026-02-30T00:00:00Z" }, "card_old-1"), /createdAt/);
  assert.throws(() => parseCardReplacementResponse({ ...rawReplacement(), id: "bad/id" }, "card_old-1"), /new Card ID/);
});

test("rejects stale success, error and finally after reason or any selected old Card version field changes", () => {
  const scope = '["actor","tenant","customer","TEST"]';
  const oldCard = selectedCard({ availableBalanceMinor: "0" });
  const request = {
    requestId: 7,
    scopeKey: scope,
    reason: "STOLEN" as const,
    oldCardVersion: captureCardReplacementVersion(oldCard),
  };
  assert.equal(cardReplacementRequestIsCurrent(request, 7, scope, "STOLEN", oldCard), true);
  assert.equal(cardReplacementRequestIsCurrent(request, 8, scope, "STOLEN", oldCard), false);
  assert.equal(cardReplacementRequestIsCurrent(request, 7, scope, "LOST", oldCard), false);
  assert.equal(cardReplacementRequestIsCurrent(request, 7, '["other","tenant","customer","TEST"]', "STOLEN", oldCard), false);
  assert.equal(cardReplacementRequestIsCurrent(request, 7, '["actor","other","customer","TEST"]', "STOLEN", oldCard), false);
  assert.equal(cardReplacementRequestIsCurrent(request, 7, '["actor","tenant","other","TEST"]', "STOLEN", oldCard), false);
  assert.equal(cardReplacementRequestIsCurrent(request, 7, '["actor","tenant","customer","SANDBOX"]', "STOLEN", oldCard), false);
  assert.equal(cardReplacementRequestIsCurrent(request, 7, scope, "STOLEN", null), false);

  const changedCards: CardRecord[] = [
    selectedCard({ ...oldCard, id: "card_other" }),
    selectedCard({ ...oldCard, type: "PHYSICAL" }),
    selectedCard({ ...oldCard, status: "FROZEN" }),
    selectedCard({ ...oldCard, last4: "9999" }),
    selectedCard({ ...oldCard, expiryMonth: 11 }),
    selectedCard({ ...oldCard, expiryYear: 2031 }),
    selectedCard({ ...oldCard, currency: "EUR" }),
    selectedCard({ ...oldCard, alias: "Changed" }),
    selectedCard({ ...oldCard, availableBalanceMinor: "1" }),
    selectedCard({ ...oldCard, createdAt: "2026-07-31T00:00:01.000Z" }),
    selectedCard({ ...oldCard, capabilities: { ...oldCard.capabilities, freeze: false } }),
    selectedCard({ ...oldCard, capabilities: { ...oldCard.capabilities, unfreeze: true } }),
    selectedCard({ ...oldCard, capabilities: { ...oldCard.capabilities, replace: false } }),
    selectedCard({ ...oldCard, capabilities: { ...oldCard.capabilities, renew: false } }),
    selectedCard({ ...oldCard, capabilities: { ...oldCard.capabilities, updateLimits: false } }),
  ];
  for (const changed of changedCards) {
    assert.equal(cardReplacementVersionMatches(request.oldCardVersion, changed), false);
    assert.equal(cardReplacementRequestIsCurrent(request, 7, scope, "STOLEN", changed), false);
  }

  const missingBalance = selectedCard();
  assert.equal(cardReplacementRequestIsCurrent(request, 7, scope, "STOLEN", missingBalance), false);
  const presentUndefined = selectedCard();
  Object.defineProperty(presentUndefined, "availableBalanceMinor", { value: undefined, enumerable: true });
  const absentVersion = captureCardReplacementVersion(selectedCard());
  assert.equal(cardReplacementVersionMatches(absentVersion, presentUndefined), false);
});
