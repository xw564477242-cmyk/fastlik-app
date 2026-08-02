import assert from "node:assert/strict";
import test from "node:test";
import {
  beginCardRenewal,
  cardRenewalDecision,
  cardRenewalPath,
  cardRenewalRequestIsCurrent,
  cardRenewalSessionScope,
  createCardRenewalCommit,
  createCardRenewalRequestIdentity,
  parseCardRenewalResponse,
  settleCardRenewal,
  submitCardRenewal,
  validateCardRenewalIdempotencyKey,
  type CardRenewalSession,
} from "../src/cardRenewal.ts";
import type { CardRecord } from "../src/cardList.ts";

const now = Date.parse("2026-08-01T00:00:00Z");
const key = "123e4567-e89b-42d3-a456-426614174000";

const session = (overrides: Partial<CardRenewalSession> = {}): CardRenewalSession => ({
  actorId: "actor-renew",
  tenantId: "tenant-renew",
  customerId: "customer-renew",
  environment: "TEST",
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const selectedCard = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_renew-1",
  type: "PHYSICAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Primary",
  createdAt: "2026-07-31T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const rawRenewal = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "card_renew-1",
  type: "PHYSICAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 1,
  expiryYear: 2031,
  currency: "USD",
  alias: "Primary",
  createdAt: "2026-07-31T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerPublicToken: "provider-private",
  pan: "4111111111111111",
  tenantId: "tenant-private",
  customerId: "customer-private",
  environment: "TEST",
  ...overrides,
});

test("allows renewal only for an unexpired actor/tenant/customer-scoped SANDBOX or TEST session", () => {
  const card = selectedCard();
  for (const environment of ["SANDBOX", "TEST"] as const) {
    const activeSession = session({ environment });
    const scope = cardRenewalSessionScope(activeSession, environment, now);
    assert.ok(scope);
    assert.equal(cardRenewalDecision(card, activeSession, environment, scope, card.id, now).allowed, true);
  }
  for (const environment of ["LOCAL", "UAT", "PRODUCTION"] as const) {
    const activeSession = session({ environment });
    assert.equal(cardRenewalDecision(card, activeSession, environment, null, card.id, now).allowed, false);
  }
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  assert.equal(cardRenewalDecision(card, activeSession, "SANDBOX", scope, card.id, now).allowed, false);
  assert.equal(cardRenewalDecision(card, null, "TEST", scope, card.id, now).allowed, false);
  assert.equal(cardRenewalDecision(card, session({ expiresAt: "2026-08-01T00:00:00Z" }), "TEST", scope, card.id, now).allowed, false);
  assert.equal(cardRenewalDecision(card, activeSession, "TEST", `${scope}-stale`, card.id, now).allowed, false);
  assert.equal(cardRenewalDecision(card, activeSession, "TEST", scope, "card_other", now).allowed, false);
  assert.equal(cardRenewalDecision(selectedCard({ capabilities: { ...card.capabilities, renew: false } }), activeSession, "TEST", scope, card.id, now).allowed, false);
  for (const expiryMonth of [null, 0, 13, 1.5, Number.NaN])
    assert.equal(cardRenewalDecision(selectedCard({ expiryMonth }), activeSession, "TEST", scope, card.id, now).allowed, false);
  for (const expiryYear of [null, 1999, 10000, 2030.5, Number.NaN])
    assert.equal(cardRenewalDecision(selectedCard({ expiryYear }), activeSession, "TEST", scope, card.id, now).allowed, false);
});

test("uses the existing endpoint and only a canonical lowercase RFC4122 UUIDv4", () => {
  assert.equal(cardRenewalPath("card_renew-1"), "/v1/cards/card_renew-1/renew");
  assert.equal(cardRenewalPath("card.renew:1"), "/v1/cards/card.renew%3A1/renew");
  assert.throws(() => cardRenewalPath("bad/id"), /Card ID/);
  assert.equal(validateCardRenewalIdempotencyKey(key), key);
  for (const invalid of [
    "123e4567-e89b-12d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000",
    "short",
    "123e4567-e89b-42d3-7456-426614174000",
  ]) assert.throws(() => validateCardRenewalIdempotencyKey(invalid), /idempotency key/);
});

test("one accepted submit emits exactly one bodyless POST and pretransport mismatch fails closed", async () => {
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  const calls: unknown[] = [];
  const renewed = await submitCardRenewal(
    async request => { calls.push(request); return rawRenewal(); },
    activeSession, "TEST", scope, selectedCard().id, selectedCard(), key, now,
  );
  assert.equal(renewed.expiryYear, 2031);
  assert.deepEqual(calls, [{ path: "/v1/cards/card_renew-1/renew", method: "POST", idempotencyKey: key }]);
  for (const [candidateSession, runtime, candidateScope, cardId] of [
    [session({ expiresAt: "2026-08-01T00:00:00Z" }), "TEST", scope, selectedCard().id],
    [session({ environment: "UAT" }), "UAT", null, selectedCard().id],
    [session({ environment: "PRODUCTION" }), "PRODUCTION", null, selectedCard().id],
    [session({ environment: "LOCAL" }), "LOCAL", null, selectedCard().id],
    [activeSession, "SANDBOX", scope, selectedCard().id],
    [activeSession, "TEST", scope, "card_other"],
  ] as const) await assert.rejects(() => submitCardRenewal(
    async () => { calls.push("unexpected"); return rawRenewal(); },
    candidateSession, runtime, candidateScope, cardId, selectedCard(), key, now,
  ));
  assert.equal(calls.length, 1);
});

test("submit gate, UUID-bound request identity and atomic list/selection commit fail closed", () => {
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginCardRenewal(gate, 1), true);
  assert.equal(beginCardRenewal(gate, 2), false);
  assert.equal(settleCardRenewal(gate, 2), false);
  assert.equal(settleCardRenewal(gate, 1), true);
  const request = createCardRenewalRequestIdentity(1, scope, selectedCard(), key);
  const renewed = parseCardRenewalResponse(rawRenewal(), selectedCard());
  const other = selectedCard({ id: "card_other", last4: "1111" });
  const commit = createCardRenewalCommit([selectedCard(), other], selectedCard(), request.oldCardVersion, renewed);
  assert.deepEqual(commit.cards.map(card => card.id), [renewed.id, other.id]);
  assert.equal(commit.selectedCard, renewed);
  assert.throws(() => createCardRenewalCommit([selectedCard(), selectedCard()], selectedCard(), request.oldCardVersion, renewed), /duplicated/);
  assert.throws(() => createCardRenewalCommit([selectedCard()], selectedCard({ alias: "changed" }), request.oldCardVersion, renewed), /version changed/);
});

test("reconstructs only the public Card allowlist and enforces renewal relationships", () => {
  const renewed = parseCardRenewalResponse(rawRenewal(), selectedCard());
  assert.deepEqual(Object.keys(renewed).sort(), [
    "alias", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  for (const forbidden of ["providerPublicToken", "pan", "token", "tenantId", "customerId", "environment", "internalError"])
    assert.equal(forbidden in renewed, false);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ id: "card_other" }), selectedCard()), /identity/);
  for (const [field, value] of [
    ["type", "VIRTUAL"], ["last4", "1111"], ["currency", "EUR"], ["alias", "Other"], ["createdAt", "2026-07-31T00:00:01Z"],
  ] as const) assert.throws(() => parseCardRenewalResponse(rawRenewal({ [field]: value }), selectedCard()), /immutable/);
  for (const expiry of [
    { expiryMonth: 12, expiryYear: 2030 },
    { expiryMonth: 11, expiryYear: 2030 },
    { expiryMonth: 12, expiryYear: 2029 },
  ]) assert.throws(() => parseCardRenewalResponse(rawRenewal(expiry), selectedCard()), /expiry did not advance/);
});

test("requires ordinary own data fields and never executes hostile or unknown getters", () => {
  assert.throws(() => parseCardRenewalResponse(Object.create(rawRenewal()), selectedCard()), /response/);
  assert.throws(() => parseCardRenewalResponse(Object.assign(Object.create(null), rawRenewal()), selectedCard()), /response/);
  let getterCalls = 0;
  const accessor = rawRenewal();
  Object.defineProperty(accessor, "id", { enumerable: true, get: () => { getterCalls += 1; return "card_renew-1"; } });
  assert.throws(() => parseCardRenewalResponse(accessor, selectedCard()), /Card ID/);
  assert.equal(getterCalls, 0);
  const unknown = rawRenewal();
  for (const field of ["providerPublicToken", "pan", "token", "tenantId", "customerId", "environment", "internalError"])
    Object.defineProperty(unknown, field, { get: () => { getterCalls += 1; throw new Error("read"); } });
  assert.equal(parseCardRenewalResponse(unknown, selectedCard()).id, selectedCard().id);
  assert.equal(getterCalls, 0);
});

test("strictly validates capability data, timestamp and signed-64 optional balance", () => {
  const responseAccessor = rawRenewal();
  let getterCalls = 0;
  Object.defineProperty(responseAccessor, "capabilities", { enumerable: true, get: () => { getterCalls += 1; return {}; } });
  assert.throws(() => parseCardRenewalResponse(responseAccessor, selectedCard()), /capabilities/);
  assert.equal(getterCalls, 0);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ createdAt: "2026-02-30T00:00:00Z" }), selectedCard()), /createdAt/);
  for (const availableBalanceMinor of ["0", "1", "-1", "9223372036854775807", "-9223372036854775808"])
    assert.equal(parseCardRenewalResponse(rawRenewal({ availableBalanceMinor }), selectedCard({ availableBalanceMinor })).availableBalanceMinor, availableBalanceMinor);
  for (const availableBalanceMinor of ["-0", "00", "01", "-01", "+1", "9223372036854775808", "-9223372036854775809"])
    assert.throws(() => parseCardRenewalResponse(rawRenewal({ availableBalanceMinor }), selectedCard()), /balance/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ availableBalanceMinor: "1" }), selectedCard()), /immutable/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal(), selectedCard({ availableBalanceMinor: "1" })), /immutable/);
  for (const capability of ["freeze", "unfreeze", "replace", "renew", "updateLimits"] as const)
    assert.throws(() => parseCardRenewalResponse(rawRenewal({ capabilities: { ...(rawRenewal().capabilities as object), [capability]: 1 } }), selectedCard()), /capability/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ capabilities: { ...(rawRenewal().capabilities as object), freeze: false } }), selectedCard()), /immutable/);
});

test("session, generation, scope and every selected Card public version field invalidate late writes", () => {
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  const card = selectedCard({ availableBalanceMinor: "1" });
  const request = createCardRenewalRequestIdentity(7, scope, card, key);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, activeSession, "TEST", scope, card, now), true);
  assert.equal(cardRenewalRequestIsCurrent(request, 8, activeSession, "TEST", scope, card, now), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, session({ customerId: "other" }), "TEST", scope, card, now), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, activeSession, "TEST", `${scope}-stale`, card, now), false);
  const changes: CardRecord[] = [
    selectedCard({ availableBalanceMinor: "1", id: "card_other" }),
    selectedCard({ availableBalanceMinor: "1", type: "VIRTUAL" }),
    selectedCard({ availableBalanceMinor: "1", status: "FROZEN" }),
    selectedCard({ availableBalanceMinor: "1", last4: "1111" }),
    selectedCard({ availableBalanceMinor: "1", expiryMonth: 11 }),
    selectedCard({ availableBalanceMinor: "1", expiryYear: 2031 }),
    selectedCard({ availableBalanceMinor: "1", currency: "EUR" }),
    selectedCard({ availableBalanceMinor: "1", alias: "Other" }),
    selectedCard({ availableBalanceMinor: "2" }),
    selectedCard({ availableBalanceMinor: undefined }),
    selectedCard({ availableBalanceMinor: "1", createdAt: "2026-07-31T00:00:01Z" }),
    selectedCard({ availableBalanceMinor: "1", capabilities: { ...card.capabilities, renew: false } }),
  ];
  for (const changed of changes)
    assert.equal(cardRenewalRequestIsCurrent(request, 7, activeSession, "TEST", scope, changed, now), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, activeSession, "TEST", scope, null, now), false);
});
