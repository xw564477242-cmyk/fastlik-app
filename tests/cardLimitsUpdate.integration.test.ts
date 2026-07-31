import assert from "node:assert/strict";
import test from "node:test";
import type { CardLimitsRecord } from "../src/cardLimits.ts";
import type { CardRecord } from "../src/cardList.ts";
import {
  beginCardLimitsUpdate,
  cardLimitsUpdateRequestIsCurrent,
  createCardLimitsUpdateRequestIdentity,
  settleCardLimitsUpdate,
  submitCardLimitsUpdate,
} from "../src/cardLimitsUpdate.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mounted = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const key = "a7777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const card = (id = "card:owned.1"): CardRecord => ({
  id,
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
});

const limits = (updatedAt = "2026-07-31T10:00:00Z"): CardLimitsRecord => ({
  cardId: "card:owned.1",
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt,
});

const input = {
  singleTransactionMinor: 12000,
  dailySpendMinor: 60000,
  monthlySpendMinor: 600000,
  dailyAtmMinor: 25000,
};

const success = JSON.parse(JSON.stringify({
  cardId: "card:owned.1",
  singleTransactionMinor: "12000",
  dailySpendMinor: "60000",
  monthlySpendMinor: "600000",
  dailyAtmMinor: "25000",
  updatedAt: "2026-07-31T14:00:00Z",
  providerOperationRef: "must-not-leave-parser",
}));

mounted(`Card limits update exact mounted consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: unknown[] = [];
  const result = await submitCardLimitsUpdate(
    async request => { calls.push(request); return success; },
    card(), limits(), input, key,
    environment as "SANDBOX" | "TEST",
    environment as "SANDBOX" | "TEST",
    "scope-a", "scope-a", card().id,
  );
  assert.equal(calls.length, 1, "one manual submit must issue at most one POST");
  assert.deepEqual(calls[0], {
    path: "/v1/cards/card%3Aowned.1/limits",
    method: "POST",
    body: input,
    idempotencyKey: key,
  });
  assert.equal("providerOperationRef" in result, false);
});

mounted("mounted submit gate synchronously blocks double click and never retries", async () => {
  const gate = { activeRequestId: null as number | null };
  let generation = 0;
  let calls = 0;
  let resolve!: (value: unknown) => void;
  const action = async () => {
    const requestId = ++generation;
    if (!beginCardLimitsUpdate(gate, requestId)) return;
    try {
      await submitCardLimitsUpdate(
        async () => { calls += 1; return new Promise(next => { resolve = next; }); },
        card(), limits(), input, key,
        environment as "SANDBOX" | "TEST",
        environment as "SANDBOX" | "TEST",
        "scope-a", "scope-a", card().id,
      );
    } finally {
      settleCardLimitsUpdate(gate, requestId);
    }
  };
  const first = action();
  await Promise.resolve();
  const duplicate = action();
  assert.equal(calls, 1);
  resolve(success);
  await Promise.all([first, duplicate]);
  assert.equal(calls, 1, "transport must not retry automatically");
});

mounted("session, selection, input and unmount invalidation make late success error and finally write zero", async () => {
  type Context = {
    mounted: boolean;
    generation: number;
    scope: string | null;
    selected: CardRecord | null;
    limits: CardLimitsRecord | null;
    input: typeof input;
  };
  const scenarios: Array<(context: Context) => void> = [
    context => { context.scope = "scope-b"; },
    context => { context.selected = card("card:owned.2"); },
    context => { context.input = { ...input, dailyAtmMinor: 25001 }; },
    context => { context.mounted = false; },
  ];
  const totals = { success: 0, error: 0, finally: 0 };
  let calls = 0;

  for (const [index, invalidate] of scenarios.entries()) {
    const context: Context = {
      mounted: true,
      generation: index + 1,
      scope: "scope-a",
      selected: card(),
      limits: limits(),
      input,
    };
    const request = createCardLimitsUpdateRequestIdentity(
      context.generation,
      "scope-a",
      environment as "SANDBOX" | "TEST",
      card(),
      limits(),
      input,
      key,
    );
    let resolve!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const isCurrent = () => context.mounted && cardLimitsUpdateRequestIsCurrent(
      request,
      context.generation,
      context.scope,
      environment as "SANDBOX" | "TEST",
      environment as "SANDBOX" | "TEST",
      context.selected,
      context.limits,
      context.input,
    );
    const operation = submitCardLimitsUpdate(
      async () => { calls += 1; return new Promise((next, fail) => { resolve = next; reject = fail; }); },
      card(), limits(), input, key,
      environment as "SANDBOX" | "TEST",
      environment as "SANDBOX" | "TEST",
      "scope-a", "scope-a", card().id,
    ).then(
      () => { if (isCurrent()) totals.success += 1; },
      () => { if (isCurrent()) totals.error += 1; },
    ).finally(() => { if (isCurrent()) totals.finally += 1; });
    await Promise.resolve();
    invalidate(context);
    if (index % 2 === 0) resolve(success);
    else reject(new Error("late provider-shaped failure"));
    await operation;
  }
  assert.equal(calls, scenarios.length, "each manual action must make exactly one POST");
  assert.deepEqual(totals, { success: 0, error: 0, finally: 0 });
});
