import assert from "node:assert/strict";
import test from "node:test";
import {
  parseVirtualCardCreateInput,
  parseVirtualCardCreateResponse,
  validateVirtualCardIdempotencyKey,
  virtualCardCreateDecision,
  virtualCardCreatePath,
  virtualCardCreateRequestIsCurrent,
} from "../src/virtualCardCreate.ts";

const rawCreatedCard = (): Record<string, unknown> => ({
  id: "card_created-1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Daily",
  createdAt: "2026-07-31T01:02:03.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerPublicToken: "must-not-leak",
  maskedPan: "************4242",
  tenantId: "tenant-private",
  customerId: "customer-private",
});

test("allows virtual card creation only for matching SANDBOX or TEST session and runtime", () => {
  assert.equal(virtualCardCreateDecision("SANDBOX", "SANDBOX").allowed, true);
  assert.equal(virtualCardCreateDecision("TEST", "TEST").allowed, true);
  assert.equal(virtualCardCreateDecision("PRODUCTION", "PRODUCTION").allowed, false);
  assert.equal(virtualCardCreateDecision("UAT", "UAT").allowed, false);
  assert.equal(virtualCardCreateDecision("SANDBOX", "TEST").allowed, false);
  assert.equal(virtualCardCreateDecision(null, "TEST").allowed, false);
});

test("constructs only the strict public virtual card request fields", () => {
  assert.deepEqual(parseVirtualCardCreateInput({ currency: "USD", alias: "Daily" }), { currency: "USD", alias: "Daily" });
  assert.deepEqual(parseVirtualCardCreateInput({ currency: "EUR", alias: "" }), { currency: "EUR" });
  assert.throws(() => parseVirtualCardCreateInput({ currency: "usd" }), /currency/);
  assert.throws(() => parseVirtualCardCreateInput({ currency: "ZZZ" }), /currency/);
  assert.throws(() => parseVirtualCardCreateInput({ currency: "USD", alias: " x" }), /alias/);
  assert.throws(() => parseVirtualCardCreateInput({ currency: "USD", alias: "x".repeat(31) }), /alias/);
  assert.throws(() => parseVirtualCardCreateInput({ currency: "USD", alias: "bad\nvalue" }), /alias/);
});

test("uses the existing virtual-card route and validates one caller-provided idempotency key", () => {
  assert.equal(virtualCardCreatePath(), "/v1/cards/virtual");
  const key = "123e4567-e89b-12d3-a456-426614174000";
  assert.equal(validateVirtualCardIdempotencyKey(key), key);
  assert.throws(() => validateVirtualCardIdempotencyKey("short"), /idempotency key/);
  assert.throws(() => validateVirtualCardIdempotencyKey("bad/key-value"), /idempotency key/);
});

test("reconstructs only the public Card response DTO", () => {
  const card = parseVirtualCardCreateResponse(rawCreatedCard(), { currency: "USD", alias: "Daily" });
  assert.deepEqual(Object.keys(card).sort(), [
    "alias", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  for (const forbidden of ["providerPublicToken", "maskedPan", "tenantId", "customerId"])
    assert.equal(forbidden in card, false);
});

test("accepts the shared opaque Card ID grammar", () => {
  const card = parseVirtualCardCreateResponse(
    { ...rawCreatedCard(), id: "card.created:1" },
    { currency: "USD", alias: "Daily" },
  );
  assert.equal(card.id, "card.created:1");
});

test("requires ordinary JSON objects and own data properties without executing accessors", () => {
  assert.throws(
    () => parseVirtualCardCreateResponse(Object.create(rawCreatedCard()), { currency: "USD", alias: "Daily" }),
    /response/,
  );
  const nullPrototype = Object.assign(Object.create(null), rawCreatedCard());
  assert.throws(
    () => parseVirtualCardCreateResponse(nullPrototype, { currency: "USD", alias: "Daily" }),
    /response/,
  );
  class ProviderCard {
    constructor() {
      Object.assign(this, rawCreatedCard());
    }
  }
  assert.throws(
    () => parseVirtualCardCreateResponse(new ProviderCard(), { currency: "USD", alias: "Daily" }),
    /response/,
  );

  const missingId = rawCreatedCard();
  delete missingId.id;
  assert.throws(
    () => parseVirtualCardCreateResponse(missingId, { currency: "USD", alias: "Daily" }),
    /id/,
  );

  let getterCalls = 0;
  const accessorId = rawCreatedCard();
  Object.defineProperty(accessorId, "id", {
    configurable: true,
    get: () => {
      getterCalls += 1;
      return "card-created";
    },
  });
  assert.throws(
    () => parseVirtualCardCreateResponse(accessorId, { currency: "USD", alias: "Daily" }),
    /id/,
  );
  assert.equal(getterCalls, 0);
});

test("does not reflect or read unknown provider, PAN, token, scope or environment fields", () => {
  let getterCalls = 0;
  const response = rawCreatedCard();
  for (const key of [
    "providerPublicToken",
    "pan",
    "token",
    "tenantId",
    "customerId",
    "environment",
  ])
    Object.defineProperty(response, key, {
      configurable: true,
      get: () => {
        getterCalls += 1;
        throw new Error(`Unknown field ${key} was read`);
      },
    });
  const card = parseVirtualCardCreateResponse(response, { currency: "USD", alias: "Daily" });
  assert.equal(card.id, "card_created-1");
  assert.equal(getterCalls, 0);
});

test("rejects capabilities accessors and non-ordinary capability objects without executing getters", () => {
  let getterCalls = 0;
  const capabilitiesAccessor = rawCreatedCard();
  Object.defineProperty(capabilitiesAccessor, "capabilities", {
    configurable: true,
    get: () => {
      getterCalls += 1;
      return {};
    },
  });
  assert.throws(
    () => parseVirtualCardCreateResponse(capabilitiesAccessor, { currency: "USD", alias: "Daily" }),
    /capabilities/,
  );
  assert.equal(getterCalls, 0);

  const capabilityFieldAccessor = rawCreatedCard();
  const capabilities = capabilityFieldAccessor.capabilities as Record<string, unknown>;
  Object.defineProperty(capabilities, "freeze", {
    configurable: true,
    get: () => {
      getterCalls += 1;
      return true;
    },
  });
  assert.throws(
    () => parseVirtualCardCreateResponse(capabilityFieldAccessor, { currency: "USD", alias: "Daily" }),
    /capability freeze/,
  );
  assert.equal(getterCalls, 0);

  class ProviderCapabilities {
    freeze = true;
    unfreeze = false;
    replace = true;
    renew = true;
    updateLimits = true;
  }
  assert.throws(
    () => parseVirtualCardCreateResponse(
      { ...rawCreatedCard(), capabilities: new ProviderCapabilities() },
      { currency: "USD", alias: "Daily" },
    ),
    /capabilities/,
  );
});

test("accepts only canonical signed-64 available balances", () => {
  for (const availableBalanceMinor of ["0", "1", "-1", "9223372036854775807", "-9223372036854775808"])
    assert.equal(
      parseVirtualCardCreateResponse(
        { ...rawCreatedCard(), availableBalanceMinor },
        { currency: "USD", alias: "Daily" },
      ).availableBalanceMinor,
      availableBalanceMinor,
    );
  for (const availableBalanceMinor of [
    "-0",
    "00",
    "01",
    "-01",
    "+1",
    "9223372036854775808",
    "-9223372036854775809",
  ])
    assert.throws(
      () => parseVirtualCardCreateResponse(
        { ...rawCreatedCard(), availableBalanceMinor },
        { currency: "USD", alias: "Daily" },
      ),
      /balance/,
    );
});

test("requires the created response to match the virtual-card request", () => {
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), id: "bad/id" }, { currency: "USD", alias: "Daily" }), /card id/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), type: "PHYSICAL" }, { currency: "USD", alias: "Daily" }), /not virtual/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), currency: "EUR" }, { currency: "USD", alias: "Daily" }), /currency/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), alias: "Other" }, { currency: "USD", alias: "Daily" }), /alias/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), createdAt: "2026-02-30T00:00:00Z" }, { currency: "USD", alias: "Daily" }), /createdAt/);
});

test("rejects stale create success, error and finally after actor, tenant, customer, environment or generation changes", () => {
  const request = { requestId: 7, scopeKey: "actor|tenant|customer|TEST" };
  assert.equal(virtualCardCreateRequestIsCurrent(request, 7, request.scopeKey), true);
  assert.equal(virtualCardCreateRequestIsCurrent(request, 8, request.scopeKey), false);
  assert.equal(virtualCardCreateRequestIsCurrent(request, 7, "other|tenant|customer|TEST"), false);
  assert.equal(virtualCardCreateRequestIsCurrent(request, 7, "actor|other|customer|TEST"), false);
  assert.equal(virtualCardCreateRequestIsCurrent(request, 7, "actor|tenant|other|TEST"), false);
  assert.equal(virtualCardCreateRequestIsCurrent(request, 7, "actor|tenant|customer|SANDBOX"), false);
});
