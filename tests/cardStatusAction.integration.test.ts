import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  beginCardStatusAction,
  cardStatusConflictIsCurrent,
  cardStatusFailureIsAmbiguous,
  cardStatusFailureIsExplicit401,
  cardStatusRequestIsCurrent,
  cardStatusRetryKey,
  cardStatusSessionScope,
  createCardStatusRequestIdentity,
  settleCardStatusAction,
  submitCardStatusAction,
  type CardStatusSession,
} from "../src/cardStatusAction.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const now = Date.parse("2026-08-01T00:00:00Z");
const key = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const session = (overrides: Partial<CardStatusSession> = {}): CardStatusSession => ({
  actorId: "actor-mounted-01",
  tenantId: "tenant-mounted-01",
  customerId: "customer-mounted-01",
  environment: runtime,
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card:mounted.1",
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Mounted",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const frozenResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "card:mounted.1",
  type: "VIRTUAL",
  status: "FROZEN",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Mounted",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: false, unfreeze: true, replace: true, renew: true, updateLimits: true },
  providerOperationRef: "must-not-leave-parser",
  ...overrides,
});

mounted(`Card status exact mounted consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const scope = cardStatusSessionScope(session(), runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const calls: unknown[] = [];
  const result = await submitCardStatusAction(
    async request => { calls.push(request); return frozenResponse(); },
    session(), runtime, scope, card().id, card(), "freeze", key, now,
  );
  assert.deepEqual(calls, [{
    path: "/v1/cards/card%3Amounted.1/freeze",
    method: "POST",
    idempotencyKey: key,
  }]);
  assert.equal("body" in (calls[0] as object), false);
  assert.equal("providerOperationRef" in result, false);
  assert.equal(result.id, card().id);
  assert.equal(result.status, "FROZEN");
});

mounted("mounted submit gate synchronously blocks double click and never retries", async () => {
  const scope = cardStatusSessionScope(session(), runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const gate = { activeRequestId: null as number | null };
  let generation = 0;
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const click = async () => {
    const requestId = ++generation;
    if (!beginCardStatusAction(gate, requestId)) return;
    try {
      await submitCardStatusAction(
        async () => { calls += 1; return new Promise(next => { resolve = next; }); },
        session(), runtime, scope, card().id, card(), "freeze", key, now,
      );
    } finally {
      settleCardStatusAction(gate, requestId);
    }
  };
  const first = click();
  await Promise.resolve();
  const duplicate = click();
  assert.equal(calls, 1, "double click must not start a second POST");
  resolve(frozenResponse());
  await Promise.all([first, duplicate]);
  assert.equal(calls, 1, "the Card action must not retry automatically");
});

mounted("session, selection, complete Card version and unmount invalidation make all late paths write zero", async () => {
  type Context = {
    mounted: boolean;
    generation: number;
    session: CardStatusSession;
    scope: string | null;
    selected: CardRecord | null;
  };
  const mutations: Array<(context: Context) => void> = [
    context => {
      context.session = session();
      context.scope = cardStatusSessionScope(context.session, runtime, now);
    },
    context => { context.selected = card(); },
    context => {
      context.session = session({ tenantId: "tenant-mounted-02" });
      context.scope = cardStatusSessionScope(context.session, runtime, now);
    },
    context => { context.selected = card({ id: "card:mounted.2" }); },
    context => { context.selected = card({ alias: "Changed while pending" }); },
    context => { context.selected = card({ capabilities: { ...card().capabilities, replace: false } }); },
    context => { context.mounted = false; },
  ];
  const writes = { success: 0, error: 0, finally: 0 };
  let calls = 0;

  for (const [index, mutate] of mutations.entries()) {
    const activeSession = session();
    const selected = card();
    const scope = cardStatusSessionScope(activeSession, runtime, now);
    if (!scope) throw new Error("mounted scope required");
    const context: Context = {
      mounted: true,
      generation: index + 1,
      session: activeSession,
      scope,
      selected,
    };
    const request = createCardStatusRequestIdentity(context.generation, scope, "freeze", activeSession, selected, key);
    const isCurrent = () => context.mounted && cardStatusRequestIsCurrent(
      request,
      context.generation,
      context.session,
      runtime,
      context.scope,
      context.selected,
      now,
    );
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const operation = submitCardStatusAction(
      async () => {
        calls += 1;
        return new Promise((next, fail) => { resolve = next; reject = fail; });
      },
      activeSession, runtime, scope, selected.id, selected, "freeze", key, now,
    ).then(
      () => { if (isCurrent()) writes.success += 1; },
      () => { if (isCurrent()) writes.error += 1; },
    ).finally(() => { if (isCurrent()) writes.finally += 1; });
    await Promise.resolve();
    mutate(context);
    if (index % 2 === 0) resolve(frozenResponse());
    else reject(new Error("late provider-shaped failure"));
    await operation;
  }
  assert.equal(calls, mutations.length, "each independent manual action makes one POST");
  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
});

mounted("hostile getter, cross-Card response and expired session fail closed", async () => {
  const scope = cardStatusSessionScope(session(), runtime, now);
  if (!scope) throw new Error("mounted scope required");
  let getterExecutions = 0;
  const hostile = frozenResponse();
  Object.defineProperty(hostile, "status", {
    enumerable: true,
    get() { getterExecutions += 1; return "FROZEN"; },
  });
  await assert.rejects(() => submitCardStatusAction(
    async () => hostile, session(), runtime, scope, card().id, card(), "freeze", key, now,
  ));
  assert.equal(getterExecutions, 0, "public response getters must never execute");
  await assert.rejects(() => submitCardStatusAction(
    async () => frozenResponse({ id: "card:mounted.2" }),
    session(), runtime, scope, card().id, card(), "freeze", key, now,
  ));

  let transportCalls = 0;
  const expired = session({ expiresAt: "2026-08-01T00:00:00Z" });
  await assert.rejects(() => submitCardStatusAction(
    async () => { transportCalls += 1; return frozenResponse(); },
    expired, runtime, scope, card().id, card(), "freeze", key, now,
  ));
  assert.equal(transportCalls, 0, "expired sessions must fail before transport");
});

mounted("one explicit ambiguous retry reuses the same key and a second ambiguity requires real Card refresh", async () => {
  const activeSession = session();
  const selected = card();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const calls: string[] = [];
  let retryRequest: ReturnType<typeof createCardStatusRequestIdentity> | null = null;
  let conflictRequest: ReturnType<typeof createCardStatusRequestIdentity> | null = null;
  let generation = 0;
  const click = async () => {
    if (cardStatusConflictIsCurrent(conflictRequest, activeSession, scope, selected, "freeze"))
      return;
    const retryKey = cardStatusRetryKey(retryRequest, activeSession, scope, selected, "freeze");
    const request = createCardStatusRequestIdentity(
      ++generation,
      scope,
      "freeze",
      activeSession,
      selected,
      retryKey ?? key,
      Boolean(retryKey),
    );
    retryRequest = null;
    calls.push(request.idempotencyKey);
    const failure = Object.freeze({ status: 503 });
    assert.equal(cardStatusFailureIsAmbiguous(failure), true);
    if (request.retry) conflictRequest = request;
    else retryRequest = request;
  };
  await click();
  await click();
  await click();
  assert.deepEqual(calls, [key, key], "the conflict block must prevent any fresh-key third POST");
  assert.equal(cardStatusConflictIsCurrent(conflictRequest, activeSession, scope, selected, "freeze"), true);
  assert.equal(cardStatusConflictIsCurrent(conflictRequest, activeSession, scope, card(), "freeze"), false, "a real refreshed Card object clears the old conflict scope");
});

mounted("only a current explicit 401 may invalidate the exact Session object", () => {
  const activeSession = session();
  const replacementSession = session();
  const selected = card();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const request = createCardStatusRequestIdentity(1, scope, "freeze", activeSession, selected, key);
  const failure = Object.freeze({ status: 401 });
  assert.equal(cardStatusFailureIsExplicit401(failure), true);
  assert.equal(cardStatusRequestIsCurrent(request, 1, replacementSession, runtime, scope, selected, now), false);
  assert.equal(cardStatusRequestIsCurrent(request, 1, activeSession, runtime, scope, selected, now), true);
  assert.equal(cardStatusFailureIsExplicit401({ status: 403 }), false);
});
