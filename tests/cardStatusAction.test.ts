import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  beginCardStatusAction,
  cardStatusDecision,
  cardStatusRequestIsCurrent,
  cardStatusSessionScope,
  createCardStatusRequestIdentity,
  settleCardStatusAction,
  submitCardStatusAction,
  validateCardStatusIdempotencyKey,
  type CardStatusSession,
} from "../src/cardStatusAction.ts";

const now = Date.parse("2026-08-01T00:00:00Z");
const keyA = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const keyB = "b8888888-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const session = (overrides: Partial<CardStatusSession> = {}): CardStatusSession => ({
  actorId: "actor-a",
  tenantId: "tenant-a",
  customerId: "customer-a",
  environment: "SANDBOX",
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

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

const response = (operation: "freeze" | "unfreeze", overrides: Record<string, unknown> = {}) => ({
  id: "card:owned.1",
  type: "VIRTUAL",
  status: operation === "freeze" ? "FROZEN" : "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Primary",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: {
    freeze: operation === "unfreeze",
    unfreeze: operation === "freeze",
    replace: true,
    renew: true,
    updateLimits: true,
  },
  providerOperationRef: "internal-never-exposed",
  ...overrides,
});

test("permits only an unexpired exact SANDBOX or TEST session, selection, status and capability", () => {
  const sandboxScope = cardStatusSessionScope(session(), "SANDBOX", now);
  assert.ok(sandboxScope);
  assert.deepEqual(cardStatusDecision(card(), session(), "SANDBOX", sandboxScope, card().id, now), {
    operation: "freeze", label: "Freeze", allowed: true, reason: null, scopeKey: sandboxScope,
  });
  const testSession = session({ environment: "TEST" });
  const testScope = cardStatusSessionScope(testSession, "TEST", now);
  assert.equal(cardStatusDecision(card({ status: "FROZEN", capabilities: { ...card().capabilities, freeze: false, unfreeze: true } }), testSession, "TEST", testScope, card().id, now).operation, "unfreeze");
  for (const environment of ["LOCAL", "UAT", "PRODUCTION"] as const)
    assert.equal(cardStatusSessionScope(session({ environment }), environment, now), null);
  assert.equal(cardStatusSessionScope(session({ environment: "SANDBOX" }), "TEST", now), null);
  assert.equal(cardStatusSessionScope(session({ expiresAt: "2026-08-01T00:00:00Z" }), "SANDBOX", now), null);
  assert.equal(cardStatusSessionScope(session({ expiresAt: "not-a-date" }), "SANDBOX", now), null);
  assert.equal(cardStatusDecision(card(), session(), "SANDBOX", "wrong", card().id, now).allowed, false);
  assert.equal(cardStatusDecision(card(), session(), "SANDBOX", sandboxScope, "card:other", now).allowed, false);
  assert.equal(cardStatusDecision(card({ capabilities: { ...card().capabilities, freeze: false } }), session(), "SANDBOX", sandboxScope, card().id, now).allowed, false);
  assert.equal(cardStatusDecision(card({ status: "PENDING" }), session(), "SANDBOX", sandboxScope, card().id, now).allowed, false);
});

test("generates a canonical fresh UUIDv4 only after synchronous duplicate gating", () => {
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginCardStatusAction(gate, 1), true);
  assert.equal(beginCardStatusAction(gate, 2), false);
  assert.equal(settleCardStatusAction(gate, 2), false);
  assert.equal(settleCardStatusAction(gate, 1), true);
  assert.equal(beginCardStatusAction(gate, 2), true);
  assert.equal(validateCardStatusIdempotencyKey(keyA), keyA);
  assert.equal(validateCardStatusIdempotencyKey(keyB), keyB);
  assert.notEqual(keyA, keyB);
  for (const invalid of [keyA.toUpperCase(), "not-a-uuid", keyA.replace("-4", "-5")])
    assert.throws(() => validateCardStatusIdempotencyKey(invalid));
});

test("binds completion to generation, tenant/customer session scope, selection and full public Card version", () => {
  const scope = cardStatusSessionScope(session(), "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const selected = card();
  const request = createCardStatusRequestIdentity(7, scope, "freeze", selected, keyA);
  const current = (overrides: Partial<{
    requestId: number;
    session: CardStatusSession;
    runtime: "SANDBOX" | "TEST" | "PRODUCTION";
    scope: string | null;
    card: CardRecord | null;
  }> = {}) => cardStatusRequestIsCurrent(
    request,
    overrides.requestId ?? 7,
    overrides.session ?? session(),
    overrides.runtime ?? "SANDBOX",
    overrides.scope === undefined ? scope : overrides.scope,
    overrides.card === undefined ? selected : overrides.card,
    now,
  );
  assert.equal(current(), true);
  assert.equal(current({ requestId: 8 }), false);
  assert.equal(current({ scope: "scope-b" }), false);
  assert.equal(current({ runtime: "PRODUCTION" }), false);
  assert.equal(current({ session: session({ tenantId: "tenant-b" }) }), false);
  assert.equal(current({ session: session({ customerId: "customer-b" }) }), false);
  assert.equal(current({ session: session({ expiresAt: "2026-08-01T00:00:00Z" }) }), false);
  assert.equal(current({ card: null }), false);
  for (const changed of [
    card({ id: "card:owned.2" }),
    card({ type: "PHYSICAL" }),
    card({ status: "FROZEN" }),
    card({ last4: "1111" }),
    card({ expiryMonth: 1 }),
    card({ expiryYear: 2031 }),
    card({ currency: "EUR" }),
    card({ alias: "Changed" }),
    card({ availableBalanceMinor: "2501" }),
    card({ createdAt: "2026-01-02T00:00:00Z" }),
    card({ capabilities: { ...card().capabilities, replace: false } }),
  ]) assert.equal(current({ card: changed }), false);
});

test("one accepted freeze emits one bodyless POST and returns only same-Card public fields", async () => {
  const scope = cardStatusSessionScope(session(), "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const calls: unknown[] = [];
  const result = await submitCardStatusAction(
    async request => { calls.push(request); return response("freeze"); },
    session(), "SANDBOX", scope, card().id, card(), "freeze", keyA, now,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    path: "/v1/cards/card%3Aowned.1/freeze",
    method: "POST",
    idempotencyKey: keyA,
  });
  assert.equal("body" in (calls[0] as object), false);
  assert.deepEqual(Object.keys(result).sort(), [
    "alias", "availableBalanceMinor", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  assert.equal("providerOperationRef" in result, false);
  assert.equal(result.status, "FROZEN");
});

test("one accepted unfreeze uses the exact bodyless route and transition", async () => {
  const activeSession = session({ environment: "TEST" });
  const scope = cardStatusSessionScope(activeSession, "TEST", now);
  if (!scope) throw new Error("scope required");
  const frozen = card({
    status: "FROZEN",
    capabilities: { ...card().capabilities, freeze: false, unfreeze: true },
  });
  const calls: unknown[] = [];
  const result = await submitCardStatusAction(
    async request => { calls.push(request); return response("unfreeze"); },
    activeSession, "TEST", scope, frozen.id, frozen, "unfreeze", keyB, now,
  );
  assert.deepEqual(calls, [{
    path: "/v1/cards/card%3Aowned.1/unfreeze",
    method: "POST",
    idempotencyKey: keyB,
  }]);
  assert.equal("body" in (calls[0] as object), false);
  assert.equal(result.status, "ACTIVE");
});

test("does not execute Provider/internal getters and rejects hostile public getters or cross-Card responses", async () => {
  const scope = cardStatusSessionScope(session(), "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  let executions = 0;
  const unknown = response("freeze");
  Object.defineProperty(unknown, "providerOperationRef", { enumerable: true, get() { executions += 1; throw new Error("internal getter executed"); } });
  const safe = await submitCardStatusAction(async () => unknown, session(), "SANDBOX", scope, card().id, card(), "freeze", keyA, now);
  assert.equal(executions, 0);
  assert.equal("providerOperationRef" in safe, false);

  const required = response("freeze");
  Object.defineProperty(required, "status", { enumerable: true, get() { executions += 1; return "FROZEN"; } });
  await assert.rejects(() => submitCardStatusAction(async () => required, session(), "SANDBOX", scope, card().id, card(), "freeze", keyA, now));
  assert.equal(executions, 0);

  for (const hostile of [
    response("freeze", { id: "card:other.1" }),
    response("freeze", { status: "ACTIVE" }),
    response("freeze", { currency: "EUR" }),
    response("freeze", { availableBalanceMinor: "2501" }),
  ]) await assert.rejects(() => submitCardStatusAction(async () => hostile, session(), "SANDBOX", scope, card().id, card(), "freeze", keyA, now));
});

test("UAT, PRODUCTION, unknown, expired and mismatched scope fail before transport", async () => {
  let calls = 0;
  const transport = async () => { calls += 1; return response("freeze"); };
  for (const [candidate, runtime, scope] of [
    [session({ environment: "UAT" }), "UAT", "scope"],
    [session({ environment: "PRODUCTION" }), "PRODUCTION", "scope"],
    [session({ environment: "LOCAL" }), "UNKNOWN", "scope"],
    [session({ expiresAt: "2026-07-31T23:59:59Z" }), "SANDBOX", "scope"],
    [session(), "SANDBOX", "wrong-scope"],
  ] as const) await assert.rejects(() => submitCardStatusAction(
    transport,
    candidate,
    runtime as "SANDBOX",
    scope,
    card().id,
    card(),
    "freeze",
    keyA,
    now,
  ));
  assert.equal(calls, 0);
});
