import assert from "node:assert/strict";
import test from "node:test";
import {
  runWalletTransferPostChain,
  walletTransferPostChainFailureCause,
  walletTransferPostChainFailureIsAmbiguous,
} from "../src/walletTransferPostChain.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment = configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
  ? configuredEnvironment
  : null;
const integration = environment ? test : test.skip;

const receipt = (
  status: "PROCESSING" | "PENDING_SETTLEMENT" | "COMPLETED" | "FAILED" = "PROCESSING",
  completedAt: string | null = status === "COMPLETED" ? "2026-08-03T00:01:00.000Z" : null,
) => Object.freeze({
  id: "operation-transfer-r51",
  type: "INTERNAL_TRANSFER" as const,
  status,
  assetCode: "USD",
  amount: "25",
  direction: "BETWEEN_OWN_ACCOUNTS" as const,
  createdAt: "2026-08-03T00:00:00.000Z",
  completedAt,
  updatedAt: status === "COMPLETED"
    ? "2026-08-03T00:01:00.000Z"
    : "2026-08-03T00:00:00.000Z",
});

const account = (id: string, balance: string) => Object.freeze({
  id,
  accountCode: `ACCOUNT-${id}`,
  name: `Wallet ${id}`,
  assetCode: "USD",
  status: "ACTIVE" as const,
  currentBalance: balance,
  postedBalance: balance,
  pendingBalance: "0",
  availableBalance: balance,
  updatedAt: "2026-08-03T00:01:00.000Z",
});

const balance = (row: ReturnType<typeof account>) => Object.freeze({
  accountId: row.id,
  assetCode: row.assetCode,
  status: row.status,
  currentBalance: row.currentBalance,
  postedBalance: row.postedBalance,
  pendingBalance: row.pendingBalance,
  holdBalance: row.pendingBalance,
  availableBalance: row.availableBalance,
  updatedAt: row.updatedAt,
});

const transactions = (accountId: string, direction: "OUTGOING" | "INCOMING") => Object.freeze({
  accountId,
  items: Object.freeze([
    Object.freeze({
      id: `transaction-${direction.toLowerCase()}-r52`,
      type: "TRANSFER" as const,
      status: "COMPLETED" as const,
      assetCode: "USD",
      amount: "25",
      direction,
      operationId: "operation-transfer-r51",
      createdAt: "2026-08-03T00:01:00.000Z",
      updatedAt: "2026-08-03T00:01:00.000Z",
    }),
  ]),
  nextCursor: null,
  filterKey: '["TRANSFER","COMPLETED","USD",25]',
  cursorTrail: Object.freeze([]),
});

function fixture() {
  const source = account("account-source-r51", "75");
  const destination = account("account-destination-r51", "125");
  const calls: string[] = [];
  let current = true;
  let posts = 0;
  return {
    source,
    destination,
    calls,
    stale: () => { current = false; },
    posts: () => posts,
    input: {
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      assetCode: "USD",
      submit: async () => { calls.push("POST"); posts += 1; return receipt(); },
      confirm: async () => { calls.push("STATUS"); return receipt("COMPLETED"); },
      refresh: {
        accounts: async () => { calls.push("ACCOUNTS"); return [source, destination]; },
        balance: async (row: typeof source) => { calls.push(`BALANCE:${row.id}`); return balance(row); },
        transactions: async (row: typeof source) => {
          calls.push(`TRANSACTIONS:${row.id}`);
          return transactions(row.id, row.id === source.id ? "OUTGOING" : "INCOMING");
        },
      },
      isCurrent: () => current,
    },
  };
}

integration(`one POST is persisted-confirmed before one atomic two-sided refresh (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const value = fixture();
  const result = await runWalletTransferPostChain(value.input);
  assert.equal(result?.status, "COMPLETE");
  if (!result || result.status !== "COMPLETE") return;
  assert.equal(value.posts(), 1);
  assert.deepEqual(value.calls, [
    "POST",
    "STATUS",
    "ACCOUNTS",
    `BALANCE:${value.source.id}`,
    `BALANCE:${value.destination.id}`,
    `TRANSACTIONS:${value.source.id}`,
    `TRANSACTIONS:${value.destination.id}`,
  ]);
  assert.equal(result.commit.receipt.status, "COMPLETED");
  assert.equal(result.commit.sourceBalance.availableBalance, "75");
  assert.equal(result.commit.destinationBalance.availableBalance, "125");
  assert.deepEqual(result.commit.sourceTransactions.items.map(item => item.direction), ["OUTGOING"]);
  assert.deepEqual(result.commit.destinationTransactions.items.map(item => item.direction), ["INCOMING"]);
  assert.equal(result.commit.sourceTransactions.items[0].operationId, result.commit.receipt.id);
  assert.equal(result.commit.destinationTransactions.items[0].operationId, result.commit.receipt.id);
});

integration("a persisted confirmation failure is ambiguous, blocks refresh, and never retries", async () => {
  const value = fixture();
  const failure = Object.assign(new Error("status unavailable"), { status: 503 });
  value.input.confirm = async () => { value.calls.push("STATUS"); throw failure; };
  await assert.rejects(
    runWalletTransferPostChain(value.input),
    error => walletTransferPostChainFailureIsAmbiguous(error) &&
      walletTransferPostChainFailureCause(error) === failure,
  );
  assert.equal(value.posts(), 1);
  assert.deepEqual(value.calls, ["POST", "STATUS"]);
});

integration("every confirmed refresh failure returns one receipt and an all-null safe invalidation", async () => {
  for (const failed of ["ACCOUNTS", `BALANCE:account-source-r51`, `BALANCE:account-destination-r51`, "TRANSACTIONS:account-source-r51", "TRANSACTIONS:account-destination-r51"]) {
    const value = fixture();
    const originalAccounts = value.input.refresh.accounts;
    const originalBalance = value.input.refresh.balance;
    const originalTransactions = value.input.refresh.transactions;
    value.input.refresh.accounts = async signal => {
      if (failed === "ACCOUNTS") throw new Error("accounts failed");
      return originalAccounts(signal);
    };
    value.input.refresh.balance = async (row, signal) => {
      if (failed === `BALANCE:${row.id}`) throw new Error("balance failed");
      return originalBalance(row, signal);
    };
    value.input.refresh.transactions = async (row, signal) => {
      if (failed === `TRANSACTIONS:${row.id}`) throw new Error("history failed");
      return originalTransactions(row, signal);
    };
    const result = await runWalletTransferPostChain(value.input);
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
    if (!result || result.status !== "CONFIRMED_REFRESH_FAILED") continue;
    assert.equal(result.commit.receipt.status, "COMPLETED");
    for (const field of ["accounts", "sourceAccount", "destinationAccount", "sourceBalance", "destinationBalance", "sourceTransactions", "destinationTransactions"] as const)
      assert.equal(result.commit[field], null);
    assert.equal(value.posts(), 1);
  }
});

integration("mismatched account and balance generations fail closed after persisted confirmation", async () => {
  const value = fixture();
  value.input.refresh.balance = async row => balance({ ...row, updatedAt: "2026-08-03T00:02:00.000Z" });
  const result = await runWalletTransferPostChain(value.input);
  assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
  assert.equal(value.posts(), 1);
});

integration("a destination absent from the refreshed owned-account list is never queried", async () => {
  const value = fixture();
  value.input.refresh.accounts = async () => {
    value.calls.push("ACCOUNTS");
    return [value.source];
  };
  const result = await runWalletTransferPostChain(value.input);
  assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
  assert.deepEqual(value.calls, ["POST", "STATUS", "ACCOUNTS"]);
  assert.equal(value.posts(), 1);
});

integration("source debit and destination credit must uniquely reference the same confirmed operation", async () => {
  for (const mismatch of ["SOURCE_OPERATION", "DESTINATION_DIRECTION", "DESTINATION_AMOUNT", "DESTINATION_ACCOUNT", "DUPLICATE_SOURCE"] as const) {
    const value = fixture();
    const originalTransactions = value.input.refresh.transactions;
    value.input.refresh.transactions = async (row, signal) => {
      const history = await originalTransactions(row, signal);
      if (mismatch === "DESTINATION_ACCOUNT" && row.id === value.destination.id)
        return { ...history, accountId: value.source.id };
      if (mismatch === "DUPLICATE_SOURCE" && row.id === value.source.id)
        return { ...history, items: [...history.items, { ...history.items[0], id: "transaction-outgoing-duplicate-r52" }] };
      if (row.id === value.source.id && mismatch === "SOURCE_OPERATION")
        return { ...history, items: history.items.map(item => ({ ...item, operationId: "operation-other-r52" })) };
      if (row.id === value.destination.id && mismatch === "DESTINATION_DIRECTION")
        return { ...history, items: history.items.map(item => ({ ...item, direction: "OUTGOING" as const })) };
      if (row.id === value.destination.id && mismatch === "DESTINATION_AMOUNT")
        return { ...history, items: history.items.map(item => ({ ...item, amount: "24" })) };
      return history;
    };
    const result = await runWalletTransferPostChain(value.input);
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED", mismatch);
    assert.equal(value.posts(), 1);
  }
});

integration("an incomplete persisted operation performs zero account, balance or history refresh reads", async () => {
  for (const candidate of [
    receipt("PROCESSING"),
    receipt("PENDING_SETTLEMENT"),
    receipt("FAILED"),
    receipt("COMPLETED", null),
  ]) {
    const value = fixture();
    value.input.confirm = async () => { value.calls.push("STATUS"); return candidate; };
    const result = await runWalletTransferPostChain(value.input);
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
    assert.equal(result?.commit.receipt, candidate);
    assert.deepEqual(value.calls, ["POST", "STATUS"]);
    assert.equal(value.posts(), 1);
  }
});

integration("late success, error, and 401 become zero-write null results after generation change", async () => {
  for (const mode of ["success", "error", "401"] as const) {
    const value = fixture();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    value.input.submit = async () => {
      value.calls.push("POST");
      await pending;
      if (mode === "error") throw new Error("late failure");
      if (mode === "401") throw Object.assign(new Error("late unauthorized"), { status: 401 });
      return receipt();
    };
    const operation = runWalletTransferPostChain(value.input);
    value.stale();
    release();
    assert.equal(await operation, null);
    assert.deepEqual(value.calls, ["POST"]);
  }
});

integration("late account-history success, error, and 401 write nothing after session or input generation changes", async () => {
  for (const mode of ["success", "error", "401"] as const) {
    const value = fixture();
    const originalTransactions = value.input.refresh.transactions;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    value.input.refresh.transactions = async (row, signal) => {
      if (row.id !== value.source.id) return originalTransactions(row, signal);
      await pending;
      if (mode === "error") throw new Error("late account-history failure");
      if (mode === "401") throw Object.assign(new Error("late account-history unauthorized"), { status: 401 });
      return originalTransactions(row, signal);
    };
    const operation = runWalletTransferPostChain(value.input);
    await Promise.resolve();
    value.stale();
    release();
    assert.equal(await operation, null);
    assert.equal(value.posts(), 1);
  }
});

integration("pre-cancelled or stale work performs zero POSTs and zero reads", async () => {
  const value = fixture();
  value.stale();
  const result = await runWalletTransferPostChain(value.input);
  assert.equal(result, null);
  assert.equal(value.posts(), 0);
  assert.deepEqual(value.calls, []);
  const cancelled = fixture();
  const controller = new AbortController();
  controller.abort();
  assert.equal(await runWalletTransferPostChain({ ...cancelled.input, signal: controller.signal }), null);
  assert.equal(cancelled.posts(), 0);
  assert.deepEqual(cancelled.calls, []);
});
