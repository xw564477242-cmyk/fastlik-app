import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_REPLACEMENT_REASONS,
  beginCardReplacement,
  captureCardReplacementVersion,
  cardReplacementDecision,
  cardReplacementPath,
  cardReplacementRequestIsCurrent,
  cardReplacementSessionScope,
  cardReplacementVersionMatches,
  createCardReplacementCommit,
  createCardReplacementRequestIdentity,
  parseCardReplacementInput,
  parseCardReplacementResponse,
  replaceCardInCollection,
  settleCardReplacement,
  submitCardReplacement,
  validateCardReplacementIdempotencyKey,
  type CardReplacementSession,
} from "../src/cardReplacement.ts";
import type { CardRecord } from "../src/cardList.ts";

const now = Date.parse("2026-08-01T00:00:00Z");
const idempotencyKey = "123e4567-e89b-42d3-a456-426614174000";
const replacementSession = (overrides: Partial<CardReplacementSession> = {}): CardReplacementSession => ({
  actorId: "actor-replacement",
  tenantId: "tenant-replacement",
  customerId: "customer-replacement",
  environment: "SANDBOX",
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

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
  for (const environment of ["SANDBOX", "TEST"] as const) {
    const activeSession = replacementSession({ environment });
    const scope = cardReplacementSessionScope(activeSession, environment, now);
    assert.equal(cardReplacementDecision(card, activeSession, environment, scope, card.id, now).allowed, true);
  }
  for (const environment of ["LOCAL", "UAT", "PRODUCTION"] as const)
    assert.equal(cardReplacementDecision(card, replacementSession({ environment }), environment, "scope", card.id, now).allowed, false);
  assert.equal(cardReplacementDecision(card, replacementSession(), "TEST", "scope", card.id, now).allowed, false);
  assert.equal(cardReplacementDecision(card, null, "TEST", "scope", card.id, now).allowed, false);
  const testSession = replacementSession({ environment: "TEST" });
  const testScope = cardReplacementSessionScope(testSession, "TEST", now);
  assert.equal(cardReplacementDecision(card, testSession, "TEST", "wrong", card.id, now).allowed, false);
  assert.equal(cardReplacementDecision(card, testSession, "TEST", testScope, "card_other", now).allowed, false);
  assert.equal(cardReplacementDecision(card, replacementSession({ expiresAt: "2026-08-01T00:00:00Z" }), "SANDBOX", "scope", card.id, now).allowed, false);
  assert.equal(cardReplacementDecision(
    selectedCard({ capabilities: { ...card.capabilities, replace: false } }),
    testSession,
    "TEST",
    testScope,
    card.id,
    now,
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
  assert.equal(validateCardReplacementIdempotencyKey(idempotencyKey), idempotencyKey);
  for (const invalid of [
    "123e4567-e89b-12d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000",
    "short",
    "123e4567-e89b-42d3-7456-426614174000",
  ])
    assert.throws(() => validateCardReplacementIdempotencyKey(invalid), /idempotency key/);
});

test("synchronously gates double click and creates a fully bound request identity", () => {
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginCardReplacement(gate, 1), true);
  assert.equal(beginCardReplacement(gate, 2), false);
  assert.equal(settleCardReplacement(gate, 2), false);
  assert.equal(settleCardReplacement(gate, 1), true);
  const scope = cardReplacementSessionScope(replacementSession(), "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const request = createCardReplacementRequestIdentity(1, scope, "LOST", selectedCard(), idempotencyKey);
  assert.equal(request.scopeKey, scope);
  assert.equal(request.reason, "LOST");
  assert.equal(request.idempotencyKey, idempotencyKey);
  assert.throws(() => createCardReplacementRequestIdentity(2, scope, "DESTROYED" as never, selectedCard(), idempotencyKey), /reason/);
});

test("one accepted action emits one exact POST, never retries, and invalid sessions fail before transport", async () => {
  const activeSession = replacementSession();
  const scope = cardReplacementSessionScope(activeSession, "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const calls: unknown[] = [];
  const replacement = await submitCardReplacement(
    async request => { calls.push(request); return rawReplacement(); },
    activeSession, "SANDBOX", scope, selectedCard().id, selectedCard(), { reason: "STOLEN" }, idempotencyKey, now,
  );
  assert.deepEqual(calls, [{
    path: "/v1/cards/card_old-1/replace",
    method: "POST",
    body: { reason: "STOLEN" },
    idempotencyKey,
  }]);
  assert.equal(replacement.id, "card_new-1");

  let deniedCalls = 0;
  for (const [candidate, runtime, candidateScope] of [
    [replacementSession({ environment: "UAT" }), "UAT", "scope"],
    [replacementSession({ environment: "PRODUCTION" }), "PRODUCTION", "scope"],
    [replacementSession({ environment: "LOCAL" }), "LOCAL", "scope"],
    [replacementSession({ environment: "LOCAL" }), "UNKNOWN" as never, "scope"],
    [replacementSession({ expiresAt: "2026-08-01T00:00:00Z" }), "SANDBOX", scope],
    [activeSession, "SANDBOX", "wrong"],
  ] as const) await assert.rejects(() => submitCardReplacement(
    async () => { deniedCalls += 1; return rawReplacement(); },
    candidate,
    runtime,
    candidateScope,
    selectedCard().id,
    selectedCard(),
    { reason: "LOST" },
    idempotencyKey,
    now,
  ));
  assert.equal(deniedCalls, 0);
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
  const commit = createCardReplacementCommit(current, oldCard, captureCardReplacementVersion(oldCard), replacement);
  assert.equal(commit.selectedCard, replacement);
  assert.deepEqual(commit.cards.map((card) => card.id), [replacement.id, otherCard.id]);
  assert.throws(
    () => replaceCardInCollection(current, oldCard.id, selectedCard({ id: otherCard.id })),
    /collides/,
  );
  assert.throws(() => replaceCardInCollection([otherCard], oldCard.id, replacement), /unavailable or duplicated/);
  assert.throws(() => replaceCardInCollection([oldCard, oldCard], oldCard.id, replacement), /unavailable or duplicated/);
  assert.throws(
    () => createCardReplacementCommit(current, selectedCard({ alias: "Changed" }), captureCardReplacementVersion(oldCard), replacement),
    /version changed/,
  );
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
  for (const alias of [" padded", "line\nbreak", "x".repeat(121)])
    assert.throws(() => parseCardReplacementResponse({ ...rawReplacement(), alias }, "card_old-1"), /alias/);
});

test("rejects stale success, error and finally after reason or any selected old Card version field changes", () => {
  const activeSession = replacementSession({ environment: "TEST" });
  const scope = cardReplacementSessionScope(activeSession, "TEST", now);
  if (!scope) throw new Error("scope required");
  const oldCard = selectedCard({ availableBalanceMinor: "0" });
  const request = createCardReplacementRequestIdentity(7, scope, "STOLEN", oldCard, idempotencyKey);
  const current = (overrides: Partial<{
    requestId: number;
    session: CardReplacementSession;
    runtime: "SANDBOX" | "TEST" | "PRODUCTION";
    scope: string | null;
    reason: "LOST" | "STOLEN" | "DAMAGED" | "OTHER";
    card: CardRecord | null;
  }> = {}) => cardReplacementRequestIsCurrent(
    request,
    overrides.requestId ?? 7,
    overrides.session ?? activeSession,
    overrides.runtime ?? "TEST",
    overrides.scope === undefined ? scope : overrides.scope,
    overrides.reason ?? "STOLEN",
    overrides.card === undefined ? oldCard : overrides.card,
    now,
  );
  assert.equal(current(), true);
  assert.equal(current({ requestId: 8 }), false);
  assert.equal(current({ reason: "LOST" }), false);
  assert.equal(current({ session: replacementSession({ environment: "TEST", actorId: "other" }) }), false);
  assert.equal(current({ session: replacementSession({ environment: "TEST", tenantId: "other" }) }), false);
  assert.equal(current({ session: replacementSession({ environment: "TEST", customerId: "other" }) }), false);
  assert.equal(current({ session: replacementSession({ environment: "TEST", expiresAt: "2026-08-01T00:00:00Z" }) }), false);
  assert.equal(current({ runtime: "PRODUCTION" }), false);
  assert.equal(current({ card: null }), false);

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
    assert.equal(current({ card: changed }), false);
  }

  const missingBalance = selectedCard();
  assert.equal(current({ card: missingBalance }), false);
  const presentUndefined = selectedCard();
  Object.defineProperty(presentUndefined, "availableBalanceMinor", { value: undefined, enumerable: true });
  const absentVersion = captureCardReplacementVersion(selectedCard());
  assert.equal(cardReplacementVersionMatches(absentVersion, presentUndefined), false);
});
