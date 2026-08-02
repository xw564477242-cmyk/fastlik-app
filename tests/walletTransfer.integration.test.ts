import assert from "node:assert/strict";
import test from "node:test";
import {
  beginWalletTransferSubmit,
  createWalletTransferRequestIdentity,
  readWalletTransferAccounts,
  readWalletTransferStatus,
  settleWalletTransferSubmit,
  submitWalletTransfer,
  walletTransferFailureIsAmbiguous,
  walletTransferRequestIsCurrent,
  walletTransferRetryKey,
  walletTransferSessionScope,
  type WalletTransferTransportRequest,
} from "../src/walletTransfer.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment =
  configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
    ? configuredEnvironment
    : null;
const integration = environment ? test : test.skip;
const expiresAt = "2099-08-01T08:00:00.000Z";

const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-integration-01",
  tenantId: "tenant-integration-01",
  customerId: "customer-integration-01",
  environment: environment!,
  expiresAt,
  ...overrides,
});

const account = (id: string, availableBalance = "100") => ({
  id,
  accountCode: `ACCOUNT-${id}`,
  name: `Wallet ${id}`,
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: availableBalance,
  postedBalance: availableBalance,
  pendingBalance: "0",
  availableBalance,
  updatedAt: "2026-08-01T00:00:00.000Z",
});

const receipt = (status = "PROCESSING") =>
  JSON.stringify({
    id: "operation-integration-01",
    type: "INTERNAL_TRANSFER",
    status,
    assetCode: "USD",
    amount: "25",
    direction: "OUTGOING",
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: status === "COMPLETED" ? "2026-08-01T00:01:00.000Z" : null,
    updatedAt:
      status === "COMPLETED"
        ? "2026-08-01T00:01:00.000Z"
        : "2026-08-01T00:00:00.000Z",
  });

integration(`Internal transfer exact consumer (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: WalletTransferTransportRequest[] = [];
  const accountsWire = [account("account-source-01"), account("account-destination-02")];
  const transport = async (request: WalletTransferTransportRequest) => {
    calls.push(request);
    return request.method === "GET" && request.path === "/v1/wallet/accounts"
      ? JSON.stringify(accountsWire)
      : receipt();
  };
  const currentSession = session();
  const accounts = await readWalletTransferAccounts(transport, currentSession, environment!);
  const key = "123e4567-e89b-42d3-a456-426614174000";
  const input = {
    sourceAccountId: accounts[0].id,
    destinationAccountId: accounts[1].id,
    assetCode: "USD",
    amount: "25",
  };
  const operation = await submitWalletTransfer(
    transport,
    currentSession,
    environment!,
    accounts,
    input,
    key,
  );
  assert.deepEqual(calls, [
    { path: "/v1/wallet/accounts", method: "GET" },
    { path: "/v1/wallet/transfers", method: "POST", body: input, idempotencyKey: key },
  ]);
  assert.deepEqual(Object.keys(operation).sort(), [
    "amount",
    "assetCode",
    "completedAt",
    "createdAt",
    "direction",
    "id",
    "status",
    "type",
    "updatedAt",
  ]);
});

integration("uses one request per action, never retries, and a same-key replay is idempotent", async () => {
  const calls: WalletTransferTransportRequest[] = [];
  const cache = new Map<string, string>();
  const transport = async (request: WalletTransferTransportRequest) => {
    calls.push(request);
    if (request.method !== "POST" || !request.idempotencyKey) throw new Error("unexpected call");
    if (!cache.has(request.idempotencyKey)) cache.set(request.idempotencyKey, receipt());
    return cache.get(request.idempotencyKey)!;
  };
  const accounts = [account("account-source-01"), account("account-destination-02")];
  const input = {
    sourceAccountId: accounts[0].id,
    destinationAccountId: accounts[1].id,
    assetCode: "USD",
    amount: "25",
  };
  const key = "123e4567-e89b-42d3-a456-426614174000";
  const first = await submitWalletTransfer(transport, session(), environment!, accounts, input, key);
  const replay = await submitWalletTransfer(transport, session(), environment!, accounts, input, key);
  assert.deepEqual(replay, first);
  assert.equal(calls.length, 2);
  assert.equal(cache.size, 1);
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginWalletTransferSubmit(gate, 1), true);
  assert.equal(beginWalletTransferSubmit(gate, 2), false);
  assert.equal(settleWalletTransferSubmit(gate, 1), true);
});

integration("an uncertain response permits only an exact same-key manual retry", async () => {
  const accounts = [account("account-source-01"), account("account-destination-02")];
  const currentSession = session();
  const scope = walletTransferSessionScope(currentSession, environment!)!;
  const input = {
    sourceAccountId: accounts[0].id,
    destinationAccountId: accounts[1].id,
    assetCode: "USD",
    amount: "25",
  };
  const key = "123e4567-e89b-42d3-a456-426614174000";
  const request = createWalletTransferRequestIdentity(1, scope, accounts[0], accounts[1], input, key);
  const calls: WalletTransferTransportRequest[] = [];
  const uncertainTransport = async (transportRequest: WalletTransferTransportRequest) => {
    calls.push(transportRequest);
    throw { status: 408 };
  };
  await assert.rejects(
    submitWalletTransfer(uncertainTransport, currentSession, environment!, accounts, input, key),
    (value) => walletTransferFailureIsAmbiguous(value),
  );
  const retryKey = walletTransferRetryKey(request, scope, accounts, accounts[0], input);
  assert.equal(retryKey, key);
  assert.ok(retryKey);
  const replayTransport = async (transportRequest: WalletTransferTransportRequest) => {
    calls.push(transportRequest);
    return receipt();
  };
  await submitWalletTransfer(replayTransport, currentSession, environment!, accounts, input, retryKey);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey);
});

integration("a late old-session 401 cannot invalidate a replacement session", () => {
  const accounts = [account("account-source-01"), account("account-destination-02")];
  const oldScope = walletTransferSessionScope(session(), environment!)!;
  const replacementScope = walletTransferSessionScope(
    session({ actorId: "actor-replacement-02", expiresAt: "2099-08-01T09:00:00.000Z" }),
    environment!,
  )!;
  const request = createWalletTransferRequestIdentity(
    1,
    oldScope,
    accounts[0],
    accounts[1],
    {
      sourceAccountId: accounts[0].id,
      destinationAccountId: accounts[1].id,
      assetCode: "USD",
      amount: "25",
    },
    "123e4567-e89b-42d3-a456-426614174000",
  );
  const oldRequestIsCurrent = walletTransferRequestIsCurrent(
    request,
    2,
    replacementScope,
    accounts,
    accounts[0],
  );
  let replacementSessionClears = 0;
  if (oldRequestIsCurrent && sessionFailureRequiresClear({ status: 401 }))
    replacementSessionClears += 1;
  assert.equal(oldRequestIsCurrent, false);
  assert.equal(replacementSessionClears, 0);
});

integration("denies mismatch and expiry before transport and rejects stale completion writes", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return "[]";
  };
  await assert.rejects(
    readWalletTransferAccounts(
      transport,
      session({ environment: environment === "SANDBOX" ? "TEST" : "SANDBOX" }),
      environment!,
    ),
    /unavailable/,
  );
  await assert.rejects(
    readWalletTransferAccounts(
      transport,
      session({ expiresAt: "2020-01-01T00:00:00.000Z" }),
      environment!,
    ),
    /unavailable/,
  );
  assert.equal(calls, 0);

  const accounts = [account("account-source-01"), account("account-destination-02")];
  const scope = walletTransferSessionScope(session(), environment!)!;
  const request = createWalletTransferRequestIdentity(
    1,
    scope,
    accounts[0],
    accounts[1],
    {
      sourceAccountId: accounts[0].id,
      destinationAccountId: accounts[1].id,
      assetCode: "USD",
      amount: "25",
    },
    "123e4567-e89b-42d3-a456-426614174000",
  );
  assert.equal(walletTransferRequestIsCurrent(request, 1, scope, accounts, accounts[0]), true);
  assert.equal(walletTransferRequestIsCurrent(request, 1, null, [], null), false);
});

integration("reads status once from the immutable operation path and rejects internal fields", async () => {
  const calls: WalletTransferTransportRequest[] = [];
  const transport = async (request: WalletTransferTransportRequest) => {
    calls.push(request);
    return receipt("COMPLETED");
  };
  const previous = JSON.parse(receipt()) as Parameters<typeof readWalletTransferStatus>[3];
  const result = await readWalletTransferStatus(
    transport,
    session(),
    environment!,
    previous,
  );
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(calls, [
    { path: "/v1/wallet/operations/operation-integration-01", method: "GET" },
  ]);

  const unsafeTransport = async () =>
    JSON.stringify({ ...JSON.parse(receipt("COMPLETED")), providerTrace: "private" });
  await assert.rejects(
    readWalletTransferStatus(unsafeTransport, session(), environment!, previous),
    /fields/,
  );
});
