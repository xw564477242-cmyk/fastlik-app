import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionValidationError,
  createSessionInitializationRequest,
  runBoundedWalletInitialization,
  runSessionInitializationModule,
  sessionFailureRequiresClear,
  sessionInitializationRequestIsCurrent,
} from "../src/sessionLifecycle.ts";

test("initialization 5xx or timeout remains a module error and keeps the session", async () => {
  for (const failure of [
    { status: 503, message: "upstream unavailable" },
    { status: 408, message: "API timeout" },
  ]) {
    const writes = { committed: 0, moduleError: 0, cleared: 0 };
    await runSessionInitializationModule({
      load: async () => { throw failure; },
      isCurrent: () => true,
      commit: () => { writes.committed += 1; },
      moduleError: () => { writes.moduleError += 1; },
      sessionInvalid: () => { writes.cleared += 1; },
    });
    assert.deepEqual(writes, { committed: 0, moduleError: 1, cleared: 0 });
  }
});

test("401, revoked session and local session validation clear authentication", async () => {
  const failures = [
    { status: 401, message: "Unauthorized" },
    { status: 403, message: "Session has been revoked" },
    { status: 403, message: "Tenant is disabled" },
    new SessionValidationError("Environment mismatch"),
  ];
  for (const failure of failures) {
    let cleared = 0;
    await runSessionInitializationModule({
      load: async () => { throw failure; },
      isCurrent: () => true,
      commit: () => assert.fail("invalid session must not commit"),
      moduleError: () => assert.fail("invalid session must not become a module error"),
      sessionInvalid: () => { cleared += 1; },
    });
    assert.equal(cleared, 1);
    assert.equal(sessionFailureRequiresClear(failure), true);
  }
  assert.equal(sessionFailureRequiresClear(new Error("Card balance failed", {
    cause: { status: 401, message: "Session expired" },
  })), true);
});

test("ordinary forbidden business response does not clear authentication", () => {
  assert.equal(sessionFailureRequiresClear({ status: 403, message: "Card operation forbidden" }), false);
  const first = new Error("first");
  const second = new Error("second", { cause: first });
  Object.defineProperty(first, "cause", { value: second });
  assert.equal(sessionFailureRequiresClear(first), false);
});

test("anonymous session discovery can suppress its expected 401 while an established session clears", () => {
  const failure = { status: 401, message: "Session unavailable" };
  const action = (hasEstablishedScope: boolean) =>
    sessionFailureRequiresClear(failure) && hasEstablishedScope ? "clear-and-report" : "stay-signed-out";
  assert.equal(action(false), "stay-signed-out");
  assert.equal(action(true), "clear-and-report");
});

test("late initialization response cannot write into a replacement session", async () => {
  let resolve!: (value: string) => void;
  const pending = new Promise<string>(done => { resolve = done; });
  const request = createSessionInitializationRequest(7, "scope-a");
  let generation = 7;
  let scope: string | null = "scope-a";
  let committed = "";
  const operation = runSessionInitializationModule({
    load: () => pending,
    isCurrent: () => sessionInitializationRequestIsCurrent(request, generation, scope, true),
    commit: value => { committed = value; },
    moduleError: () => assert.fail("late success is not an error"),
    sessionInvalid: () => assert.fail("late success cannot clear the new session"),
  });
  generation += 1;
  scope = "scope-b";
  resolve("old-session-data");
  await operation;
  assert.equal(committed, "");
});

test("Wallet initialization bounds the database fan-out and prioritizes required modules", async () => {
  const events: string[] = [];
  let active = 0;
  let maximum = 0;
  let releaseSelected!: () => void;
  const selectedPending = new Promise<void>(resolve => { releaseSelected = resolve; });
  const run = (name: string, pending: Promise<void> = Promise.resolve()) => async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    events.push(`${name}:start`);
    await pending;
    events.push(`${name}:end`);
    active -= 1;
  };

  const operation = runBoundedWalletInitialization({
    selectedWallet: run("selected", selectedPending),
    balanceSummary: run("summary"),
    operations: run("operations"),
    isCurrent: () => true,
  });
  await Promise.resolve();
  assert.deepEqual(events, ["selected:start"]);
  releaseSelected();
  await operation;
  assert.deepEqual(events, [
    "selected:start",
    "selected:end",
    "summary:start",
    "operations:start",
    "summary:end",
    "operations:end",
  ]);
  assert.equal(maximum, 2);
});

test("Wallet initialization does not start later modules after the session scope changes", async () => {
  let current = true;
  let laterStarts = 0;
  await runBoundedWalletInitialization({
    selectedWallet: async () => { current = false; },
    balanceSummary: async () => { laterStarts += 1; },
    operations: async () => { laterStarts += 1; },
    isCurrent: () => current,
  });
  assert.equal(laterStarts, 0);
});
