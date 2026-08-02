import assert from "node:assert/strict";
import test from "node:test";
import {
  FX_QUOTE_PATH,
  createFxQuoteRequestIdentity,
  fxQuoteRequestIsCurrent,
  fxQuoteSessionScope,
  normalizeFxQuoteInput,
  readFxQuote,
  type FxQuoteTransportRequest,
} from "../src/fxQuote.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment =
  configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
    ? configuredEnvironment
    : null;
const integration = environment ? test : test.skip;
const sessionExpiresAt = "2099-08-02T12:00:00.000Z";
const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-fx-integration",
  tenantId: "tenant-fx-integration",
  customerId: "customer-fx-integration",
  environment: environment!,
  expiresAt: sessionExpiresAt,
  ...overrides,
});
const input = normalizeFxQuoteInput({
  sourceAssetCode: "USD",
  targetAssetCode: "SGD",
  sourceAmount: "100",
});
const response = () =>
  JSON.stringify({
    quoteId: "quote-integration-01",
    environment,
    sourceAssetCode: "USD",
    targetAssetCode: "SGD",
    sourceAmount: "100",
    targetAmount: "135",
    rate: "1.35",
    expiresAt: new Date(Date.now() + 10 * 60 * 1_000).toISOString(),
  });

integration(`FX quote exact consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: FxQuoteTransportRequest[] = [];
  const result = await readFxQuote(
    async (request) => {
      calls.push(request);
      return response();
    },
    session(),
    environment!,
    input,
  );
  assert.deepEqual(calls, [{ path: FX_QUOTE_PATH, method: "POST", body: input }]);
  assert.equal(result.environment, environment);
  assert.equal(result.targetAmount, "135");
});

integration("does not retry a failed quote and preserves a valid actor scope", async () => {
  let calls = 0;
  const currentSession = session();
  const scopeBefore = fxQuoteSessionScope(currentSession, environment!);
  await assert.rejects(
    readFxQuote(
      async () => {
        calls += 1;
        throw new Error("503");
      },
      currentSession,
      environment!,
      input,
    ),
    /503/,
  );
  assert.equal(calls, 1);
  assert.equal(fxQuoteSessionScope(currentSession, environment!), scopeBefore);
});

integration("denies Production before transport and rejects stale completion writes", async () => {
  let calls = 0;
  await assert.rejects(
    readFxQuote(
      async () => {
        calls += 1;
        return response();
      },
      { ...session(), environment: "PRODUCTION" },
      "PRODUCTION",
      input,
    ),
    /unavailable/,
  );
  assert.equal(calls, 0);

  const scope = fxQuoteSessionScope(session(), environment!)!;
  const request = createFxQuoteRequestIdentity(1, 1, 0, scope, input);
  assert.equal(fxQuoteRequestIsCurrent(request, 1, 0, scope, input, true), true);
  assert.equal(fxQuoteRequestIsCurrent(request, 2, 0, scope, input, true), false);
  assert.equal(fxQuoteRequestIsCurrent(request, 1, 1, scope, input, true), false);
  assert.equal(fxQuoteRequestIsCurrent(request, 1, 0, null, null, true), false);
  assert.equal(fxQuoteRequestIsCurrent(request, 1, 0, scope, input, false), false);
});
