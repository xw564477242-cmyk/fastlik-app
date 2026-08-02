import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  cardStatusFailureKind,
  cardStatusRequestIsCurrent,
  cardStatusRetryKey,
  cardStatusSessionScope,
  createCardStatusIdempotencyKey,
  createCardStatusRequestIdentity,
  submitCardStatusAction,
  type CardStatusSession,
} from "../src/cardStatusAction.ts";
import { readCardActivationConfirmation } from "../src/cardActivation.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const now = Date.parse("2026-08-01T00:00:00Z");
const randomUuid = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const session = (overrides: Partial<CardStatusSession> = {}): CardStatusSession => ({
  actorId: "actor-activation-01",
  tenantId: "tenant-activation-01",
  customerId: "customer-activation-01",
  environment: runtime,
  expiresAt: "2026-08-01T01:00:00Z",
  ...overrides,
});

const pending = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: "card:activation.1",
  type: "VIRTUAL",
  status: "PENDING",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: "Activation",
  availableBalanceMinor: "2500",
  createdAt: "2026-08-01T00:00:00.000Z",
  capabilities: { freeze: false, unfreeze: false, replace: false, renew: false, updateLimits: true },
  ...overrides,
});

const active = (overrides: Partial<CardRecord> = {}): CardRecord => pending({
  status: "ACTIVE",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
  ...overrides,
});

const wireActive = (overrides: Record<string, unknown> = {}) => ({
  ...active(),
  providerOperationRef: "must-never-reach-consumer-state",
  ...overrides,
});

mounted(`PENDING Card activation uses one operation-bound bodyless POST then two persisted reads (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const activeSession = session();
  const selected = pending();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("activation scope required");
  const key = createCardStatusIdempotencyKey("activate", randomUuid);
  const calls: unknown[] = [];
  const postResult = await submitCardStatusAction(
    async request => { calls.push(request); return wireActive(); },
    activeSession, runtime, scope, selected.id, selected, "activate", key, now,
  );
  assert.deepEqual(calls, [{ path: "/v1/cards/card%3Aactivation.1/activate", method: "POST", idempotencyKey: key }]);
  assert.equal("body" in (calls[0] as object), false);
  assert.equal("providerOperationRef" in postResult, false);
  assert.equal(postResult.status, "ACTIVE");

  const reads: string[] = [];
  const confirmation = await readCardActivationConfirmation({
    card: async id => { reads.push(`GET /v1/cards/${encodeURIComponent(id)}`); return active(); },
    cards: async cursor => { reads.push(`GET /v1/cards?limit=20${cursor ? `&cursor=${cursor}` : ""}`); return { cards: [active()], nextCursor: null }; },
  }, selected);
  assert.deepEqual(reads, ["GET /v1/cards/card%3Aactivation.1", "GET /v1/cards?limit=20"]);
  assert.equal(confirmation.card.status, "ACTIVE");
});

mounted("equal-valued replacement Session/Card, generation change and unmount make late activation write zero", async () => {
  const activeSession = session();
  const selected = pending();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("activation scope required");
  const request = createCardStatusRequestIdentity(9, scope, "activate", activeSession, selected, createCardStatusIdempotencyKey("activate", randomUuid));
  const contexts = [
    { mounted: true, generation: 9, currentSession: session(), currentCard: selected },
    { mounted: true, generation: 9, currentSession: activeSession, currentCard: pending() },
    { mounted: true, generation: 10, currentSession: activeSession, currentCard: selected },
    { mounted: false, generation: 9, currentSession: activeSession, currentCard: selected },
    { mounted: true, generation: 9, currentSession: session({ tenantId: "tenant-other" }), currentCard: selected },
  ];
  let writes = 0;
  for (const context of contexts) {
    const current = context.mounted && cardStatusRequestIsCurrent(
      request, context.generation, context.currentSession, runtime, scope, context.currentCard, now,
    );
    if (current) writes += 1;
  }
  assert.equal(writes, 0);
});

mounted("409 and timeout/server ambiguity reuse exactly one activation key while 401/403/404 stay distinct", () => {
  const activeSession = session();
  const selected = pending();
  const scope = cardStatusSessionScope(activeSession, runtime, now);
  if (!scope) throw new Error("activation scope required");
  const key = createCardStatusIdempotencyKey("activate", randomUuid);
  const first = createCardStatusRequestIdentity(1, scope, "activate", activeSession, selected, key);
  assert.equal(cardStatusRetryKey(first, activeSession, scope, selected, "activate"), key);
  const retry = createCardStatusRequestIdentity(2, scope, "activate", activeSession, selected, key, true);
  assert.equal(cardStatusRetryKey(retry, activeSession, scope, selected, "activate"), null);
  assert.equal(cardStatusFailureKind({ status: 401 }), "UNAUTHORIZED");
  assert.equal(cardStatusFailureKind({ status: 403 }), "FORBIDDEN");
  assert.equal(cardStatusFailureKind({ status: 404 }), "NOT_FOUND");
  assert.equal(cardStatusFailureKind({ status: 409 }), "CONFLICT");
  assert.equal(cardStatusFailureKind({ status: 408 }), "AMBIGUOUS");
  assert.equal(cardStatusFailureKind({ status: 503 }), "AMBIGUOUS");
});

mounted("PRODUCTION and expired sessions fail before the activation transport", async () => {
  let calls = 0;
  const selected = pending();
  const key = createCardStatusIdempotencyKey("activate", randomUuid);
  for (const [candidate, candidateRuntime] of [
    [session({ environment: "PRODUCTION" }), "PRODUCTION"],
    [session({ expiresAt: "2026-08-01T00:00:00Z" }), runtime],
  ] as const) {
    await assert.rejects(() => submitCardStatusAction(
      async () => { calls += 1; return wireActive(); },
      candidate, candidateRuntime, "invalid-scope", selected.id, selected, "activate", key, now,
    ));
  }
  assert.equal(calls, 0);
});
