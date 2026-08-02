import assert from "node:assert/strict";
import test from "node:test";
import {
  FX_QUOTE_PATH,
  beginFxQuoteSubmit,
  createFxQuoteRequestIdentity,
  fxQuoteFailureRetainsVerifiedQuote,
  fxQuoteRequestIsCurrent,
  fxQuoteSessionScope,
  normalizeFxQuoteInput,
  parseFxQuoteRaw,
  readFxQuote,
  settleFxQuoteSubmit,
  type FxQuoteTransportRequest,
} from "../src/fxQuote.ts";

const sessionExpiresAt = "2099-08-02T12:00:00.000Z";
const quoteExpiresAt = () => new Date(Date.now() + 10 * 60 * 1_000).toISOString();
const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-quote-01",
  tenantId: "tenant-quote-01",
  customerId: "customer-quote-01",
  environment: "TEST" as const,
  expiresAt: sessionExpiresAt,
  ...overrides,
});
const input = () => ({
  sourceAssetCode: "USD",
  targetAssetCode: "SGD",
  sourceAmount: "12.5",
});
const rawQuote = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    quoteId: "quote-public-01",
    environment: "TEST",
    sourceAssetCode: "USD",
    targetAssetCode: "SGD",
    sourceAmount: "12.5",
    targetAmount: "16.875",
    rate: "1.35",
    expiresAt: quoteExpiresAt(),
    ...overrides,
  });

test("issues exactly one POST to the exact FX quote path with the exact request body", async () => {
  const calls: FxQuoteTransportRequest[] = [];
  const quote = await readFxQuote(
    async (request) => {
      calls.push(request);
      return rawQuote();
    },
    session(),
    "TEST",
    input(),
  );

  assert.equal(FX_QUOTE_PATH, "/v1/wallet/fx/quotes");
  assert.deepEqual(calls, [
    { path: FX_QUOTE_PATH, method: "POST", body: input() },
  ]);
  assert.deepEqual(Object.keys(quote).sort(), [
    "environment",
    "expiresAt",
    "quoteId",
    "rate",
    "sourceAmount",
    "sourceAssetCode",
    "targetAmount",
    "targetAssetCode",
  ]);
});

test("normalizes only the exact three-field request and rejects getters or unsafe values", () => {
  assert.deepEqual(
    normalizeFxQuoteInput({ ...input(), sourceAmount: "12.5000" }),
    input(),
  );
  assert.throws(
    () => normalizeFxQuoteInput({ ...input(), tenantId: "tenant-private" }),
    /fields/,
  );
  const getter = { sourceAssetCode: "USD", targetAssetCode: "SGD" } as Record<string, unknown>;
  Object.defineProperty(getter, "sourceAmount", { enumerable: true, get: () => "12.5" });
  assert.throws(() => normalizeFxQuoteInput(getter), /field/);
  for (const invalid of [
    { ...input(), sourceAssetCode: "usd" },
    { ...input(), targetAssetCode: "USD" },
    { ...input(), sourceAmount: "0" },
    { ...input(), sourceAmount: "01" },
    { ...input(), sourceAmount: "+1" },
    { ...input(), sourceAmount: "1e2" },
    { ...input(), sourceAmount: "1.1234567890123456789" },
  ])
    assert.throws(() => normalizeFxQuoteInput(invalid), /FX quote/);
});

test("accepts only the exact eight-field public response and rejects duplicate keys", () => {
  const parsed = parseFxQuoteRaw(rawQuote(), input(), "TEST");
  assert.equal(parsed.quoteId, "quote-public-01");
  assert.throws(
    () => parseFxQuoteRaw(rawQuote({ providerQuoteId: "secret" }), input(), "TEST"),
    /fields/,
  );
  const duplicate = rawQuote().replace(
    '"quoteId":"quote-public-01"',
    '"quoteId":"quote-public-01","\\u0071uoteId":"quote-shadow"',
  );
  assert.throws(() => parseFxQuoteRaw(duplicate, input(), "TEST"), /Duplicate/);
  assert.throws(
    () => parseFxQuoteRaw(`${rawQuote()} `.repeat(400), input(), "TEST"),
    /consumer limit/,
  );
});

test("binds environment, source, target, amount and expiry to the active request", () => {
  for (const unsafe of [
    { environment: "SANDBOX" },
    { sourceAssetCode: "EUR" },
    { targetAssetCode: "EUR" },
    { sourceAmount: "12.6" },
    { expiresAt: "2020-01-01T00:00:00.000Z" },
    { expiresAt: "2099-02-30T00:00:00.000Z" },
    { expiresAt: "2099-08-02T12:00:00.000Z" },
    { targetAmount: "0" },
    { rate: "0" },
  ])
    assert.throws(() => parseFxQuoteRaw(rawQuote(unsafe), input(), "TEST"), /FX quote/);
});

test("verifies target = source times rate with exact 18-decimal truncation", () => {
  const truncationInput = {
    sourceAssetCode: "USD",
    targetAssetCode: "SGD",
    sourceAmount: "0.1",
  };
  const parsed = parseFxQuoteRaw(
    rawQuote({
      sourceAmount: "0.1",
      targetAmount: "0.112345678901234567",
      rate: "1.123456789012345678",
    }),
    truncationInput,
    "TEST",
  );
  assert.equal(parsed.targetAmount, "0.112345678901234567");

  assert.throws(
    () => parseFxQuoteRaw(rawQuote({ targetAmount: "16.874999999999999999" }), input(), "TEST"),
    /does not match source amount and rate/,
  );
  assert.throws(
    () => parseFxQuoteRaw(rawQuote({ rate: "1.350000000000000001" }), input(), "TEST"),
    /does not match source amount and rate/,
  );
});

test("fails closed outside a matching unexpired SANDBOX or TEST actor scope before transport", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return rawQuote();
  };
  for (const [currentSession, runtime] of [
    [session({ environment: "PRODUCTION" }), "PRODUCTION"],
    [session({ environment: "UAT" }), "UAT"],
    [session({ environment: "LOCAL" }), "LOCAL"],
    [session({ environment: "SANDBOX" }), "TEST"],
    [session({ expiresAt: "2020-01-01T00:00:00.000Z" }), "TEST"],
    [session({ tenantId: "" }), "TEST"],
  ] as const)
    await assert.rejects(
      readFxQuote(transport, currentSession, runtime, input()),
      /unavailable/,
    );
  assert.equal(calls, 0);
});

test("rejects a response when the actor scope changes while the request is in flight", async () => {
  const mutable = session();
  let release!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    release = resolve;
  });
  const result = readFxQuote(async () => pending, mutable, "TEST", input());
  mutable.customerId = "customer-other";
  release(rawQuote());
  await assert.rejects(result, /expired before completion/);
});

test("request identity rejects stale session, input, request generation and unmount writes", () => {
  const scope = fxQuoteSessionScope(session(), "TEST")!;
  const normalized = normalizeFxQuoteInput(input());
  const request = createFxQuoteRequestIdentity(7, 11, 5, scope, normalized);
  assert.equal(fxQuoteRequestIsCurrent(request, 11, 5, scope, normalized, true), true);
  assert.equal(fxQuoteRequestIsCurrent(request, 12, 5, scope, normalized, true), false);
  assert.equal(fxQuoteRequestIsCurrent(request, 11, 6, scope, normalized, true), false);
  assert.equal(fxQuoteRequestIsCurrent(request, 11, 5, "other-scope", normalized, true), false);
  assert.equal(
    fxQuoteRequestIsCurrent(
      request,
      11,
      5,
      scope,
      normalizeFxQuoteInput({ ...input(), sourceAmount: "13" }),
      true,
    ),
    false,
  );
  assert.equal(fxQuoteRequestIsCurrent(request, 11, 5, scope, normalized, false), false);
});

test("synchronous gate allows one request and no automatic retry", async () => {
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginFxQuoteSubmit(gate, 1), true);
  assert.equal(beginFxQuoteSubmit(gate, 2), false);
  assert.equal(settleFxQuoteSubmit(gate, 2), false);
  assert.equal(settleFxQuoteSubmit(gate, 1), true);
  let calls = 0;
  await assert.rejects(
    readFxQuote(
      async () => {
        calls += 1;
        throw new Error("network");
      },
      session(),
      "TEST",
      input(),
    ),
    /network/,
  );
  assert.equal(calls, 1);
});

test("only retryable, network and server statuses retain a same-input verified quote", () => {
  for (const status of [0, 408, 429, 500, 503])
    assert.equal(fxQuoteFailureRetainsVerifiedQuote(status), true);
  for (const status of [200, 400, 401, 403, 404, 422, Number.NaN, "500"])
    assert.equal(fxQuoteFailureRetainsVerifiedQuote(status), false);
});
