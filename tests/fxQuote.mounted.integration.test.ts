import assert from "node:assert/strict";
import test from "node:test";
import {
  beginFxQuoteSubmit,
  createFxQuoteRequestIdentity,
  fxQuoteFailureCanInvalidateSession,
  fxQuoteRequestIsCurrent,
  fxQuoteRequestWasAborted,
  fxQuoteSessionScope,
  normalizeFxQuoteInput,
  readFxQuote,
  settleFxQuoteSubmit,
  type FxQuote,
  type FxQuoteInput,
  type FxQuoteSession,
  type FxQuoteTransport,
} from "../src/fxQuote.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment = configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
  ? configuredEnvironment
  : null;
const mounted = environment ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const session = (overrides: Partial<FxQuoteSession> = {}): FxQuoteSession => ({
  actorId: "actor-mounted-fx",
  tenantId: "tenant-mounted-fx",
  customerId: "customer-mounted-fx",
  environment: runtime,
  expiresAt: "2099-08-02T12:00:00.000Z",
  ...overrides,
});
const input = (sourceAmount = "10"): FxQuoteInput => normalizeFxQuoteInput({
  sourceAssetCode: "USD",
  targetAssetCode: "SGD",
  sourceAmount,
});
const response = (currentInput: FxQuoteInput = input()) => JSON.stringify({
  quoteId: "quote-mounted-fx-01",
  environment: runtime,
  sourceAssetCode: currentInput.sourceAssetCode,
  targetAssetCode: currentInput.targetAssetCode,
  sourceAmount: currentInput.sourceAmount,
  targetAmount: currentInput.sourceAmount === "20" ? "27" : "13.5",
  rate: "1.35",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
});

type State = {
  mounted: boolean;
  session: FxQuoteSession;
  scopeKey: string | null;
  input: FxQuoteInput;
  inputGeneration: number;
  requestGeneration: number;
  requestSequence: number;
  gate: {activeRequestId: number | null};
  controller: AbortController | null;
  quote: FxQuote | null;
  loading: boolean;
  error: string;
  writes: {success: number; error: number; finally: number; globalSessionInvalid: number};
};

const state = (): State => {
  const currentSession = session();
  return {
    mounted: true,
    session: currentSession,
    scopeKey: fxQuoteSessionScope(currentSession, runtime),
    input: input(),
    inputGeneration: 0,
    requestGeneration: 0,
    requestSequence: 0,
    gate: {activeRequestId: null},
    controller: null,
    quote: null,
    loading: false,
    error: "",
    writes: {success: 0, error: 0, finally: 0, globalSessionInvalid: 0},
  };
};

const invalidate = (current: State, change: () => void) => {
  current.controller?.abort();
  current.controller = null;
  current.requestGeneration += 1;
  current.gate.activeRequestId = null;
  change();
};

const start = (current: State, transport: FxQuoteTransport) => {
  const requestId = ++current.requestSequence;
  if (!beginFxQuoteSubmit(current.gate, requestId)) return null;
  const controller = new AbortController();
  current.controller = controller;
  const activeSession = current.session;
  const expectedScope = current.scopeKey!;
  const expectedInput = current.input;
  const requestGeneration = ++current.requestGeneration;
  const request = createFxQuoteRequestIdentity(
    requestId,
    requestGeneration,
    current.inputGeneration,
    expectedScope,
    expectedInput,
  );
  const isCurrent = () => Boolean(
    current.gate.activeRequestId === requestId &&
    current.controller === controller &&
    !controller.signal.aborted &&
    fxQuoteSessionScope(activeSession, runtime) === expectedScope &&
    fxQuoteRequestIsCurrent(
      request,
      current.requestGeneration,
      current.inputGeneration,
      current.scopeKey,
      current.input,
      current.mounted,
    )
  );
  current.loading = true;
  current.error = "";
  const operation = readFxQuote(
    transport,
    activeSession,
    runtime,
    expectedInput,
    controller.signal,
  ).then(value => {
    if (!isCurrent()) return;
    current.quote = value;
    current.writes.success += 1;
  }).catch(value => {
    const live = isCurrent();
    if (!live || fxQuoteRequestWasAborted(value)) return;
    if (fxQuoteFailureCanInvalidateSession(value, live, controller.signal)) {
      current.controller = null;
      settleFxQuoteSubmit(current.gate, requestId);
      current.loading = false;
      current.writes.globalSessionInvalid += 1;
      return;
    }
    current.error = "FX quote unavailable for this session. No conversion was performed.";
    current.writes.error += 1;
  }).finally(() => {
    const live = isCurrent();
    const settled = settleFxQuoteSubmit(current.gate, requestId);
    if (live && settled) {
      current.controller = null;
      current.loading = false;
      current.writes.finally += 1;
    }
  });
  return {controller, operation};
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
};

mounted(`rapid double click keeps exactly one mounted FX request in flight (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  const pending = deferred<string>();
  let calls = 0;
  const first = start(current, request => {
    calls += 1;
    assert.equal(request.signal.aborted, false);
    return pending.promise;
  });
  assert.ok(first);
  assert.equal(start(current, async () => {calls += 1; return response();}), null);
  assert.equal(calls, 1);
  pending.resolve(response());
  await first.operation;
  assert.deepEqual(current.writes, {success: 1, error: 0, finally: 1, globalSessionInvalid: 0});
});

mounted(`scope reset aborts the old request before a replacement can start (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  const old = deferred<string>();
  const first = start(current, request => old.promise);
  assert.ok(first);
  invalidate(current, () => {
    current.session = session({customerId: "customer-mounted-fx-next"});
    current.scopeKey = fxQuoteSessionScope(current.session, runtime);
  });
  assert.equal(first.controller.signal.aborted, true);
  const nextInput = input("20");
  current.input = nextInput;
  current.inputGeneration += 1;
  const replacement = start(current, request => {
    assert.equal(first.controller.signal.aborted, true, "old fetch must be aborted before replacement transport starts");
    assert.equal(request.signal.aborted, false);
    return Promise.resolve(response(nextInput));
  });
  assert.ok(replacement);
  old.resolve(response());
  await Promise.all([first.operation, replacement.operation]);
  assert.equal(current.quote?.sourceAmount, "20");
  assert.deepEqual(current.writes, {success: 1, error: 0, finally: 1, globalSessionInvalid: 0});
});

mounted(`scope, session, assets, input and unmount abort late completion with zero writes (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const invalidations: Array<(current: State) => void> = [
    current => invalidate(current, () => {
      current.session = session({tenantId: "tenant-mounted-fx-next"});
      current.scopeKey = fxQuoteSessionScope(current.session, runtime);
    }),
    current => invalidate(current, () => {
      current.session = session({actorId: "actor-mounted-fx-next", expiresAt: "2099-08-03T12:00:00.000Z"});
      current.scopeKey = fxQuoteSessionScope(current.session, runtime);
    }),
    current => invalidate(current, () => {
      current.inputGeneration += 1;
      current.input = normalizeFxQuoteInput({sourceAssetCode: "EUR", targetAssetCode: "USD", sourceAmount: "10"});
    }),
    current => invalidate(current, () => {
      current.inputGeneration += 1;
      current.input = input("20");
    }),
    current => invalidate(current, () => { current.mounted = false; }),
  ];
  for (const cancel of invalidations) {
    const current = state();
    const pending = deferred<string>();
    const request = start(current, () => pending.promise);
    assert.ok(request);
    cancel(current);
    assert.equal(request.controller.signal.aborted, true);
    pending.resolve(response());
    await request.operation;
    assert.deepEqual(current.writes, {success: 0, error: 0, finally: 0, globalSessionInvalid: 0});
    assert.equal(current.quote, null);
  }
});

mounted(`stale 401 after abort cannot clear a newer session or perform any late write (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  const pending = deferred<string>();
  const request = start(current, () => pending.promise);
  assert.ok(request);
  invalidate(current, () => {
    current.session = session({customerId: "customer-new-session"});
    current.scopeKey = fxQuoteSessionScope(current.session, runtime);
  });
  pending.reject(Object.assign(new Error("old session unauthorized"), {status: 401}));
  await request.operation;
  assert.deepEqual(current.writes, {success: 0, error: 0, finally: 0, globalSessionInvalid: 0});
  assert.equal(current.session.customerId, "customer-new-session");
});

mounted(`only the current scope's explicit 401 emits one session invalidation (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  const request = start(current, async () => {
    throw Object.assign(new Error("current session unauthorized"), {status: 401});
  });
  assert.ok(request);
  await request.operation;
  assert.deepEqual(current.writes, {success: 0, error: 0, finally: 0, globalSessionInvalid: 1});
  assert.equal(current.gate.activeRequestId, null);
  assert.equal(current.controller, null);
  assert.equal(current.loading, false);
});
