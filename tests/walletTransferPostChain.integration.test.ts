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

const receipt = (status: "PROCESSING" | "COMPLETED" = "PROCESSING") => Object.freeze({
  id: "operation-transfer-r51",
  type: "INTERNAL_TRANSFER" as const,
  status,
  assetCode: "USD",
  amount: "25",
  direction: "BETWEEN_OWN_ACCOUNTS" as const,
  createdAt: "2026-08-03T00:00:00.000Z",
  completedAt: status === "COMPLETED" ? "2026-08-03T00:01:00.000Z" : null,
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

const transactions = Object.freeze({
  items: Object.freeze([
    Object.freeze({
      id: "transaction-outgoing-r51",
      type: "TRANSFER" as const,
      status: "COMPLETED" as const,
      assetCode: "USD",
      amount: "25",
      direction: "OUTGOING" as const,
      createdAt: "2026-08-03T00:01:00.000Z",
      updatedAt: "2026-08-03T00:01:00.000Z",
    }),
    Object.freeze({
      id: "transaction-incoming-r51",
      type: "TRANSFER" as const,
      status: "COMPLETED" as const,
      assetCode: "USD",
      amount: "25",
      direction: "INCOMING" as const,
      createdAt: "2026-08-03T00:01:00.000Z",
      updatedAt: "2026-08-03T00:01:00.000Z",
    }),
  ]),
  nextCursor: null,
  filterKey: '["ALL","ALL","USD",25]',
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
        transactions: async () => { calls.push("TRANSACTIONS:BOTH"); return transactions; },
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
    "TRANSACTIONS:BOTH",
  ]);
  assert.equal(result.commit.receipt.status, "COMPLETED");
  assert.equal(result.commit.sourceBalance.availableBalance, "75");
  assert.equal(result.commit.destinationBalance.availableBalance, "125");
  assert.deepEqual(result.commit.transactions.items.map(item => item.direction), ["OUTGOING", "INCOMING"]);
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
  for (const failed of ["ACCOUNTS", `BALANCE:account-source-r51`, `BALANCE:account-destination-r51`, "TRANSACTIONS:BOTH"]) {
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
    value.input.refresh.transactions = async signal => {
      if (failed === "TRANSACTIONS:BOTH") throw new Error("history failed");
      return originalTransactions(signal);
    };
    const result = await runWalletTransferPostChain(value.input);
    assert.equal(result?.status, "CONFIRMED_REFRESH_FAILED");
    if (!result || result.status !== "CONFIRMED_REFRESH_FAILED") continue;
    assert.equal(result.commit.receipt.status, "COMPLETED");
    for (const field of ["accounts", "sourceAccount", "destinationAccount", "sourceBalance", "destinationBalance", "transactions"] as const)
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
