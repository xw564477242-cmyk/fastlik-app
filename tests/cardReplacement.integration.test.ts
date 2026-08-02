import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  beginCardReplacement,
  cardReplacementRequestIsCurrent,
  cardReplacementSessionScope,
  createCardReplacementCommit,
  createCardReplacementRequestIdentity,
  settleCardReplacement,
  submitCardReplacement,
  type CardReplacementReason,
  type CardReplacementSession,
} from "../src/cardReplacement.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const now = Date.parse("2026-08-01T00:00:00Z");
const keyA = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const keyB = "b8888888-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const session = (overrides: Partial<CardReplacementSession> = {}): CardReplacementSession => ({
  actorId: "actor-mounted-replacement",
  tenantId: "tenant-mounted-replacement",
  customerId: "customer-mounted-replacement",
  environment: runtime,
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const oldCard = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card:mounted.old",
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

const replacementResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "card:mounted.new",
  type: "VIRTUAL",
  status: "PENDING",
  last4: null,
  expiryMonth: null,
  expiryYear: null,
  currency: "USD",
  alias: "Mounted",
  createdAt: "2026-08-01T00:00:01Z",
  capabilities: { freeze: false, unfreeze: false, replace: false, renew: false, updateLimits: false },
  providerOperationRef: "must-not-leave-parser",
  ...overrides,
});

mounted(`Card replacement exact mounted consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const activeSession = session();
  const scope = cardReplacementSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const calls: unknown[] = [];
  const controller = new AbortController();
  const replacement = await submitCardReplacement(
    async request => { calls.push(request); return replacementResponse(); },
    activeSession, runtime, scope, oldCard().id, oldCard(), { reason: "DAMAGED" }, keyA, now,
    controller.signal,
  );
  assert.deepEqual(calls, [{
    path: "/v1/cards/card%3Amounted.old/replace",
    method: "POST",
    body: { reason: "DAMAGED" },
    idempotencyKey: keyA,
    signal: controller.signal,
  }]);
  assert.deepEqual(Object.keys(replacement).sort(), [
    "alias", "capabilities", "createdAt", "currency", "expiryMonth", "expiryYear", "id", "last4", "status", "type",
  ]);
  assert.equal("providerOperationRef" in replacement, false);
  const commit = createCardReplacementCommit(
    [oldCard(), oldCard({ id: "card:other", last4: "1111" })],
    oldCard(),
    createCardReplacementRequestIdentity(1, scope, "DAMAGED", oldCard(), keyA).oldCardVersion,
    replacement,
  );
  assert.deepEqual(commit.cards.map(card => card.id), [replacement.id, "card:other"]);
  assert.equal(commit.selectedCard, replacement);
});

mounted("mounted submit gate blocks double click, permits fresh-key next click, and never retries", async () => {
  const activeSession = session();
  const scope = cardReplacementSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  const gate = { activeRequestId: null as number | null };
  const keys = [keyA, keyB];
  const usedKeys: string[] = [];
  let generation = 0;
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const click = async () => {
    const requestId = ++generation;
    if (!beginCardReplacement(gate, requestId)) return;
    const request = createCardReplacementRequestIdentity(requestId, scope, "LOST", oldCard(), keys.shift() ?? keyA);
    try {
      await submitCardReplacement(
        async transportRequest => {
          calls += 1;
          usedKeys.push(transportRequest.idempotencyKey);
          return new Promise(next => { resolve = next; });
        },
        activeSession, runtime, scope, oldCard().id, oldCard(), { reason: "LOST" }, request.idempotencyKey, now,
      );
    } finally {
      settleCardReplacement(gate, requestId);
    }
  };
  const first = click();
  await Promise.resolve();
  const duplicate = click();
  assert.equal(calls, 1);
  resolve(replacementResponse());
  await Promise.all([first, duplicate]);
  const secondAccepted = click();
  await Promise.resolve();
  assert.equal(calls, 2);
  resolve(replacementResponse());
  await secondAccepted;
  assert.deepEqual(usedKeys, [keyA, keyB]);
  assert.notEqual(usedKeys[0], usedKeys[1]);
});

mounted("session, selection, reason, complete old Card version and unmount invalidation make all late paths write zero", async () => {
  type Context = {
    mounted: boolean;
    generation: number;
    session: CardReplacementSession;
    scope: string | null;
    reason: CardReplacementReason;
    selected: CardRecord | null;
  };
  const mutations: Array<(context: Context) => void> = [
    context => {
      context.session = session({ customerId: "customer-mounted-other" });
      context.scope = cardReplacementSessionScope(context.session, runtime, now);
    },
    context => { context.selected = oldCard({ id: "card:mounted.other" }); },
    context => { context.reason = "STOLEN"; },
    context => { context.selected = oldCard({ alias: "Changed while pending" }); },
    context => { context.selected = oldCard({ capabilities: { ...oldCard().capabilities, replace: false } }); },
    context => { context.mounted = false; },
  ];
  const writes = { success: 0, error: 0, finally: 0 };
  let calls = 0;

  for (const [index, mutate] of mutations.entries()) {
    const activeSession = session();
    const selected = oldCard();
    const scope = cardReplacementSessionScope(activeSession, runtime, now);
    if (!scope) throw new Error("mounted scope required");
    const context: Context = { mounted: true, generation: index + 1, session: activeSession, scope, reason: "LOST", selected };
    const request = createCardReplacementRequestIdentity(context.generation, scope, "LOST", selected, keyA);
    const isCurrent = () => context.mounted && cardReplacementRequestIsCurrent(
      request,
      context.generation,
      context.session,
      runtime,
      context.scope,
      context.reason,
      context.selected,
      now,
    );
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const operation = submitCardReplacement(
      async () => {
        calls += 1;
        return new Promise((next, fail) => { resolve = next; reject = fail; });
      },
      activeSession, runtime, scope, selected.id, selected, { reason: "LOST" }, keyA, now,
    ).then(
      () => { if (isCurrent()) writes.success += 1; },
      () => { if (isCurrent()) writes.error += 1; },
    ).finally(() => { if (isCurrent()) writes.finally += 1; });
    await Promise.resolve();
    mutate(context);
    if (index % 2 === 0) resolve(replacementResponse());
    else reject(new Error("late provider-shaped failure"));
    await operation;
  }
  assert.equal(calls, mutations.length);
  assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
});

mounted("hostile getter, cross-selection, ID collision and expired session fail closed", async () => {
  const activeSession = session();
  const scope = cardReplacementSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("mounted scope required");
  let getterExecutions = 0;
  const hostile = replacementResponse();
  Object.defineProperty(hostile, "id", {
    enumerable: true,
    get() { getterExecutions += 1; return "card:mounted.new"; },
  });
  await assert.rejects(() => submitCardReplacement(
    async () => hostile,
    activeSession, runtime, scope, oldCard().id, oldCard(), { reason: "OTHER" }, keyA, now,
  ));
  assert.equal(getterExecutions, 0);

  let transportCalls = 0;
  for (const [candidateSession, currentCardId] of [
    [session({ expiresAt: "2026-08-01T00:00:00Z" }), oldCard().id],
    [activeSession, "card:mounted.other"],
  ] as const) await assert.rejects(() => submitCardReplacement(
    async () => { transportCalls += 1; return replacementResponse(); },
    candidateSession, runtime, scope, currentCardId, oldCard(), { reason: "OTHER" }, keyA, now,
  ));
  assert.equal(transportCalls, 0);

  const collision = oldCard({ id: "card:mounted.collision", last4: "1111" });
  const conflictingReplacement = await submitCardReplacement(
    async () => replacementResponse({ id: collision.id }),
    activeSession, runtime, scope, oldCard().id, oldCard(), { reason: "OTHER" }, keyA, now,
  );
  assert.throws(() => createCardReplacementCommit(
    [oldCard(), collision],
    oldCard(),
    createCardReplacementRequestIdentity(1, scope, "OTHER", oldCard(), keyA).oldCardVersion,
    conflictingReplacement,
  ), /collides/);
});
