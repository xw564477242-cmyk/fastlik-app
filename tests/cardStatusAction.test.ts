import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  beginCardStatusAction,
  cardStatusConflictIsCurrent,
  cardStatusDecision,
  cardStatusFailureIsAmbiguous,
  cardStatusFailureIsExplicit401,
  cardStatusFailureKind,
  cardStatusRequestIsCurrent,
  cardStatusRetryKey,
  cardStatusSessionScope,
  createCardStatusIdempotencyKey,
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

const response = (operation: "activate" | "freeze" | "unfreeze", overrides: Record<string, unknown> = {}) => ({
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
  const pendingCard = card({ id: "card_pending_1", status: "PENDING" });
  assert.deepEqual(cardStatusDecision(pendingCard, session(), "SANDBOX", sandboxScope, pendingCard.id, now), {
    operation: "activate", label: "Activate", allowed: true, reason: null, scopeKey: sandboxScope,
  });
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
  assert.equal(createCardStatusIdempotencyKey("activate", keyA), `activate:${keyA}`);
  assert.equal(`activate:${keyA}`.length, 45);
  assert.match(`activate:${keyA}`, /^[A-Za-z0-9._:-]{8,128}$/);
  assert.equal(validateCardStatusIdempotencyKey(`activate:${keyA}`, "activate"), `activate:${keyA}`);
  assert.throws(() => validateCardStatusIdempotencyKey(keyA, "activate"));
  assert.throws(() => validateCardStatusIdempotencyKey(`activate:${keyA}`, "freeze"));
  assert.notEqual(keyA, keyB);
  for (const invalid of [keyA.toUpperCase(), "not-a-uuid", keyA.replace("-4", "-5")])
    assert.throws(() => validateCardStatusIdempotencyKey(invalid));
});

test("binds completion to generation, tenant/customer session scope, selection and full public Card version", () => {
  const activeSession = session();
  const scope = cardStatusSessionScope(activeSession, "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const selected = card();
  const request = createCardStatusRequestIdentity(7, scope, "freeze", activeSession, selected, keyA);
  const current = (overrides: Partial<{
    requestId: number;
    session: CardStatusSession;
    runtime: "SANDBOX" | "TEST" | "PRODUCTION";
    scope: string | null;
    card: CardRecord | null;
  }> = {}) => cardStatusRequestIsCurrent(
    request,
    overrides.requestId ?? 7,
    overrides.session ?? activeSession,
    overrides.runtime ?? "SANDBOX",
    overrides.scope === undefined ? scope : overrides.scope,
    overrides.card === undefined ? selected : overrides.card,
    now,
  );
  assert.equal(current(), true);
  assert.equal(current({ session: session() }), false, "equal-valued replacement Session is stale");
  assert.equal(current({ card: card() }), false, "equal-valued replacement Card is stale");
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

  const pending = card({ id: "card_pending_1", status: "PENDING", capabilities: { ...card().capabilities, freeze: false } });
  const activation = createCardStatusRequestIdentity(8, scope, "activate", activeSession, pending, `activate:${keyA}`);
  assert.equal(cardStatusRequestIsCurrent(activation, 8, activeSession, "SANDBOX", scope, pending, now), true);
  assert.equal(cardStatusRequestIsCurrent(activation, 8, activeSession, "SANDBOX", scope, card({ status: "PENDING" }), now), false);
});

test("allows one exact same-key retry and then marks only the unchanged exact scope conflicted", () => {
  const activeSession = session();
  const selected = card();
  const scope = cardStatusSessionScope(activeSession, "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const first = createCardStatusRequestIdentity(1, scope, "freeze", activeSession, selected, keyA);
  assert.equal(cardStatusRetryKey(first, activeSession, scope, selected, "freeze"), keyA);
  assert.equal(cardStatusRetryKey(first, session(), scope, selected, "freeze"), null);
  assert.equal(cardStatusRetryKey(first, activeSession, scope, card(), "freeze"), null);
  const retry = createCardStatusRequestIdentity(2, scope, "freeze", activeSession, selected, keyA, true);
  assert.equal(cardStatusRetryKey(retry, activeSession, scope, selected, "freeze"), null);
  assert.equal(cardStatusConflictIsCurrent(retry, activeSession, scope, selected, "freeze"), true);
  assert.equal(cardStatusConflictIsCurrent(retry, activeSession, scope, card(), "freeze"), false);
});

test("classifies only transport, timeout, replay conflict and server failures as ambiguous", () => {
  assert.equal(cardStatusFailureIsAmbiguous(new TypeError("transport failed")), true);
  assert.equal(cardStatusFailureIsAmbiguous(new Error("local parse failed")), false);
  for (const status of [0, 408, 409, 500, 503, 599])
    assert.equal(cardStatusFailureIsAmbiguous({ status }), true);
  for (const status of [400, 401, 403, 404, 422, 600])
    assert.equal(cardStatusFailureIsAmbiguous({ status }), false);
  assert.equal(cardStatusFailureIsExplicit401({ status: 401 }), true);
  assert.equal(cardStatusFailureIsExplicit401({ status: 403 }), false);
  assert.equal(cardStatusFailureKind({ status: 401 }), "UNAUTHORIZED");
  assert.equal(cardStatusFailureKind({ status: 403 }), "FORBIDDEN");
  assert.equal(cardStatusFailureKind({ status: 404 }), "NOT_FOUND");
  assert.equal(cardStatusFailureKind({ status: 409 }), "CONFLICT");
  assert.equal(cardStatusFailureKind({ status: 408 }), "AMBIGUOUS");
  assert.equal(cardStatusFailureKind({ status: 503 }), "AMBIGUOUS");
  assert.equal(cardStatusFailureKind({ status: 400 }), "TERMINAL");
  const hostile = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostile, "status", { get: () => { throw new Error("getter"); } });
  assert.equal(cardStatusFailureIsAmbiguous(hostile), false);
  assert.equal(cardStatusFailureIsExplicit401(hostile), false);
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

test("one accepted activation is operation-bound, bodyless and only accepts same-Card ACTIVE", async () => {
  const activeSession = session();
  const scope = cardStatusSessionScope(activeSession, "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const pending = card({
    id: "card_owned_1",
    status: "PENDING",
    capabilities: { ...card().capabilities, freeze: false, unfreeze: false },
  });
  const activationKey = createCardStatusIdempotencyKey("activate", keyA);
  const calls: unknown[] = [];
  const result = await submitCardStatusAction(
    async request => { calls.push(request); return response("activate", { id: pending.id }); },
    activeSession, "SANDBOX", scope, pending.id, pending, "activate", activationKey, now,
  );
  assert.deepEqual(calls, [{
    path: "/v1/cards/card_owned_1/activate",
    method: "POST",
    idempotencyKey: activationKey,
  }]);
  assert.equal("body" in (calls[0] as object), false);
  assert.equal(result.id, pending.id);
  assert.equal(result.status, "ACTIVE");
  await assert.rejects(() => submitCardStatusAction(
    async () => response("activate", { id: pending.id, status: "PENDING" }),
    activeSession, "SANDBOX", scope, pending.id, pending, "activate", activationKey, now,
  ));
});

test("rejects dot and colon activation Card IDs before transport without changing freeze IDs", async () => {
  const activeSession = session();
  const scope = cardStatusSessionScope(activeSession, "SANDBOX", now);
  if (!scope) throw new Error("scope required");
  const activationKey = createCardStatusIdempotencyKey("activate", keyA);
  let activationCalls = 0;
  for (const id of ["card.pending_1", "card:pending_1"]) {
    const pending = card({
      id,
      status: "PENDING",
      capabilities: { ...card().capabilities, freeze: false, unfreeze: false },
    });
    assert.equal(cardStatusDecision(pending, activeSession, "SANDBOX", scope, id, now).allowed, false);
    await assert.rejects(() => submitCardStatusAction(
      async () => { activationCalls += 1; return response("activate", { id }); },
      activeSession,
      "SANDBOX",
      scope,
      id,
      pending,
      "activate",
      activationKey,
      now,
    ));
  }
  assert.equal(activationCalls, 0);

  let freezeCalls = 0;
  const frozen = await submitCardStatusAction(
    async request => { freezeCalls += 1; return response("freeze"); },
    activeSession,
    "SANDBOX",
    scope,
    card().id,
    card(),
    "freeze",
    keyA,
    now,
  );
  assert.equal(freezeCalls, 1);
  assert.equal(frozen.id, "card:owned.1");
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
