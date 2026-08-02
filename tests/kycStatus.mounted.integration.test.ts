import assert from "node:assert/strict";
import test from "node:test";
import {
  createKycStatusRequestIdentity,
  kycStatusFailureCanInvalidateSession,
  kycStatusFailureClearsSnapshot,
  kycStatusRequestIsCurrent,
  kycStatusRequestWasAborted,
  readKycStatus,
  type KycStatusRecord,
  type KycStatusTransport,
} from "../src/kycStatus.ts";
import {
  walletTransferSessionScope,
  type WalletTransferSession,
} from "../src/walletTransfer.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment = configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
  ? configuredEnvironment
  : null;
const mounted = environment ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";

const session = (overrides: Partial<WalletTransferSession> = {}): WalletTransferSession => ({
  actorId: "actor-mounted-kyc",
  tenantId: "tenant-mounted-kyc",
  customerId: "customer-mounted-kyc",
  environment: runtime,
  expiresAt: "2099-08-02T12:00:00.000Z",
  ...overrides,
});

type ScopedSnapshot = Readonly<{scopeKey: string; sessionGeneration: number; record: KycStatusRecord}>;
type MountedState = {
  mounted: boolean;
  session: WalletTransferSession;
  scopeKey: string | null;
  requestSequence: number;
  sessionGeneration: number;
  controller: AbortController | null;
  inFlight: boolean;
  snapshot: ScopedSnapshot | null;
  refreshing: boolean;
  error: string;
  writes: {
    success: number;
    error: number;
    finally: number;
    snapshotClear: number;
    sessionInvalid: number;
  };
};

const record = (status: KycStatusRecord["status"] = "APPROVED"): KycStatusRecord => Object.freeze({
  status,
  reviewedAt: status === "PENDING" ? null : "2026-08-02T01:02:03.000Z",
});

const state = (): MountedState => {
  const currentSession = session();
  const scopeKey = walletTransferSessionScope(currentSession, runtime);
  assert.ok(scopeKey);
  return {
    mounted: true,
    session: currentSession,
    scopeKey,
    requestSequence: 0,
    sessionGeneration: 1,
    controller: null,
    inFlight: false,
    snapshot: Object.freeze({scopeKey, sessionGeneration: 1, record: record("PENDING")}),
    refreshing: false,
    error: "",
    writes: {success: 0, error: 0, finally: 0, snapshotClear: 0, sessionInvalid: 0},
  };
};

const visible = (current: MountedState): KycStatusRecord | null =>
  current.snapshot?.scopeKey === current.scopeKey &&
    current.snapshot.sessionGeneration === current.sessionGeneration
    ? current.snapshot.record
    : null;

const invalidate = (
  current: MountedState,
  change: () => void,
  clearSnapshot = true,
) => {
  current.requestSequence += 1;
  current.inFlight = false;
  current.controller?.abort();
  current.controller = null;
  if (clearSnapshot) current.snapshot = null;
  current.refreshing = false;
  current.error = "";
  change();
};

const start = (current: MountedState, transport: KycStatusTransport) => {
  const activeSession = current.session;
  const expectedSessionGeneration = current.sessionGeneration;
  const expectedScope = walletTransferSessionScope(activeSession, runtime);
  if (!expectedScope || expectedScope !== current.scopeKey || current.inFlight) return null;
  const controller = new AbortController();
  current.controller?.abort();
  current.controller = controller;
  current.inFlight = true;
  const request = createKycStatusRequestIdentity(
    ++current.requestSequence,
    expectedScope,
    expectedSessionGeneration,
  );
  const isCurrent = () => Boolean(
    current.controller === controller &&
    !controller.signal.aborted &&
    current.session === activeSession &&
    current.sessionGeneration === expectedSessionGeneration &&
    walletTransferSessionScope(current.session, runtime) === expectedScope &&
    kycStatusRequestIsCurrent(
      request,
      current.requestSequence,
      current.scopeKey,
      current.sessionGeneration,
      current.mounted,
    )
  );
  current.refreshing = true;
  current.error = "";
  const operation = readKycStatus(
    transport,
    activeSession,
    runtime,
    expectedScope,
    controller.signal,
  ).then(value => {
    if (!isCurrent()) return;
    current.snapshot = Object.freeze({
      scopeKey: expectedScope,
      sessionGeneration: expectedSessionGeneration,
      record: value,
    });
    current.writes.success += 1;
  }).catch(value => {
    const live = isCurrent();
    if (!live || kycStatusRequestWasAborted(value)) return;
    const clearSnapshot = kycStatusFailureClearsSnapshot(value, live, controller.signal);
    if (clearSnapshot) {
      current.snapshot = null;
      current.writes.snapshotClear += 1;
    }
    if (kycStatusFailureCanInvalidateSession(value, live, controller.signal)) {
      current.controller = null;
      current.inFlight = false;
      current.refreshing = false;
      current.error = "";
      current.writes.sessionInvalid += 1;
      return;
    }
    current.error = clearSnapshot
      ? "KYC status is unavailable for this session. No prior KYC snapshot is displayed."
      : "KYC status is temporarily unavailable for this session. The last verified same-session snapshot remains unchanged.";
    current.writes.error += 1;
  }).finally(() => {
    if (!isCurrent()) return;
    current.controller = null;
    current.inFlight = false;
    current.refreshing = false;
    current.writes.finally += 1;
  });
  return {controller, operation};
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
};

mounted(`current explicit 401 clears the KYC snapshot and joins session invalidation (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  assert.equal(visible(current)?.status, "PENDING");
  const pending = deferred<unknown>();
  const request = start(current, () => pending.promise);
  assert.ok(request);
  pending.reject(Object.assign(new Error("current session unauthorized"), {status: 401}));
  await request.operation;
  assert.equal(visible(current), null);
  assert.equal(current.snapshot, null);
  assert.equal(current.refreshing, false);
  assert.equal(current.inFlight, false);
  assert.equal(current.controller, null);
  assert.equal(current.error, "");
  assert.deepEqual(current.writes, {
    success: 0,
    error: 0,
    finally: 0,
    snapshotClear: 1,
    sessionInvalid: 1,
  });
});

mounted(`current 403 or 404 clears only the KYC snapshot while 408 and 5xx retain it (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  for (const status of [403, 404]) {
    const current = state();
    const retained = current.snapshot;
    const pending = deferred<unknown>();
    const request = start(current, () => pending.promise);
    assert.ok(request);
    pending.reject(Object.assign(new Error("scoped KYC unavailable"), {status}));
    await request.operation;
    assert.notEqual(retained, null);
    assert.equal(current.snapshot, null);
    assert.equal(visible(current), null);
    assert.equal(current.writes.snapshotClear, 1);
    assert.equal(current.writes.sessionInvalid, 0);
    assert.equal(current.writes.error, 1);
    assert.match(current.error, /No prior KYC snapshot/);
  }

  for (const status of [408, 500, 502, 503, 504]) {
    const current = state();
    const retained = current.snapshot;
    const pending = deferred<unknown>();
    const request = start(current, () => pending.promise);
    assert.ok(request);
    pending.reject(Object.assign(new Error("transient KYC failure"), {status}));
    await request.operation;
    assert.equal(current.snapshot, retained);
    assert.equal(visible(current)?.status, "PENDING");
    assert.equal(current.writes.snapshotClear, 0);
    assert.equal(current.writes.sessionInvalid, 0);
    assert.equal(current.writes.error, 1);
    assert.match(current.error, /remains unchanged/);
  }
});

mounted(`old verified KYC state has zero leakage into a new scope (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  const old = deferred<unknown>();
  const request = start(current, () => old.promise);
  assert.ok(request);
  invalidate(current, () => {
    current.session = session({customerId: "customer-mounted-kyc-next"});
    current.scopeKey = walletTransferSessionScope(current.session, runtime);
  });
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(visible(current), null);
  old.resolve(record("APPROVED"));
  await request.operation;
  assert.equal(visible(current), null);
  assert.deepEqual(current.writes, {
    success: 0,
    error: 0,
    finally: 0,
    snapshotClear: 0,
    sessionInvalid: 0,
  });
});

mounted(`stale 401 cannot clear the new scope snapshot or invalidate its session (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const current = state();
  const old = deferred<unknown>();
  const request = start(current, () => old.promise);
  assert.ok(request);
  invalidate(current, () => {
    current.session = session({actorId: "actor-mounted-kyc-next", customerId: "customer-mounted-kyc-next"});
    current.scopeKey = walletTransferSessionScope(current.session, runtime);
  });
  assert.ok(current.scopeKey);
  const nextSnapshot = Object.freeze({
    scopeKey: current.scopeKey,
    sessionGeneration: current.sessionGeneration,
    record: record("REJECTED"),
  });
  current.snapshot = nextSnapshot;
  old.reject(Object.assign(new Error("old session unauthorized"), {status: 401}));
  await request.operation;
  assert.equal(current.snapshot, nextSnapshot);
  assert.equal(visible(current)?.status, "REJECTED");
  assert.deepEqual(current.writes, {
    success: 0,
    error: 0,
    finally: 0,
    snapshotClear: 0,
    sessionInvalid: 0,
  });
});

mounted(`same-field session replacement increments generation and makes every old completion zero-write (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  for (const completion of ["success", "401", "503"] as const) {
    const current = state();
    const pending = deferred<unknown>();
    const request = start(current, () => pending.promise);
    assert.ok(request);
    const replacement = session();
    assert.notEqual(replacement, current.session);
    assert.equal(walletTransferSessionScope(replacement, runtime), current.scopeKey);
    current.session = replacement;
    current.sessionGeneration += 1;
    assert.equal(visible(current), null, "old same-scope snapshot must be hidden synchronously");
    if (completion === "success") pending.resolve(record("APPROVED"));
    else pending.reject(Object.assign(new Error(`stale ${completion}`), {status: Number(completion)}));
    await request.operation;
    assert.deepEqual(current.writes, {
      success: 0,
      error: 0,
      finally: 0,
      snapshotClear: 0,
      sessionInvalid: 0,
    });
  }
});

mounted(`late 401, error and finally perform zero writes after scope change or unmount (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const cases = [
    Object.assign(new Error("late unauthorized"), {status: 401}),
    Object.assign(new Error("late unavailable"), {status: 503}),
  ];
  for (const failure of cases) {
    const current = state();
    const pending = deferred<unknown>();
    const request = start(current, () => pending.promise);
    assert.ok(request);
    invalidate(current, () => {current.mounted = false;});
    pending.reject(failure);
    await request.operation;
    assert.deepEqual(current.writes, {
      success: 0,
      error: 0,
      finally: 0,
      snapshotClear: 0,
      sessionInvalid: 0,
    });
  }
});
