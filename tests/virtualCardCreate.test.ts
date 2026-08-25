import assert from "node:assert/strict";
import test from "node:test";
import {
  beginVirtualCardCreate,
  captureVirtualCardGeneration,
  createVirtualCardCreateRequestIdentity,
  parseVirtualCardCreateInput,
  parseVirtualCardCreateResponse,
  settleVirtualCardCreate,
  submitVirtualCardCreate,
  validateVirtualCardIdempotencyKey,
  virtualCardCreateDecision,
  virtualCardCreatePath,
  virtualCardCreateRequestIsCurrent,
  virtualCardCreateSessionScope,
  type VirtualCardCreateSession,
} from "../src/virtualCardCreate.ts";
import type { CardRecord } from "../src/cardList.ts";

const now = Date.parse("2026-08-01T00:00:00Z");
const key = "123e4567-e89b-42d3-a456-426614174000";

const session = (overrides: Partial<VirtualCardCreateSession> = {}): VirtualCardCreateSession => ({
  actorId: "actor-create",
  tenantId: "tenant-create",
  customerId: "customer-create",
  environment: "TEST",
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const existingCard = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card_existing-1",
  type: "PHYSICAL",
  status: "ACTIVE",
  last4: "1111",
  expiryMonth: 1,
  expiryYear: 2030,
  currency: "USD",
  alias: "Existing",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const rawCreatedCard = (): Record<string, unknown> => ({
  id: "card_created-1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currencyId: "flp_asset_usd",
  currency: "USD",
  alias: "Daily",
  createdAt: "2026-07-31T01:02:03.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerPublicToken: "must-not-leak",
  maskedPan: "************4242",
  tenantId: "tenant-private",
  customerId: "customer-private",
});

const cardInput = { currencyId: "flp_asset_usd", alias: "Daily" } as const;

test("allows virtual card creation only for matching SANDBOX or TEST session and runtime", () => {
  assert.equal(virtualCardCreateDecision("SANDBOX", "SANDBOX").allowed, true);
  assert.equal(virtualCardCreateDecision("TEST", "TEST").allowed, true);
  assert.equal(virtualCardCreateDecision("PRODUCTION", "PRODUCTION").allowed, false);
  assert.equal(virtualCardCreateDecision("UAT", "UAT").allowed, false);
  assert.equal(virtualCardCreateDecision("SANDBOX", "TEST").allowed, false);
  assert.equal(virtualCardCreateDecision(null, "TEST").allowed, false);
});

test("constructs only the strict public virtual card request fields", () => {
  assert.deepEqual(parseVirtualCardCreateInput(cardInput), cardInput);
  assert.deepEqual(parseVirtualCardCreateInput({ currencyId: "flp_asset_eur", alias: "" }), { currencyId: "flp_asset_eur" });
  assert.throws(() => parseVirtualCardCreateInput({ currencyId: " usd" }), /currencyId/);
  assert.throws(() => parseVirtualCardCreateInput({ currencyId: "bad/id" }), /currencyId/);
  assert.throws(() => parseVirtualCardCreateInput({ currencyId: "flp_asset_usd", alias: " x" }), /alias/);
  assert.throws(() => parseVirtualCardCreateInput({ currencyId: "flp_asset_usd", alias: "x".repeat(31) }), /alias/);
  assert.throws(() => parseVirtualCardCreateInput({ currencyId: "flp_asset_usd", alias: "bad\nvalue" }), /alias/);
});

test("uses the existing virtual-card route and validates one caller-provided idempotency key", () => {
  assert.equal(virtualCardCreatePath(), "/v1/cards/virtual");
  assert.equal(validateVirtualCardIdempotencyKey(key), key);
  assert.throws(() => validateVirtualCardIdempotencyKey("123e4567-e89b-12d3-a456-426614174000"), /idempotency key/);
  assert.throws(() => validateVirtualCardIdempotencyKey("short"), /idempotency key/);
  assert.throws(() => validateVirtualCardIdempotencyKey("bad/key-value"), /idempotency key/);
});

test("reconstructs only the public Card response DTO", () => {
  const card = parseVirtualCardCreateResponse(rawCreatedCard(), cardInput);
  assert.deepEqual(Object.keys(card).sort(), [
    "alias", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  for (const forbidden of ["providerPublicToken", "maskedPan", "tenantId", "customerId"])
    assert.equal(forbidden in card, false);
});

test("accepts the shared opaque Card ID grammar", () => {
  const card = parseVirtualCardCreateResponse(
    { ...rawCreatedCard(), id: "card.created:1" },
    cardInput,
  );
  assert.equal(card.id, "card.created:1");
});

test("requires ordinary JSON objects and own data properties without executing accessors", () => {
  assert.throws(
    () => parseVirtualCardCreateResponse(Object.create(rawCreatedCard()), cardInput),
    /response/,
  );
  const nullPrototype = Object.assign(Object.create(null), rawCreatedCard());
  assert.throws(
    () => parseVirtualCardCreateResponse(nullPrototype, cardInput),
    /response/,
  );
  class ProviderCard {
    constructor() {
      Object.assign(this, rawCreatedCard());
    }
  }
  assert.throws(
    () => parseVirtualCardCreateResponse(new ProviderCard(), cardInput),
    /response/,
  );

  const missingId = rawCreatedCard();
  delete missingId.id;
  assert.throws(
    () => parseVirtualCardCreateResponse(missingId, cardInput),
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
    () => parseVirtualCardCreateResponse(accessorId, cardInput),
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
  const card = parseVirtualCardCreateResponse(response, cardInput);
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
    () => parseVirtualCardCreateResponse(capabilitiesAccessor, cardInput),
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
    () => parseVirtualCardCreateResponse(capabilityFieldAccessor, cardInput),
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
      cardInput,
    ),
    /capabilities/,
  );
});

test("accepts only canonical signed-64 available balances", () => {
  for (const availableBalanceMinor of ["0", "1", "-1", "9223372036854775807", "-9223372036854775808"])
    assert.equal(
      parseVirtualCardCreateResponse(
        { ...rawCreatedCard(), availableBalanceMinor },
        cardInput,
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
        cardInput,
      ),
      /balance/,
    );
});

test("requires the created response to match the virtual-card request", () => {
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), id: "bad/id" }, cardInput), /card id/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), type: "PHYSICAL" }, cardInput), /not virtual/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), currencyId: "flp_asset_eur" }, cardInput), /currencyId/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), currency: "ZZZ" }, cardInput), /currency/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), alias: "Other" }, cardInput), /alias/);
  assert.throws(() => parseVirtualCardCreateResponse({ ...rawCreatedCard(), createdAt: "2026-02-30T00:00:00Z" }, cardInput), /createdAt/);
});

test("requires one unexpired exact actor, tenant, customer and environment scope", () => {
  const activeSession = session();
  const scope = virtualCardCreateSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  assert.equal(virtualCardCreateSessionScope(session({ actorId: "" }), "TEST", now), null);
  assert.equal(virtualCardCreateSessionScope(session({ customerId: "other" }), "TEST", now), JSON.stringify([
    "actor-create", "tenant-create", "other", "TEST", "2026-08-01T01:00:00Z",
  ]));
  assert.equal(virtualCardCreateSessionScope(session({ expiresAt: "2026-08-01T00:00:00Z" }), "TEST", now), null);
  assert.equal(virtualCardCreateSessionScope(session({ environment: "SANDBOX" }), "TEST", now), null);
  assert.equal(virtualCardCreateSessionScope(session({ environment: "PRODUCTION" }), "PRODUCTION", now), null);
});

test("one accepted action owns one caller-cancelled POST and rejects pretransport mismatch", async () => {
  const activeSession = session();
  const scope = virtualCardCreateSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  const controller = new AbortController();
  const calls: unknown[] = [];
  const created = await submitVirtualCardCreate(
    async request => { calls.push(request); return rawCreatedCard(); },
    activeSession,
    "TEST",
    scope,
    cardInput,
    key,
    now,
    controller.signal,
  );
  assert.equal(created.id, "card_created-1");
  assert.deepEqual(calls, [{
    path: "/v1/cards/virtual",
    method: "POST",
    body: cardInput,
    idempotencyKey: key,
    signal: controller.signal,
  }]);
  await assert.rejects(() => submitVirtualCardCreate(
    async () => { calls.push("unexpected"); return rawCreatedCard(); },
    session({ expiresAt: "2026-08-01T00:00:00Z" }),
    "TEST",
    scope,
    cardInput,
    key,
    now,
  ));
  assert.equal(calls.length, 1);
});

test("submit gate and exact input, session, list, selection and mounted generations reject stale writes", () => {
  const activeSession = session();
  const scope = virtualCardCreateSessionScope(activeSession, "TEST", now);
  assert.ok(scope);
  const cards = [existingCard()];
  const selected = cards[0];
  const input = cardInput;
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginVirtualCardCreate(gate, 7), true);
  assert.equal(beginVirtualCardCreate(gate, 8), false);
  assert.equal(settleVirtualCardCreate(gate, 8), false);
  assert.equal(settleVirtualCardCreate(gate, 7), true);
  const request = createVirtualCardCreateRequestIdentity(7, scope, input, cards, "next", selected, key);
  const current = (
    requestId = 7,
    currentSession: VirtualCardCreateSession | null = activeSession,
    currentScope: string | null = scope,
    currentInput = input,
    currentCards: readonly CardRecord[] = cards,
    nextCursor: string | null = "next",
    currentSelected: CardRecord | null = selected,
    mounted = true,
  ) => virtualCardCreateRequestIsCurrent(
    request, requestId, currentSession, "TEST", currentScope, currentInput,
    currentCards, nextCursor, currentSelected, mounted, now,
  );
  assert.equal(current(), true);
  assert.equal(current(8), false);
  assert.equal(current(7, session({ tenantId: "other" })), false);
  assert.equal(current(7, activeSession, `${scope}-old`), false);
  assert.equal(current(7, activeSession, scope, { currencyId: "flp_asset_eur", alias: "Daily" }), false);
  assert.equal(current(7, activeSession, scope, input, [existingCard({ alias: "changed" })]), false);
  assert.equal(current(7, activeSession, scope, input, cards, null), false);
  assert.equal(current(7, activeSession, scope, input, cards, "next", null), false);
  assert.equal(current(7, activeSession, scope, input, cards, "next", selected, false), false);
  assert.equal(captureVirtualCardGeneration(cards, "next", selected), request.cardGeneration);
});
