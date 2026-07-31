import assert from "node:assert/strict";
import test from "node:test";
import type { CardLimitsRecord } from "../src/cardLimits.ts";
import type { CardRecord } from "../src/cardList.ts";
import {
  CARD_LIMIT_UPDATE_MAX_MINOR,
  beginCardLimitsUpdate,
  cardLimitsUpdateDecision,
  cardLimitsUpdateDraft,
  cardLimitsUpdateInputFromDraft,
  cardLimitsUpdateRequestIsCurrent,
  createCardLimitsUpdateRequestIdentity,
  normalizeCardLimitsUpdateInput,
  parseCardLimitsUpdateResponse,
  settleCardLimitsUpdate,
  submitCardLimitsUpdate,
  validateCardLimitsUpdateIdempotencyKey,
} from "../src/cardLimitsUpdate.ts";

const keyA = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const keyB = "b8888888-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card:owned.1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Primary",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const limits = (overrides: Partial<CardLimitsRecord> = {}): CardLimitsRecord => ({
  cardId: "card:owned.1",
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-07-31T10:00:00Z",
  ...overrides,
});

const fullInput = {
  singleTransactionMinor: 12000,
  dailySpendMinor: 60000,
  monthlySpendMinor: 600000,
  dailyAtmMinor: 25000,
};

const response = (overrides: Record<string, unknown> = {}) => ({
  cardId: "card:owned.1",
  singleTransactionMinor: "12000",
  dailySpendMinor: "60000",
  monthlySpendMinor: "600000",
  dailyAtmMinor: "25000",
  updatedAt: "2026-07-31T14:00:00.123Z",
  providerOperationRef: "internal-never-exposed",
  ...overrides,
});

test("allows selected Card limits mutation only in exact SANDBOX or TEST scope", () => {
  for (const environment of ["SANDBOX", "TEST"] as const)
    assert.equal(
      cardLimitsUpdateDecision(card(), limits(), environment, environment, "scope-a", "scope-a", card().id).allowed,
      true,
    );
  for (const environment of ["LOCAL", "UAT", "PRODUCTION"] as const)
    assert.equal(
      cardLimitsUpdateDecision(card(), limits(), environment, environment, "scope-a", "scope-a", card().id).allowed,
      false,
    );
  assert.equal(cardLimitsUpdateDecision(card(), limits(), "SANDBOX", "TEST", "scope-a", "scope-a", card().id).allowed, false);
  assert.equal(cardLimitsUpdateDecision(card(), limits(), "SANDBOX", "SANDBOX", "scope-a", "scope-b", card().id).allowed, false);
  assert.equal(cardLimitsUpdateDecision(card(), limits(), "SANDBOX", "SANDBOX", "scope-a", "scope-a", "card:other").allowed, false);
  assert.equal(cardLimitsUpdateDecision(card({ capabilities: { ...card().capabilities, updateLimits: false } }), limits(), "SANDBOX", "SANDBOX", "scope-a", "scope-a", card().id).allowed, false);
  assert.equal(cardLimitsUpdateDecision(card({ status: "CLOSED" }), limits(), "SANDBOX", "SANDBOX", "scope-a", "scope-a", card().id).allowed, false);
});

test("accepts only the four safe non-negative integer fields and Backend consistency rules", () => {
  assert.deepEqual(normalizeCardLimitsUpdateInput(fullInput, limits()), fullInput);
  assert.deepEqual(normalizeCardLimitsUpdateInput({ dailyAtmMinor: 0 }, limits()), { dailyAtmMinor: 0 });
  assert.deepEqual(
    normalizeCardLimitsUpdateInput({ monthlySpendMinor: CARD_LIMIT_UPDATE_MAX_MINOR }, limits()),
    { monthlySpendMinor: CARD_LIMIT_UPDATE_MAX_MINOR },
  );
  for (const invalid of [
    {},
    { dailySpendMinor: -1 },
    { dailySpendMinor: 1.5 },
    { dailySpendMinor: Number.NaN },
    { dailySpendMinor: Number.POSITIVE_INFINITY },
    { dailySpendMinor: CARD_LIMIT_UPDATE_MAX_MINOR + 1 },
    { dailySpendMinor: "50000" },
    { providerLimitRef: 1 },
  ]) assert.throws(() => normalizeCardLimitsUpdateInput(invalid, limits()));
  assert.throws(() => normalizeCardLimitsUpdateInput({ singleTransactionMinor: 60000 }, limits()), /daily/);
  assert.throws(() => normalizeCardLimitsUpdateInput({ dailySpendMinor: 600000 }, limits()), /monthly/);
  assert.doesNotThrow(() => normalizeCardLimitsUpdateInput({ singleTransactionMinor: 60000, dailySpendMinor: 60000, monthlySpendMinor: 60000 }, limits()));

  let getterExecutions = 0;
  const hostile = {};
  Object.defineProperty(hostile, "dailySpendMinor", { enumerable: true, get() { getterExecutions += 1; return 50000; } });
  assert.throws(() => normalizeCardLimitsUpdateInput(hostile, limits()));
  assert.equal(getterExecutions, 0);
});

test("converts the four-field UI draft without loose numeric coercion", () => {
  assert.deepEqual(cardLimitsUpdateDraft(limits()), {
    singleTransactionMinor: "10000",
    dailySpendMinor: "50000",
    monthlySpendMinor: "500000",
    dailyAtmMinor: "20000",
  });
  assert.deepEqual(cardLimitsUpdateInputFromDraft({
    singleTransactionMinor: "12000",
    dailySpendMinor: "60000",
    monthlySpendMinor: "600000",
    dailyAtmMinor: "25000",
  }, limits()), fullInput);
  for (const dailySpendMinor of ["01", "+1", "1.0", "1e3", " 1", "9000000000001"])
    assert.throws(() => cardLimitsUpdateInputFromDraft({ ...cardLimitsUpdateDraft(limits()), dailySpendMinor }, limits()));
});

test("synchronously rejects duplicate submits and validates a fresh UUIDv4", () => {
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginCardLimitsUpdate(gate, 1), true);
  assert.equal(beginCardLimitsUpdate(gate, 2), false);
  assert.equal(settleCardLimitsUpdate(gate, 2), false);
  assert.equal(settleCardLimitsUpdate(gate, 1), true);
  assert.equal(beginCardLimitsUpdate(gate, 2), true);
  assert.equal(validateCardLimitsUpdateIdempotencyKey(keyA), keyA);
  assert.equal(validateCardLimitsUpdateIdempotencyKey(keyB), keyB);
  for (const value of [keyA.toUpperCase(), "not-a-key", crypto.randomUUID().replace(/-4/, "-5")])
    assert.throws(() => validateCardLimitsUpdateIdempotencyKey(value));
});

test("binds completion to session, environment, exact Card, limits and input versions", () => {
  const request = createCardLimitsUpdateRequestIdentity(7, "scope-a", "TEST", card(), limits(), fullInput, keyA);
  const current = (overrides: Partial<{
    requestId: number;
    scope: string | null;
    environment: "SANDBOX" | "TEST" | "PRODUCTION";
    runtime: "SANDBOX" | "TEST" | "PRODUCTION";
    card: CardRecord | null;
    limits: CardLimitsRecord | null;
    input: unknown;
  }> = {}) => cardLimitsUpdateRequestIsCurrent(
    request,
    overrides.requestId ?? 7,
    overrides.scope === undefined ? "scope-a" : overrides.scope,
    overrides.environment ?? "TEST",
    overrides.runtime ?? "TEST",
    overrides.card === undefined ? card() : overrides.card,
    overrides.limits === undefined ? limits() : overrides.limits,
    overrides.input ?? fullInput,
  );
  assert.equal(current(), true);
  assert.equal(current({ requestId: 8 }), false);
  assert.equal(current({ scope: "scope-b" }), false);
  assert.equal(current({ environment: "SANDBOX", runtime: "SANDBOX" }), false);
  assert.equal(current({ runtime: "PRODUCTION" }), false);
  assert.equal(current({ card: card({ status: "FROZEN" }) }), false);
  assert.equal(current({ limits: limits({ updatedAt: "2026-07-31T11:00:00Z" }) }), false);
  assert.equal(current({ input: { ...fullInput, dailyAtmMinor: 25001 } }), false);
  assert.equal(current({ card: null }), false);
  assert.equal(current({ limits: null }), false);
});

test("one accepted action emits one exact POST and exposes only the public limits allowlist", async () => {
  const requests: unknown[] = [];
  const updated = await submitCardLimitsUpdate(
    async request => { requests.push(request); return response(); },
    card(), limits(), fullInput, keyA, "SANDBOX", "SANDBOX", "scope-a", "scope-a", card().id,
  );
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    path: "/v1/cards/card%3Aowned.1/limits",
    method: "POST",
    body: fullInput,
    idempotencyKey: keyA,
  });
  assert.deepEqual(Object.keys(updated).sort(), [
    "cardId", "dailyAtmMinor", "dailySpendMinor", "monthlySpendMinor", "singleTransactionMinor", "updatedAt",
  ]);
  assert.equal("providerOperationRef" in updated, false);
  let internalGetterExecutions = 0;
  const hostileInternal = response();
  Object.defineProperty(hostileInternal, "providerOperationRef", {
    enumerable: true,
    get() { internalGetterExecutions += 1; throw new Error("internal getter executed"); },
  });
  const hostileResult = parseCardLimitsUpdateResponse(hostileInternal, card(), limits(), fullInput);
  assert.equal(internalGetterExecutions, 0);
  assert.equal("providerOperationRef" in hostileResult, false);
  assert.throws(() => parseCardLimitsUpdateResponse(response({ dailySpendMinor: "60001" }), card(), limits(), fullInput), /unexpected/);
  assert.throws(() => parseCardLimitsUpdateResponse(response({ updatedAt: null }), card(), limits(), fullInput), /timestamp/);

  let deniedCalls = 0;
  await assert.rejects(() => submitCardLimitsUpdate(
    async () => { deniedCalls += 1; return response(); },
    card(), limits(), fullInput, keyA, "PRODUCTION", "PRODUCTION", "scope-a", "scope-a", card().id,
  ));
  assert.equal(deniedCalls, 0);
});
