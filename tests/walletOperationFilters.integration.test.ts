import assert from "node:assert/strict";
import test from "node:test";
import {
  appendWalletOperationPage,
  createWalletOperationActivityRequestIdentity,
  createWalletOperationDetailRequestIdentity,
  readWalletOperationActivity,
  readWalletOperationDetail,
  walletOperationActivityRequestIsCurrent,
  walletOperationDetailRequestIsCurrent,
  walletOperationFilterKey,
  walletOperationRequestWasAborted,
  type WalletOperationFilterSelection,
  type WalletOperationPage,
  type WalletOperationRecord,
  type WalletOperationTransport,
} from "../src/walletOperations.ts";
import {
  walletTransferSessionScope,
  type WalletTransferSession,
} from "../src/walletTransfer.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mountedTest = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const startedAt = Date.parse("2026-08-01T01:00:00.000Z");
const expiresAt = Date.parse("2026-08-01T01:10:00.000Z");
const session: WalletTransferSession = Object.freeze({
  actorId: "actor-wallet-operation-filter",
  tenantId: "tenant-wallet-operation-filter",
  customerId: "customer-wallet-operation-filter",
  environment: runtime,
  expiresAt: new Date(expiresAt).toISOString(),
});
const scope = () => {
  const value = walletTransferSessionScope(session, runtime, startedAt);
  if (!value) throw new Error("mounted Wallet operation scope required");
  return value;
};
const filters: WalletOperationFilterSelection = Object.freeze({ type: "DEPOSIT", status: "COMPLETED" });
const backendCursor = (id: string) => Buffer.from(JSON.stringify({
  version: 2,
  createdAt: "2026-08-01T01:00:00.000Z",
  id,
  type: "DEPOSIT",
  status: "COMPLETED",
})).toString("base64url");
const operation = (
  id: string,
  createdAt: string,
  status: WalletOperationRecord["status"] = "COMPLETED",
) => ({
  id,
  type: "DEPOSIT",
  status,
  assetCode: "USD",
  amount: "25.5",
  direction: "INCOMING",
  createdAt,
  completedAt: status === "COMPLETED" ? createdAt : null,
  updatedAt: createdAt,
});
const snapshot = (): WalletOperationPage => ({
  items: [operation("operation-2", "2026-08-01T00:59:00.000Z")],
  nextCursor: backendCursor("operation-2"),
});
const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

type ActivityState = {
  mounted: boolean;
  now: number;
  requestId: number;
  scopeKey: string | null;
  filters: WalletOperationFilterSelection;
  cursor: string | null;
  page: WalletOperationPage | null;
  detail: WalletOperationRecord | null;
  controller: AbortController | null;
  writes: { success: number; error: number; finally: number };
};

const activityState = (): ActivityState => ({
  mounted: true,
  now: startedAt,
  requestId: 0,
  scopeKey: scope(),
  filters,
  cursor: null,
  page: snapshot(),
  detail: operation("operation-2", "2026-08-01T00:59:00.000Z"),
  controller: null,
  writes: { success: 0, error: 0, finally: 0 },
});

const startActivity = (
  state: ActivityState,
  transport: WalletOperationTransport,
  nextCursor?: string,
) => {
  const originalPage = state.page;
  let expectedPage = originalPage;
  const requestScope = state.scopeKey;
  if (!requestScope) throw new Error("request scope required");
  const controller = new AbortController();
  state.controller?.abort();
  state.controller = controller;
  state.cursor = nextCursor ?? null;
  const request = createWalletOperationActivityRequestIdentity(
    ++state.requestId,
    requestScope,
    state.filters,
    state.cursor,
  );
  const current = () =>
    state.controller === controller &&
    state.page === expectedPage &&
    walletTransferSessionScope(session, runtime, state.now) === requestScope &&
    walletOperationActivityRequestIsCurrent(
      request,
      state.requestId,
      state.scopeKey,
      walletOperationFilterKey(state.filters),
      state.cursor,
      state.mounted,
    );
  const pending = readWalletOperationActivity(
    transport,
    session,
    runtime,
    requestScope,
    state.filters,
    nextCursor,
    controller.signal,
    () => state.now,
  ).then((page) => {
    if (!current()) return;
    state.writes.success += 1;
    expectedPage = nextCursor && originalPage
      ? appendWalletOperationPage(originalPage, page, nextCursor)
      : page;
    state.page = expectedPage;
  }, (value) => {
    if (current() && !walletOperationRequestWasAborted(value)) {
      state.writes.error += 1;
    }
  }).finally(() => {
    if (current()) {
      state.writes.finally += 1;
      state.controller = null;
    }
  });
  return { controller, pending, originalPage };
};

mountedTest(`one manual refresh performs one GET and atomically replaces the same-filter snapshot (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = activityState();
  const before = state.page;
  const controlled = deferred();
  let calls = 0;
  const running = startActivity(state, ({ path, method, signal }) => {
    calls += 1;
    assert.equal(path, "/v1/wallet/operations?type=DEPOSIT&status=COMPLETED&limit=25");
    assert.equal(method, "GET");
    assert.equal(signal.aborted, false);
    return controlled.promise;
  });
  assert.equal(state.page, before, "pending refresh must retain the verified snapshot");
  controlled.resolve({ items: [operation("operation-3", "2026-08-01T01:01:00.000Z")], nextCursor: null });
  await running.pending;
  assert.equal(calls, 1);
  assert.deepEqual(state.page?.items.map((item) => item.id), ["operation-3"]);
  assert.deepEqual(state.writes, { success: 1, error: 0, finally: 1 });
});

mountedTest(`one failed refresh never retries and retains the same-filter verified snapshot (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = activityState();
  const before = state.page;
  let calls = 0;
  await startActivity(state, async ({ method }) => {
    calls += 1;
    assert.equal(method, "GET");
    throw new Error("private upstream failure");
  }).pending;
  assert.equal(calls, 1);
  assert.equal(state.page, before);
  assert.deepEqual(state.writes, { success: 0, error: 1, finally: 1 });
});

mountedTest(`cursor pagination performs one filter-bound GET and keeps the snapshot on failure (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = activityState();
  const cursor = state.page!.nextCursor!;
  let calls = 0;
  await startActivity(state, async ({ path }) => {
    calls += 1;
    assert.equal(path, `/v1/wallet/operations?type=DEPOSIT&status=COMPLETED&limit=25&cursor=${cursor}`);
    return { items: [operation("operation-1", "2026-08-01T00:58:00.000Z")], nextCursor: null };
  }, cursor).pending;
  assert.equal(calls, 1);
  assert.deepEqual(state.page?.items.map((item) => item.id), ["operation-2", "operation-1"]);

  const retained = state.page;
  const failedCursor = backendCursor("operation-1");
  state.page = { ...retained!, nextCursor: failedCursor };
  await startActivity(state, async () => { calls += 1; throw new Error("page failed"); }, failedCursor).pending;
  assert.equal(calls, 2);
  assert.equal(state.page?.items.length, 2);
});

mountedTest(`type/status change aborts old work and clears cursor, snapshot and detail before one new GET (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const state = activityState();
  const old = deferred();
  const running = startActivity(state, () => old.promise);
  running.controller.abort();
  state.requestId += 1;
  state.filters = { type: "WITHDRAWAL", status: "PENDING_SETTLEMENT" };
  state.cursor = null;
  state.page = null;
  state.detail = null;
  assert.equal(running.controller.signal.aborted, true);
  old.resolve({ items: [operation("operation-late", "2026-08-01T01:02:00.000Z")], nextCursor: null });
  await running.pending;
  assert.equal(state.page, null);
  assert.equal(state.detail, null);
  assert.deepEqual(state.writes, { success: 0, error: 0, finally: 0 });

  let calls = 0;
  await startActivity(state, async ({ path }) => {
    calls += 1;
    assert.equal(path, "/v1/wallet/operations?type=WITHDRAWAL&status=PENDING_SETTLEMENT&limit=25");
    return { items: [], nextCursor: null };
  }).pending;
  assert.equal(calls, 1);
});

mountedTest(`repeat, scope, filters, cursor, generation, unmount and natural expiry make late success/error/finally zero-write (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const invalidations: Array<(state: ActivityState, controller: AbortController) => void> = [
    (state, controller) => { controller.abort(); state.controller = new AbortController(); state.requestId += 1; },
    (state, controller) => { controller.abort(); state.requestId += 1; state.scopeKey = JSON.stringify(["actor-2", "expiry", "tenant", "customer", runtime]); },
    (state, controller) => { controller.abort(); state.requestId += 1; state.filters = { ...state.filters, status: "FAILED" }; },
    (state, controller) => { controller.abort(); state.requestId += 1; state.cursor = backendCursor("other"); },
    (state, controller) => { controller.abort(); state.requestId += 1; },
    (state, controller) => { controller.abort(); state.requestId += 1; state.mounted = false; },
    (state) => { state.now = expiresAt; },
  ];
  for (const invalidate of invalidations) {
    for (const outcome of ["success", "error"] as const) {
      const state = activityState();
      const controlled = deferred();
      const running = startActivity(state, () => controlled.promise);
      invalidate(state, running.controller);
      if (outcome === "success") {
        controlled.resolve({ items: [operation("operation-late", "2026-08-01T01:02:00.000Z")], nextCursor: null });
      } else controlled.reject(new Error("late error"));
      await running.pending;
      assert.deepEqual(state.writes, { success: 0, error: 0, finally: 0 });
      assert.notEqual(state.page?.items[0]?.id, "operation-late");
    }
  }
});

mountedTest(`detail GET is snapshot-bound and filter, list, selection, repeat, expiry or unmount makes late writes zero (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const invalidations = ["filter", "list", "selection", "repeat", "expiry", "unmount"] as const;
  for (const invalidation of invalidations) {
    const state = activityState();
    const list = state.page!;
    const selected = list.items[0];
    const controller = new AbortController();
    const request = createWalletOperationDetailRequestIdentity(++state.requestId, state.scopeKey!, state.filters, selected, list);
    const controlled = deferred();
    let calls = 0;
    const current = () =>
      state.controller === controller &&
      walletTransferSessionScope(session, runtime, state.now) === request.scopeKey &&
      walletOperationDetailRequestIsCurrent(
        request,
        state.requestId,
        state.scopeKey,
        walletOperationFilterKey(state.filters),
        state.page,
        state.detail?.id ?? null,
        state.mounted,
      );
    state.controller = controller;
    state.detail = selected;
    const writes = { success: 0, error: 0, finally: 0 };
    const pending = readWalletOperationDetail(
      ({ path, method, signal }) => {
        calls += 1;
        assert.equal(path, `/v1/wallet/operations/${selected.id}`);
        assert.equal(method, "GET");
        assert.equal(signal, controller.signal);
        return controlled.promise;
      },
      session,
      runtime,
      request.scopeKey,
      selected,
      controller.signal,
      () => state.now,
    ).then((detail) => {
      if (current()) { writes.success += 1; state.detail = detail; }
    }, (value) => {
      if (current() && !walletOperationRequestWasAborted(value)) writes.error += 1;
    }).finally(() => { if (current()) writes.finally += 1; });

    if (invalidation === "filter") { controller.abort(); state.filters = { ...state.filters, status: "FAILED" }; }
    if (invalidation === "list") { controller.abort(); state.page = { ...list }; }
    if (invalidation === "selection") { controller.abort(); state.detail = null; }
    if (invalidation === "repeat") { controller.abort(); state.controller = new AbortController(); state.requestId += 1; }
    if (invalidation === "expiry") state.now = expiresAt;
    if (invalidation === "unmount") { controller.abort(); state.mounted = false; }
    controlled.resolve({ ...selected, status: "FAILED", completedAt: null, updatedAt: "2026-08-01T01:03:00.000Z" });
    await pending;
    assert.equal(calls, 1);
    assert.deepEqual(writes, { success: 0, error: 0, finally: 0 });
  }
});
