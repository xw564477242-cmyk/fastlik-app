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
