import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWalletAccountTransactionPageRaw,
  readWalletAccountTransactionHistory,
  walletAccountTransactionPath,
} from "../src/walletTransactions.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment = configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
  ? configuredEnvironment
  : null;
const integration = environment ? test : test.skip;

const filters = Object.freeze({
  type: "TRANSFER" as const,
  status: "COMPLETED" as const,
  assetCode: "USD",
  limit: 2,
});

const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-account-history-r52",
  tenantId: "tenant-account-history-r52",
  customerId: "customer-account-history-r52",
  environment: environment ?? "SANDBOX",
  expiresAt: "2099-08-03T00:00:00.000Z",
  ...overrides,
});

const account = (id = "account-source-r52", assetCode = "USD") => ({ id, assetCode });
const signedCursor = "Y3Vyc29yLXBhZ2UtMg.c2lnbmF0dXJlLXBhZ2UtMg";

const item = (
  id: string,
  createdAt: string,
  direction: "OUTGOING" | "INCOMING" = "OUTGOING",
  operationId: string | null = "operation-transfer-r52",
) => ({
  id,
  type: "TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: "25",
  direction,
  createdAt,
  updatedAt: createdAt,
  operationId,
});

const raw = (items: unknown[], nextCursor: string | null = null) =>
  JSON.stringify({ items, nextCursor });

test("builds only the exact encoded owned-account transaction path", () => {
  assert.equal(
    walletAccountTransactionPath("account-source-r52", filters),
    "/v1/wallet/accounts/account-source-r52/transactions?type=TRANSFER&status=COMPLETED&assetCode=USD&limit=2",
  );
  assert.equal(
    walletAccountTransactionPath("account-source-r52", filters, signedCursor),
    `/v1/wallet/accounts/account-source-r52/transactions?type=TRANSFER&status=COMPLETED&assetCode=USD&limit=2&cursor=${signedCursor}`,
  );
  assert.throws(() => walletAccountTransactionPath("../outside", filters), /id/);
  assert.throws(() => walletAccountTransactionPath("account-source-r52", filters, "not/signed"), /cursor/);
  for (const cursor of ["legacy", ".YQ", "YQ.", "YQ.Yg.Yw", "YQ.Yg!"])
    assert.throws(() => walletAccountTransactionPath("account-source-r52", filters, cursor), /cursor/);
});

test("requires the exact public operation association and rejects private or duplicate fields", () => {
  const parsed = parseWalletAccountTransactionPageRaw(
    raw([item("transaction-source-r52", "2026-08-03T00:01:00.000Z")]),
    filters,
  );
  assert.equal(parsed.items[0].operationId, "operation-transfer-r52");
  assert.equal(
    parseWalletAccountTransactionPageRaw(
      raw([item("transaction-unassociated-r52", "2026-08-03T00:00:00.000Z", "OUTGOING", null)]),
      filters,
    ).items[0].operationId,
    null,
  );
  assert.deepEqual(Object.keys(parsed.items[0]).sort(), [
    "amount",
    "assetCode",
    "createdAt",
    "direction",
    "id",
    "operationId",
    "status",
    "type",
    "updatedAt",
  ]);
  const { operationId: _operationId, ...withoutOperation } = item(
    "transaction-source-r52",
    "2026-08-03T00:01:00.000Z",
  );
  assert.throws(
    () => parseWalletAccountTransactionPageRaw(raw([withoutOperation]), filters),
    /fields/,
  );
  assert.throws(
    () => parseWalletAccountTransactionPageRaw(raw([{ ...item("transaction-source-r52", "2026-08-03T00:01:00.000Z"), accountId: "private" }]), filters),
    /fields/,
  );
  const valid = JSON.stringify(item("transaction-source-r52", "2026-08-03T00:01:00.000Z"));
  const duplicateOperation = valid.replace(
    '"operationId":"operation-transfer-r52"',
    '"operationId":"operation-transfer-r52","operationId":"operation-other-r52"',
  );
  assert.throws(
    () => parseWalletAccountTransactionPageRaw(`{"items":[${duplicateOperation}],"nextCursor":null}`, filters),
    /Duplicate/,
  );
});

integration(`reads one account-bound first page and preserves the operation association (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const calls: string[] = [];
  const history = await readWalletAccountTransactionHistory(
    async request => {
      calls.push(request.path);
      return raw([item("transaction-source-r52", "2026-08-03T00:01:00.000Z")]);
    },
    session(),
    environment!,
    account(),
    filters,
  );
  assert.equal(history.accountId, "account-source-r52");
  assert.equal(history.items[0].operationId, "operation-transfer-r52");
  assert.deepEqual(calls, [
    "/v1/wallet/accounts/account-source-r52/transactions?type=TRANSFER&status=COMPLETED&assetCode=USD&limit=2",
  ]);
});

integration("binds an opaque signed cursor to the same account and rejects cross-account reuse before transport", async () => {
  const calls: string[] = [];
  const transport = async ({ path }: { path: string }) => {
    calls.push(path);
    return path.includes(`cursor=${signedCursor}`)
      ? raw([item("transaction-older-r52", "2026-08-03T00:00:00.000Z")])
      : raw([
          item("transaction-newest-r52", "2026-08-03T00:02:00.000Z"),
          item("transaction-middle-r52", "2026-08-03T00:01:00.000Z"),
        ], signedCursor);
  };
  const first = await readWalletAccountTransactionHistory(
    transport,
    session(),
    environment!,
    account(),
    filters,
  );
  const second = await readWalletAccountTransactionHistory(
    transport,
    session(),
    environment!,
    account(),
    filters,
    first,
  );
  assert.deepEqual(second.items.map(row => row.id), [
    "transaction-newest-r52",
    "transaction-middle-r52",
    "transaction-older-r52",
  ]);
  assert.match(calls[1], new RegExp(`account-source-r52/transactions.*cursor=${signedCursor.replace(".", "\\.")}`));
  const before = calls.length;
  await assert.rejects(
    readWalletAccountTransactionHistory(
      transport,
      session(),
      environment!,
      account("account-destination-r52"),
      filters,
      first,
    ),
    /account or filters changed/,
  );
  assert.equal(calls.length, before);
});

integration("blocks environment, asset, expiry and cancellation mismatches before committing a page", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return raw([item("transaction-source-r52", "2026-08-03T00:01:00.000Z")]);
  };
  await assert.rejects(
    readWalletAccountTransactionHistory(transport, session({ environment: "TEST" }), "SANDBOX", account(), filters),
    /session/,
  );
  await assert.rejects(
    readWalletAccountTransactionHistory(transport, session(), environment!, account("account-source-r52", "EUR"), filters),
    /account asset/,
  );
  await assert.rejects(
    readWalletAccountTransactionHistory(transport, session({ expiresAt: "2020-01-01T00:00:00.000Z" }), environment!, account(), filters),
    /session/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readWalletAccountTransactionHistory(transport, session(), environment!, account(), filters, null, controller.signal),
    /cancelled/,
  );
  assert.equal(calls, 0);
});

integration("rejects a late page when the exact session expires while the request is in flight", async () => {
  const activeSession = session();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const operation = readWalletAccountTransactionHistory(
    async () => {
      await pending;
      return raw([item("transaction-source-r52", "2026-08-03T00:01:00.000Z")]);
    },
    activeSession,
    environment!,
    account(),
    filters,
  );
  activeSession.expiresAt = "2020-01-01T00:00:00.000Z";
  release();
  await assert.rejects(operation, /expired/);
});
