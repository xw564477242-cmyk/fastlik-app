import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  beginCardRenewal,
  cardRenewalRequestIsCurrent,
  cardRenewalSessionScope,
  createCardRenewalCommit,
  createCardRenewalRequestIdentity,
  settleCardRenewal,
  submitCardRenewal,
  type CardRenewalEnvironment,
  type CardRenewalSession,
} from "../src/cardRenewal.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const now = Date.parse("2026-08-01T00:00:00Z");
const keyA = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const keyB = "b8888888-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const session = (overrides: Partial<CardRenewalSession> = {}): CardRenewalSession => ({
  actorId: "actor-mounted-renewal",
  tenantId: "tenant-mounted-renewal",
  customerId: "customer-mounted-renewal",
  environment: runtime,
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const oldCard = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card:mounted.renew",
  type: "PHYSICAL",
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

const renewalResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "card:mounted.renew",
  type: "PHYSICAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 1,
  expiryYear: 2031,
  currency: "USD",
  alias: "Mounted",
  availableBalanceMinor: "2500",
  createdAt: "2026-01-01T00:00:00Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  providerOperationRef: "must-not-leave-parser",
  ...overrides,
});

mounted(`Card renewal exact mounted consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const calls: unknown[] = [];
  const renewed = await submitCardRenewal(
    async request => { calls.push(request); return renewalResponse(); },
    activeSession, runtime, scope, oldCard().id, oldCard(), keyA, now,
  );
  assert.deepEqual(calls, [{
    path: "/v1/cards/card%3Amounted.renew/renew",
    method: "POST",
    idempotencyKey: keyA,
  }]);
  assert.deepEqual(Object.keys(renewed).sort(), [
    "alias", "availableBalanceMinor", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  assert.equal("providerOperationRef" in renewed, false);
  const request = createCardRenewalRequestIdentity(1, scope, oldCard(), keyA);
  const other = oldCard({ id: "card:other", last4: "1111" });
  const commit = createCardRenewalCommit([oldCard(), other], oldCard(), request.oldCardVersion, renewed);
  assert.deepEqual(commit.cards.map(card => card.id), [renewed.id, other.id]);
  assert.equal(commit.selectedCard, renewed);
});

mounted("mounted submit gate blocks double click, permits fresh-key next click, and never retries", async () => {
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const gate = { activeRequestId: null as number | null };
  const keys = [keyA, keyB];
  const usedKeys: string[] = [];
  let generation = 0;
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const click = async () => {
    const requestId = ++generation;
    if (!beginCardRenewal(gate, requestId)) return;
    const request = createCardRenewalRequestIdentity(requestId, scope, oldCard(), keys.shift() ?? keyA);
    try {
      await submitCardRenewal(
        async transportRequest => {
          calls += 1;
          usedKeys.push(transportRequest.idempotencyKey);
          return new Promise(next => { resolve = next; });
        },
        activeSession, runtime, scope, oldCard().id, oldCard(), request.idempotencyKey, now,
      );
    } finally {
      settleCardRenewal(gate, requestId);
    }
  };
  const first = click();
  await Promise.resolve();
  const duplicate = click();
  assert.equal(calls, 1);
  resolve(renewalResponse());
  await Promise.all([first, duplicate]);
  const secondAccepted = click();
  await Promise.resolve();
  assert.equal(calls, 2);
  resolve(renewalResponse());
  await secondAccepted;
  assert.deepEqual(usedKeys, [keyA, keyB]);
  assert.notEqual(usedKeys[0], usedKeys[1]);
});

mounted("session, selection, complete old Card version and unmount invalidation make all late paths write zero", async () => {
  type Context = {
    mounted: boolean;
    generation: number;
    session: CardRenewalSession;
    scope: string | null;
    selected: CardRecord | null;
  };
  const mutations: Array<(context: Context) => void> = [
    context => {
      context.session = session({ customerId: "customer-mounted-other" });
      context.scope = cardRenewalSessionScope(context.session, runtime, now);
    },
    context => { context.selected = oldCard({ id: "card:mounted.other" }); },
    context => { context.selected = oldCard({ alias: "Changed while pending" }); },
    context => { context.selected = oldCard({ status: "FROZEN" }); },
    context => { context.selected = oldCard({ availableBalanceMinor: "2501" }); },
    context => { context.selected = oldCard({ capabilities: { ...oldCard().capabilities, renew: false } }); },
    context => { context.mounted = false; },
  ];
  const writes = { success: 0, error: 0, finally: 0 };
  let calls = 0;

  for (const [index, mutate] of mutations.entries()) {
    const activeSession = session();
    const selected = oldCard();
    const scope = cardRenewalSessionScope(activeSession, runtime, now);
    if (!scope) throw new Error("mounted scope required");
    const context: Context = { mounted: true, generation: index + 1, session: activeSession, scope, selected };
    const request = createCardRenewalRequestIdentity(context.generation, scope, selected, keyA);
    const isCurrent = () => context.mounted && cardRenewalRequestIsCurrent(
      request, context.generation, context.session, runtime, context.scope, context.selected, now,
    );
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const operation = submitCardRenewal(
      async () => {
        calls += 1;
        return new Promise((next, fail) => { resolve = next; reject = fail; });
      },
      activeSession, runtime, scope, selected.id, selected, keyA, now,
    ).then(
      () => { if (isCurrent()) writes.success += 1; },
      () => { if (isCurrent()) writes.error += 1; },
    ).finally(() => { if (isCurrent()) writes.finally += 1; });
    await Promise.resolve();
    mutate(context);
    if (index % 2 === 0) resolve(renewalResponse());
    else reject(new Error("late provider-shaped failure"));
    await operation;
  }
  assert.equal(calls, mutations.length);
  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
});

mounted("hostile getter, cross-selection, expired and non-nonproduction sessions fail closed", async () => {
  const activeSession = session();
  const scope = cardRenewalSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  let getterExecutions = 0;
  const hostile = renewalResponse();
  Object.defineProperty(hostile, "id", {
    enumerable: true,
    get() { getterExecutions += 1; return oldCard().id; },
  });
  await assert.rejects(() => submitCardRenewal(
    async () => hostile,
    activeSession, runtime, scope, oldCard().id, oldCard(), keyA, now,
  ));
  assert.equal(getterExecutions, 0);

  let transportCalls = 0;
  const denied: Array<[CardRenewalSession, CardRenewalEnvironment, string | null, string]> = [
    [session({ expiresAt: "2026-08-01T00:00:00Z" }), runtime, scope, oldCard().id],
    [activeSession, runtime, scope, "card:mounted.other"],
    [session({ environment: "UAT" }), "UAT", null, oldCard().id],
    [session({ environment: "PRODUCTION" }), "PRODUCTION", null, oldCard().id],
    [session({ environment: "LOCAL" }), "LOCAL", null, oldCard().id],
    [session(), "UNKNOWN" as CardRenewalEnvironment, null, oldCard().id],
  ];
  for (const [candidateSession, candidateRuntime, candidateScope, currentCardId] of denied)
    await assert.rejects(() => submitCardRenewal(
      async () => { transportCalls += 1; return renewalResponse(); },
      candidateSession, candidateRuntime, candidateScope, currentCardId, oldCard(), keyA, now,
    ));
  assert.equal(transportCalls, 0);

  await assert.rejects(() => submitCardRenewal(
    async () => renewalResponse({ createdAt: "2026-08-01T00:00:01Z" }),
    activeSession, runtime, scope, oldCard().id, oldCard(), keyA, now,
  ), /immutable/);
});
