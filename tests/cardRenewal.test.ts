import assert from "node:assert/strict";
import test from "node:test";
import {
  cardRenewalDecision,
  cardRenewalPath,
  cardRenewalRequestIsCurrent,
  parseCardRenewalResponse,
  validateCardRenewalIdempotencyKey,
} from "../src/cardRenewal.ts";
import type { CardRecord } from "../src/cardList.ts";

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
  createdAt: "2026-07-31T12:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerPublicToken: "provider-private",
  pan: "4111111111111111",
  tenantId: "tenant-private",
  customerId: "customer-private",
  environment: "TEST",
  ...overrides,
});

test("shows and executes renewal only for a renewable selected Card in matching SANDBOX or TEST", () => {
  const card = selectedCard();
  for (const environment of ["SANDBOX", "TEST"] as const)
    assert.equal(cardRenewalDecision(card, environment, environment, "scope", "scope", card.id).allowed, true);
  for (const environment of ["LOCAL", "UAT", "PRODUCTION"] as const)
    assert.equal(cardRenewalDecision(card, environment, environment, "scope", "scope", card.id).allowed, false);
  assert.equal(cardRenewalDecision(card, "SANDBOX", "TEST", "scope", "scope", card.id).allowed, false);
  assert.equal(cardRenewalDecision(card, null, "TEST", "scope", "scope", card.id).allowed, false);
  assert.equal(cardRenewalDecision(card, "TEST", "TEST", "old", "new", card.id).allowed, false);
  assert.equal(cardRenewalDecision(card, "TEST", "TEST", "scope", "scope", "card_other").allowed, false);
  assert.equal(cardRenewalDecision(
    selectedCard({ capabilities: { ...card.capabilities, renew: false } }),
    "TEST", "TEST", "scope", "scope", card.id,
  ).allowed, false);
  assert.equal(cardRenewalDecision(selectedCard({ expiryMonth: null }), "TEST", "TEST", "scope", "scope", card.id).allowed, false);
  assert.equal(cardRenewalDecision(selectedCard({ expiryYear: null }), "TEST", "TEST", "scope", "scope", card.id).allowed, false);
});

test("uses the existing endpoint and accepts only a canonical lowercase RFC4122 UUIDv4", () => {
  assert.equal(cardRenewalPath("card_renew-1"), "/v1/cards/card_renew-1/renew");
  assert.equal(cardRenewalPath("card.renew:1"), "/v1/cards/card.renew%3A1/renew");
  assert.throws(() => cardRenewalPath("bad/id"), /Card ID/);
  const key = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(validateCardRenewalIdempotencyKey(key), key);
  for (const invalid of [
    "123e4567-e89b-12d3-a456-426614174000",
    "123E4567-E89B-42D3-A456-426614174000",
    "short",
    "123e4567-e89b-42d3-7456-426614174000",
  ]) assert.throws(() => validateCardRenewalIdempotencyKey(invalid), /idempotency key/);
});

test("reconstructs only the public Card allowlist and requires the selected Card identity", () => {
  const renewed = parseCardRenewalResponse(rawRenewal(), selectedCard());
  assert.deepEqual(Object.keys(renewed).sort(), [
    "alias", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  assert.equal(renewed.id, "card_renew-1");
  for (const forbidden of ["providerPublicToken", "pan", "token", "tenantId", "customerId", "environment", "internalError"])
    assert.equal(forbidden in renewed, false);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ id: "card_other" }), selectedCard()), /identity/);
});

test("requires expiry year and month to advance strictly, including across a year boundary", () => {
  const current = selectedCard();
  assert.equal(parseCardRenewalResponse(rawRenewal({ expiryMonth: 1, expiryYear: 2031 }), current).expiryMonth, 1);
  for (const expiry of [
    { expiryMonth: 12, expiryYear: 2030 },
    { expiryMonth: 11, expiryYear: 2030 },
    { expiryMonth: 12, expiryYear: 2029 },
  ]) assert.throws(() => parseCardRenewalResponse(rawRenewal(expiry), current), /expiry did not advance/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ expiryMonth: null }), current), /expiryMonth/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ expiryYear: null }), current), /expiryYear/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal(), selectedCard({ expiryMonth: null })), /current expiry/);
});

test("requires ordinary response objects and required own data fields with zero getter executions", () => {
  assert.throws(() => parseCardRenewalResponse(Object.create(rawRenewal()), selectedCard()), /response/);
  assert.throws(() => parseCardRenewalResponse(Object.assign(Object.create(null), rawRenewal()), selectedCard()), /response/);
  class ProviderResponse { constructor() { Object.assign(this, rawRenewal()); } }
  assert.throws(() => parseCardRenewalResponse(new ProviderResponse(), selectedCard()), /response/);

  const missing = rawRenewal();
  delete missing.id;
  assert.throws(() => parseCardRenewalResponse(missing, selectedCard()), /Card ID/);
  let getterCalls = 0;
  const accessor = rawRenewal();
  Object.defineProperty(accessor, "id", { configurable: true, get: () => { getterCalls += 1; return "card_renew-1"; } });
  assert.throws(() => parseCardRenewalResponse(accessor, selectedCard()), /Card ID/);
  assert.equal(getterCalls, 0);
});

test("never reflects or reads unknown Provider, PAN, token, scope or error accessors", () => {
  let getterCalls = 0;
  const response = rawRenewal();
  for (const key of ["providerPublicToken", "maskedPan", "pan", "token", "tenantId", "customerId", "environment", "internalError"])
    Object.defineProperty(response, key, {
      configurable: true,
      get: () => { getterCalls += 1; throw new Error(`Unknown ${key} was read`); },
    });
  assert.equal(parseCardRenewalResponse(response, selectedCard()).id, "card_renew-1");
  assert.equal(getterCalls, 0);
});

test("rejects capabilities accessors and non-ordinary capability objects with zero getter executions", () => {
  let getterCalls = 0;
  const responseAccessor = rawRenewal();
  Object.defineProperty(responseAccessor, "capabilities", {
    configurable: true,
    get: () => { getterCalls += 1; return {}; },
  });
  assert.throws(() => parseCardRenewalResponse(responseAccessor, selectedCard()), /capabilities/);
  assert.equal(getterCalls, 0);

  const capabilityAccessor = rawRenewal();
  const capabilities = capabilityAccessor.capabilities as Record<string, unknown>;
  Object.defineProperty(capabilities, "renew", {
    configurable: true,
    get: () => { getterCalls += 1; return true; },
  });
  assert.throws(() => parseCardRenewalResponse(capabilityAccessor, selectedCard()), /capability renew/);
  assert.equal(getterCalls, 0);

  class ProviderCapabilities {
    freeze = true; unfreeze = false; replace = true; renew = true; updateLimits = true;
  }
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ capabilities: new ProviderCapabilities() }), selectedCard()), /capabilities/);
});

test("strictly validates status, timestamp and canonical signed-64 optional balance", () => {
  for (const status of ["PENDING", "ACTIVE", "FROZEN", "CLOSED", "FAILED"])
    assert.equal(parseCardRenewalResponse(rawRenewal({ status }), selectedCard()).status, status);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ status: "RENEWED" }), selectedCard()), /status/);
  assert.throws(() => parseCardRenewalResponse(rawRenewal({ createdAt: "2026-02-30T00:00:00Z" }), selectedCard()), /createdAt/);
  for (const availableBalanceMinor of ["0", "1", "-1", "9223372036854775807", "-9223372036854775808"])
    assert.equal(parseCardRenewalResponse(rawRenewal({ availableBalanceMinor }), selectedCard()).availableBalanceMinor, availableBalanceMinor);
  for (const availableBalanceMinor of ["-0", "00", "01", "-01", "+1", "9223372036854775808", "-9223372036854775809"])
    assert.throws(() => parseCardRenewalResponse(rawRenewal({ availableBalanceMinor }), selectedCard()), /balance/);
  for (const key of ["freeze", "unfreeze", "replace", "renew", "updateLimits"] as const)
    assert.throws(() => parseCardRenewalResponse(rawRenewal({ capabilities: { ...(rawRenewal().capabilities as object), [key]: 1 } }), selectedCard()), /capability/);
});

test("rejects success, error and finally writes after scope, generation or selected Card changes", () => {
  const scope = '["actor","tenant","customer","TEST"]';
  const request = { requestId: 7, scopeKey: scope, cardId: "card_renew-1" };
  assert.equal(cardRenewalRequestIsCurrent(request, 7, scope, "card_renew-1"), true);
  assert.equal(cardRenewalRequestIsCurrent(request, 8, scope, "card_renew-1"), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, '["other","tenant","customer","TEST"]', "card_renew-1"), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, '["actor","other","customer","TEST"]', "card_renew-1"), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, '["actor","tenant","other","TEST"]', "card_renew-1"), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, '["actor","tenant","customer","SANDBOX"]', "card_renew-1"), false);
  assert.equal(cardRenewalRequestIsCurrent(request, 7, scope, "card_other"), false);
});
