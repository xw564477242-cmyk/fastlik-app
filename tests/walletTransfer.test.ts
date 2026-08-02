import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES,
  WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES,
  beginWalletTransferSubmit,
  createWalletTransferRequestIdentity,
  normalizeWalletTransferInput,
  parseWalletTransferAccountsRaw,
  parseWalletTransferReceiptRaw,
  settleWalletTransferSubmit,
  validateWalletTransferIdempotencyKey,
  walletTransferFailureIsAmbiguous,
  walletTransferRequestIsCurrent,
  walletTransferRetryKey,
  walletTransferSessionScope,
} from "../src/walletTransfer.ts";

const future = "2099-08-01T08:00:00.000Z";
const createdAt = "2026-08-01T00:00:00.000Z";

const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-transfer-01",
  tenantId: "tenant-transfer-01",
  customerId: "customer-transfer-01",
  environment: "SANDBOX" as const,
  expiresAt: future,
  ...overrides,
});

const account = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  accountCode: `ACCOUNT-${id}`,
  name: `Wallet ${id}`,
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: "105.25",
  postedBalance: "100.25",
  pendingBalance: "5",
  availableBalance: "100.25",
  updatedAt: createdAt,
  ...overrides,
});

const receipt = (overrides: Record<string, unknown> = {}) => ({
  id: "operation-transfer-01",
  type: "INTERNAL_TRANSFER",
  status: "PROCESSING",
  assetCode: "USD",
  amount: "25.5",
  direction: "OUTGOING",
  createdAt,
  completedAt: null,
  updatedAt: createdAt,
  ...overrides,
});

const input = {
  sourceAccountId: "account-source-01",
  destinationAccountId: "account-destination-02",
  assetCode: "USD",
  amount: "25.5",
};

test("allows only matching unexpired SANDBOX/TEST scopes and binds every identity field", () => {
  const original = walletTransferSessionScope(session(), "SANDBOX");
  assert.ok(original);
  assert.ok(walletTransferSessionScope(session({ environment: "TEST" }), "TEST"));
  assert.equal(walletTransferSessionScope(session(), "TEST"), null);
  assert.equal(walletTransferSessionScope(session(), "PRODUCTION"), null);
  assert.equal(
    walletTransferSessionScope(session({ expiresAt: "2020-01-01T00:00:00.000Z" }), "SANDBOX"),
    null,
  );
  assert.equal(walletTransferSessionScope(session({ expiresAt: undefined }), "SANDBOX"), null);
  for (const changed of [
    session({ actorId: "actor-transfer-02" }),
    session({ tenantId: "tenant-transfer-02" }),
    session({ customerId: "customer-transfer-02" }),
    session({ expiresAt: "2099-08-01T09:00:00.000Z" }),
  ])
    assert.notEqual(walletTransferSessionScope(changed, "SANDBOX"), original);
});

test("accepts only bounded exact account JSON and validates ledger balances", () => {
  const parsed = parseWalletTransferAccountsRaw(
    JSON.stringify([account("account-source-01"), account("account-destination-02")]),
  );
  assert.equal(parsed.length, 2);
  assert.deepEqual(Object.keys(parsed[0]).sort(), [
    "accountCode",
    "assetCode",
    "availableBalance",
    "currentBalance",
    "id",
    "name",
    "pendingBalance",
    "postedBalance",
    "status",
    "updatedAt",
  ]);
  assert.throws(
    () =>
      parseWalletTransferAccountsRaw(
        JSON.stringify([account("account-source-01", { providerAccountId: "private" })]),
      ),
    /fields/,
  );
  assert.throws(
    () =>
      parseWalletTransferAccountsRaw(
        JSON.stringify([account("account-source-01", { currentBalance: "999" })]),
      ),
    /balance/,
  );
  assert.throws(
    () =>
      parseWalletTransferAccountsRaw(
        JSON.stringify([account("account-source-01", { availableBalance: "101" })]),
      ),
    /available balance/,
  );
  assert.throws(
    () =>
      parseWalletTransferAccountsRaw(
        JSON.stringify([account("account-source-01", { availableBalance: "100" })]),
      ),
    /available balance/,
  );
  assert.throws(
    () => parseWalletTransferAccountsRaw("x".repeat(WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES + 1)),
    /limit/,
  );
});

test("rejects duplicate account JSON keys before parsing, including escaped equivalents", () => {
  const encoded = JSON.stringify(account("account-source-01"));
  assert.throws(
    () => parseWalletTransferAccountsRaw(`[${encoded.slice(0, -1)},"name":"Duplicate"}]`),
    /Duplicate.*key/,
  );
  assert.throws(
    () =>
      parseWalletTransferAccountsRaw(
        `[${encoded.slice(0, -1)},"na\\u006de":"Duplicate"}]`,
      ),
    /Duplicate.*key/,
  );
});

test("requires trimmed control-free account text bounded by UTF-8 bytes", () => {
  for (const name of ["", "   ", " Wallet", "Wallet ", "Wallet\u0000Name", "Wallet\u007fName"])
    assert.throws(
      () =>
        parseWalletTransferAccountsRaw(
          JSON.stringify([account("account-source-01", { name })]),
        ),
      /account name/,
    );
  assert.throws(
    () =>
      parseWalletTransferAccountsRaw(
        JSON.stringify([account("account-source-01", { name: "界".repeat(41) })]),
      ),
    /account name/,
  );
  assert.equal(
    parseWalletTransferAccountsRaw(
      JSON.stringify([account("account-source-01", { name: "界".repeat(40) })]),
    )[0].name,
    "界".repeat(40),
  );
});

test("rejects hostile raw containers before invoking any Proxy trap", () => {
  let traps = 0;
  const hostile = new Proxy(
    {},
    {
      get() {
        traps += 1;
        throw new Error("must not execute");
      },
      ownKeys() {
        traps += 1;
        throw new Error("must not execute");
      },
      getPrototypeOf() {
        traps += 1;
        throw new Error("must not execute");
      },
    },
  );
  assert.throws(() => parseWalletTransferAccountsRaw(hostile), /raw response/);
  assert.throws(() => parseWalletTransferReceiptRaw(hostile, input), /raw response/);
  assert.equal(traps, 0);
});

test("normalizes only an owned same-asset affordable transfer input without getters", () => {
  const accounts = parseWalletTransferAccountsRaw(
    JSON.stringify([account("account-source-01"), account("account-destination-02")]),
  );
  assert.deepEqual(normalizeWalletTransferInput({ ...input, amount: "25.5000" }, accounts), input);
  assert.throws(
    () => normalizeWalletTransferInput({ ...input, destinationAccountId: "outside" }, accounts),
    /outside/,
  );
  assert.throws(
    () => normalizeWalletTransferInput({ ...input, amount: "101" }, accounts),
    /available balance/,
  );
  assert.throws(
    () =>
      normalizeWalletTransferInput(input, [
        accounts[0],
        { ...accounts[1], assetCode: "EUR" },
      ]),
    /asset/,
  );
  let getterReads = 0;
  const accessor = Object.defineProperty({ ...input }, "amount", {
    enumerable: true,
    get() {
      getterReads += 1;
      return "1";
    },
  });
  assert.throws(() => normalizeWalletTransferInput(accessor, accounts), /field/);
  assert.equal(getterReads, 0);
});

test("requires one canonical UUIDv4 and synchronously locks duplicate submits", () => {
  const firstKey = "123e4567-e89b-42d3-a456-426614174000";
  const secondKey = "123e4567-e89b-42d3-b456-426614174001";
  assert.equal(validateWalletTransferIdempotencyKey(firstKey), firstKey);
  assert.notEqual(firstKey, secondKey);
  for (const invalid of ["short", "123e4567-e89b-12d3-a456-426614174000", firstKey.toUpperCase()])
    assert.throws(() => validateWalletTransferIdempotencyKey(invalid), /idempotency/);
  const gate = { activeRequestId: null as number | null };
  assert.equal(beginWalletTransferSubmit(gate, 1), true);
  assert.equal(beginWalletTransferSubmit(gate, 2), false);
  assert.equal(settleWalletTransferSubmit(gate, 2), false);
  assert.equal(settleWalletTransferSubmit(gate, 1), true);
  assert.equal(beginWalletTransferSubmit(gate, 2), true);
});

test("reuses an ambiguous retry key only for the exact session, source version and input", () => {
  const accounts = parseWalletTransferAccountsRaw(
    JSON.stringify([account("account-source-01"), account("account-destination-02")]),
  );
  const scope = walletTransferSessionScope(session(), "SANDBOX")!;
  const key = "123e4567-e89b-42d3-a456-426614174000";
  const retry = createWalletTransferRequestIdentity(1, scope, accounts[0], input, key);
  assert.equal(walletTransferRetryKey(retry, scope, accounts, accounts[0], input), key);
  assert.equal(walletTransferRetryKey(retry, "replacement-session", accounts, accounts[0], input), null);
  assert.equal(walletTransferRetryKey(retry, scope, [{ ...accounts[0], updatedAt: future }, accounts[1]], { ...accounts[0], updatedAt: future }, input), null);
  assert.equal(walletTransferRetryKey(retry, scope, accounts, accounts[0], { ...input, destinationAccountId: accounts[0].id }), null);
  assert.equal(walletTransferRetryKey(retry, scope, accounts, accounts[0], { ...input, amount: "26" }), null);
});

test("classifies only network, timeout and 5xx transfer failures as ambiguous without invoking getters", () => {
  for (const status of [0, 408, 500, 502, 599])
    assert.equal(walletTransferFailureIsAmbiguous({ status }), true);
  for (const status of [400, 401, 403, 404, 409, 600])
    assert.equal(walletTransferFailureIsAmbiguous({ status }), false);
  let reads = 0;
  const accessor = Object.defineProperty({}, "status", { get() { reads += 1; return 500; } });
  assert.equal(walletTransferFailureIsAmbiguous(accessor), false);
  assert.equal(reads, 0);
});

test("accepts only the exact bounded public receipt and rejects internal fields", () => {
  const parsed = parseWalletTransferReceiptRaw(JSON.stringify(receipt()), input);
  assert.deepEqual(Object.keys(parsed).sort(), [
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
  for (const field of ["providerPayload", "journalIds", "traceId", "secret", "internalId"])
    assert.throws(
      () => parseWalletTransferReceiptRaw(JSON.stringify(receipt({ [field]: "private" })), input),
      /fields/,
    );
  assert.throws(
    () => parseWalletTransferReceiptRaw("x".repeat(WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES + 1), input),
    /limit/,
  );
  assert.throws(
    () => parseWalletTransferReceiptRaw(JSON.stringify(receipt({ amount: "25.6" })), input),
    /match/,
  );
  assert.throws(
    () =>
      parseWalletTransferReceiptRaw(
        JSON.stringify(receipt({ updatedAt: "2026-07-31T23:59:59.000Z" })),
        input,
      ),
    /time order/,
  );
});

test("rejects duplicate receipt JSON keys at every object level and after escape decoding", () => {
  const encoded = JSON.stringify(receipt());
  assert.throws(
    () => parseWalletTransferReceiptRaw(`${encoded.slice(0, -1)},"status":"FAILED"}`, input),
    /Duplicate.*key/,
  );
  assert.throws(
    () =>
      parseWalletTransferReceiptRaw(
        `${encoded.slice(0, -1)},"sta\\u0074us":"FAILED"}`,
        input,
      ),
    /Duplicate.*key/,
  );
  assert.throws(
    () =>
      parseWalletTransferReceiptRaw(
        `${encoded.slice(0, -1)},"metadata":{"trace":"one","tr\\u0061ce":"two"}}`,
        input,
      ),
    /Duplicate.*key/,
  );
});

test("status refresh binds immutable fields and only permits forward status", () => {
  const previous = parseWalletTransferReceiptRaw(JSON.stringify(receipt()), input);
  const completed = parseWalletTransferReceiptRaw(
    JSON.stringify(
      receipt({
        status: "COMPLETED",
        completedAt: "2026-08-01T00:01:00.000Z",
        updatedAt: "2026-08-01T00:01:00.000Z",
      }),
    ),
    previous,
  );
  assert.equal(completed.status, "COMPLETED");
  assert.throws(
    () =>
      parseWalletTransferReceiptRaw(
        JSON.stringify(receipt({ id: "operation-transfer-02" })),
        previous,
      ),
    /immutable/,
  );
  assert.throws(
    () => parseWalletTransferReceiptRaw(JSON.stringify(receipt()), completed),
    /backwards/,
  );
});

test("rejects stale success, error, and finally after every source scope version changes", () => {
  const accounts = parseWalletTransferAccountsRaw(
    JSON.stringify([account("account-source-01"), account("account-destination-02")]),
  );
  const scope = walletTransferSessionScope(session(), "SANDBOX")!;
  const request = createWalletTransferRequestIdentity(
    1,
    scope,
    accounts[0],
    input,
    "123e4567-e89b-42d3-a456-426614174000",
  );
  assert.equal(walletTransferRequestIsCurrent(request, 1, scope, accounts, accounts[0]), true);
  assert.equal(walletTransferRequestIsCurrent(request, 2, scope, accounts, accounts[0]), false);
  assert.equal(walletTransferRequestIsCurrent(request, 1, "other", accounts, accounts[0]), false);
  assert.equal(
    walletTransferRequestIsCurrent(
      request,
      1,
      scope,
      [{ ...accounts[0], availableBalance: "90" }, accounts[1]],
      { ...accounts[0], availableBalance: "90" },
    ),
    false,
  );
  assert.equal(walletTransferRequestIsCurrent(request, 1, scope, [accounts[0]], accounts[0]), false);
  assert.equal(walletTransferRequestIsCurrent(request, 1, scope, accounts, null), false);
});
