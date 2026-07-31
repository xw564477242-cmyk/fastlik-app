import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_TRANSACTION_PAGE_SIZE,
  WALLET_TRANSFER_STATUS_REFRESH_LIMIT,
  mergeWalletTransactionPages,
  parseWalletAccount,
  parseWalletAccounts,
  parseWalletBalance,
  parseWalletTransaction,
  parseWalletTransactionDetail,
  parseWalletTransactionPage,
  parseWalletTransferReceipt,
  walletHistoryRequestIsCurrent,
  walletRequestIsCurrent,
  walletOperationPath,
  walletTransactionDetailPath,
  walletTransactionDetailRequestIsCurrent,
  walletTransferStatusRequestIsCurrent,
  walletTransactionPath,
} from "../src/walletData.ts";

const rawAccount = (id: string): Record<string, unknown> => ({
  id,
  accountCode: `CUSTOMER-${id}`,
  name: "Primary Wallet",
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: "105.25",
  postedBalance: "100.25",
  pendingBalance: "5",
  availableBalance: "100.25",
  updatedAt: "2026-07-31T01:02:03.000Z",
  tenantId: "tenant-private",
  customerId: "customer-private",
  providerAccountId: "provider-private",
  metadata: { internal: true },
});

const rawBalance = (): Record<string, unknown> => ({
  accountId: "account-1",
  customerId: "customer-private",
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: "105.25",
  postedBalance: "100.25",
  pendingBalance: "5",
  holdBalance: "5",
  availableBalance: "100.25",
  updatedAt: "2026-07-31T01:02:03.000Z",
  ledgerAccountId: "ledger-private",
});

const rawTransaction = (id: string): Record<string, unknown> => ({
  id,
  type: "TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: "25.5",
  direction: "OUTGOING",
  createdAt: "2026-07-31T01:02:03.000Z",
  updatedAt: "2026-07-31T01:02:04.000Z",
  tenantId: "tenant-private",
  walletAccountId: "account-private",
  providerTransactionId: "provider-private",
  journalIds: ["journal-private"],
  referenceId: "operation-private",
  metadata: { providerPayload: true },
});

const rawTransferReceipt = (id = "operation-1"): Record<string, unknown> => ({
  id,
  type: "INTERNAL_TRANSFER",
  status: "PROCESSING",
  assetCode: "USD",
  amount: "25.5",
  direction: "OUTGOING",
  createdAt: "2026-07-31T01:02:03.000Z",
  completedAt: null,
  updatedAt: "2026-07-31T01:02:04.000Z",
  tenantId: "tenant-private",
  environment: "SANDBOX",
  idempotencyKey: "must-not-reach-ui",
  sourceAccountId: "source-private",
  destinationAccountId: "destination-private",
  journalIds: ["journal-private"],
  failureReason: "internal-private",
  providerPayload: { raw: true },
});

test("reconstructs Wallet accounts and balances from public allowlists only", () => {
  const account = parseWalletAccount(rawAccount("account-1"));
  const balance = parseWalletBalance(rawBalance());

  assert.deepEqual(Object.keys(account).sort(), [
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
  assert.deepEqual(Object.keys(balance).sort(), [
    "accountId",
    "assetCode",
    "availableBalance",
    "currentBalance",
    "holdBalance",
    "pendingBalance",
    "postedBalance",
    "status",
    "updatedAt",
  ]);
  for (const forbidden of ["tenantId", "customerId", "providerAccountId", "ledgerAccountId", "metadata"]) {
    assert.equal(forbidden in account, false);
    assert.equal(forbidden in balance, false);
  }
});

test("accepts an empty account list and rejects malformed account or balance fields", () => {
  assert.deepEqual(parseWalletAccounts([]), []);
  assert.throws(() => parseWalletAccounts({ items: [] }), /account list/);
  assert.throws(() => parseWalletAccount({ ...rawAccount("account-1"), status: "UNKNOWN" }), /status/);
  assert.throws(() => parseWalletAccounts([rawAccount("account-1"), rawAccount("account-1")]), /Duplicate/);
  assert.throws(() => parseWalletBalance({ ...rawBalance(), availableBalance: 100.25 }), /available balance/);
});

test("builds the bounded public customer Wallet history request", () => {
  assert.equal(WALLET_TRANSACTION_PAGE_SIZE, 25);
  assert.equal(
    walletTransactionPath("USD"),
    "/v1/wallet/transactions?assetCode=USD&limit=25",
  );
  assert.equal(
    walletTransactionPath("USDT", "opaque_cursor-1"),
    "/v1/wallet/transactions?assetCode=USDT&limit=25&cursor=opaque_cursor-1",
  );
  assert.throws(() => walletTransactionPath("usd"), /asset code/);
  assert.throws(() => walletTransactionPath("USD", "bad/cursor"), /cursor/);
});

test("reconstructs only public transaction fields and validates the opaque cursor", () => {
  const page = parseWalletTransactionPage({
    items: [rawTransaction("transaction-1")],
    nextCursor: "next_cursor-1",
  }, "USD");

  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    "amount",
    "assetCode",
    "createdAt",
    "direction",
    "id",
    "status",
    "type",
    "updatedAt",
  ]);
  for (const forbidden of ["tenantId", "walletAccountId", "providerTransactionId", "journalIds", "referenceId", "metadata"])
    assert.equal(forbidden in page.items[0], false);
  assert.equal(page.nextCursor, "next_cursor-1");
  assert.deepEqual(parseWalletTransactionPage({ items: [], nextCursor: null }), { items: [], nextCursor: null });
  assert.throws(() => parseWalletTransactionPage({ items: [], nextCursor: "bad/cursor" }), /cursor/);
  assert.throws(
    () => parseWalletTransactionPage({ items: [{ ...rawTransaction("transaction-1"), assetCode: "EUR" }], nextCursor: null }, "USD"),
    /selected asset/,
  );
  assert.throws(
    () => parseWalletTransactionPage({ items: [rawTransaction("transaction-1"), rawTransaction("transaction-1")], nextCursor: null }),
    /Duplicate/,
  );
  assert.throws(() => parseWalletTransaction({ ...rawTransaction("transaction-1"), type: "RAW" }), /type/);
  assert.throws(() => parseWalletTransaction({ ...rawTransaction("transaction-1"), direction: "BETWEEN" }), /direction/);
  assert.throws(() => parseWalletTransaction({ ...rawTransaction("transaction-1"), amount: "-1" }), /amount/);
});

test("reconstructs selected transaction detail and allows its status to evolve", () => {
  const selected = parseWalletTransaction(rawTransaction("transaction-1"));
  const detail = parseWalletTransactionDetail(
    { ...rawTransaction("transaction-1"), status: "REVERSED" },
    { transactionId: selected.id, assetCode: selected.assetCode, amount: selected.amount },
  );

  assert.equal(detail.status, "REVERSED");
  assert.deepEqual(Object.keys(detail).sort(), [
    "amount",
    "assetCode",
    "createdAt",
    "direction",
    "id",
    "status",
    "type",
    "updatedAt",
  ]);
  for (const forbidden of ["tenantId", "walletAccountId", "providerTransactionId", "journalIds", "referenceId", "metadata"])
    assert.equal(forbidden in detail, false);
});

test("fails closed when selected transaction identity, asset or amount changes", () => {
  const expected = { transactionId: "transaction-1", assetCode: "USD", amount: "25.5" };

  assert.throws(
    () => parseWalletTransactionDetail(rawTransaction("transaction-2"), expected),
    /detail id/,
  );
  assert.throws(
    () => parseWalletTransactionDetail({ ...rawTransaction("transaction-1"), assetCode: "EUR" }, expected),
    /detail asset/,
  );
  assert.throws(
    () => parseWalletTransactionDetail({ ...rawTransaction("transaction-1"), amount: "25.6" }, expected),
    /detail amount/,
  );
  assert.equal(
    parseWalletTransactionDetail(rawTransaction("transaction-1"), { ...expected, amount: "25.5000" }).amount,
    "25.5",
  );
});

test("builds only a validated public transaction detail path", () => {
  assert.equal(walletTransactionDetailPath("transaction:1"), "/v1/wallet/transactions/transaction%3A1");
  assert.throws(() => walletTransactionDetailPath("bad/id"), /transaction id/);
});

test("accepts only canonical absolute Decimal(36,18) Wallet history amounts", () => {
  for (const amount of [
    "0",
    "0.000000000000000001",
    "999999999999999999",
    "999999999999999999.999999999999999999",
  ])
    assert.equal(parseWalletTransaction({ ...rawTransaction("transaction-1"), amount }).amount, amount);

  for (const amount of [
    "00",
    "01",
    "00.1",
    "1000000000000000000",
    "1.0000000000000000000",
    "9999999999999999999.999999999999999999",
  ])
    assert.throws(
      () => parseWalletTransaction({ ...rawTransaction("transaction-1"), amount }),
      /transaction amount/,
    );
});

test("accepts RFC3339 Wallet history timestamps and rejects Date.parse pseudo-dates", () => {
  const boundary = parseWalletTransaction({
    ...rawTransaction("transaction-1"),
    createdAt: "2024-02-29T23:59:59.123456789+14:00",
    updatedAt: "2024-02-29T09:59:59Z",
  });
  assert.equal(boundary.createdAt, "2024-02-29T23:59:59.123456789+14:00");

  for (const createdAt of [
    "0",
    "2026-02-30T00:00:00Z",
    "2026-01-01 00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:00:00",
  ])
    assert.throws(
      () => parseWalletTransaction({ ...rawTransaction("transaction-1"), createdAt }),
      /transaction createdAt/,
    );
  assert.throws(
    () => parseWalletTransaction({ ...rawTransaction("transaction-1"), updatedAt: "0" }),
    /transaction updatedAt/,
  );
});

test("fails closed when Backend returns more than the requested transaction page", () => {
  assert.throws(
    () =>
      parseWalletTransactionPage({
        items: Array.from({ length: 26 }, (_, index) => rawTransaction(`transaction-${index}`)),
        nextCursor: "next_cursor-1",
      }),
    /exceeds the consumer limit/,
  );
});

test("merges transaction pages without duplicate ids", () => {
  const first = parseWalletTransaction(rawTransaction("transaction-1"));
  const updated = parseWalletTransaction({ ...rawTransaction("transaction-1"), status: "REVERSED" });
  const second = parseWalletTransaction(rawTransaction("transaction-2"));

  assert.deepEqual(
    mergeWalletTransactionPages([first], [updated, second]).map((item) => [item.id, item.status]),
    [
      ["transaction-1", "REVERSED"],
      ["transaction-2", "COMPLETED"],
    ],
  );
});

test("rejects a stale Account A response after Account B is selected", () => {
  const accountARequest = { requestId: 11, scopeKey: "scope-1", accountId: "account-a" };

  assert.equal(walletRequestIsCurrent(accountARequest, 12, "scope-1", "account-b"), false);
  assert.equal(walletRequestIsCurrent(accountARequest, 11, "scope-1", "account-b"), false);
});

test("rejects success, error and finally work after actor or tenant scope changes", () => {
  const oldScopeRequest = { requestId: 20, scopeKey: "actor-a|tenant-a", accountId: "account-a" };

  assert.equal(walletRequestIsCurrent(oldScopeRequest, 20, "actor-b|tenant-a", "account-a"), false);
  assert.equal(walletRequestIsCurrent(oldScopeRequest, 20, "actor-a|tenant-b", "account-a"), false);
  assert.equal(walletRequestIsCurrent(oldScopeRequest, 20, "actor-a|tenant-a", "account-a"), true);
});

test("rejects Wallet history work after asset, cursor, scope, or generation changes", () => {
  const request = {
    requestId: 7,
    scopeKey: "actor-a|tenant-a|customer-a|TEST",
    assetCode: "USD",
    cursor: "cursor-a",
  };

  assert.equal(walletHistoryRequestIsCurrent(request, 7, request.scopeKey, "USD", "cursor-a"), true);
  assert.equal(walletHistoryRequestIsCurrent(request, 8, request.scopeKey, "USD", "cursor-a"), false);
  assert.equal(walletHistoryRequestIsCurrent(request, 7, "scope-b", "USD", "cursor-a"), false);
  assert.equal(walletHistoryRequestIsCurrent(request, 7, request.scopeKey, "EUR", "cursor-a"), false);
  assert.equal(walletHistoryRequestIsCurrent(request, 7, request.scopeKey, "USD", "cursor-b"), false);
});

test("rejects transaction detail work after transaction, asset, scope, or generation changes", () => {
  const request = {
    requestId: 9,
    scopeKey: "actor-a|tenant-a|customer-a|TEST",
    assetCode: "USD",
    transactionId: "transaction-1",
  };

  assert.equal(walletTransactionDetailRequestIsCurrent(request, 9, request.scopeKey, "USD", "transaction-1"), true);
  assert.equal(walletTransactionDetailRequestIsCurrent(request, 10, request.scopeKey, "USD", "transaction-1"), false);
  assert.equal(walletTransactionDetailRequestIsCurrent(request, 9, "scope-b", "USD", "transaction-1"), false);
  assert.equal(walletTransactionDetailRequestIsCurrent(request, 9, request.scopeKey, "EUR", "transaction-1"), false);
  assert.equal(walletTransactionDetailRequestIsCurrent(request, 9, request.scopeKey, "USD", "transaction-2"), false);
});

test("parses a typed transfer receipt from the public operation allowlist only", () => {
  const receipt = parseWalletTransferReceipt(rawTransferReceipt(), {
    assetCode: "USD",
    amount: "025.5000",
  });

  assert.deepEqual(Object.keys(receipt).sort(), [
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
  for (const forbidden of [
    "tenantId",
    "environment",
    "idempotencyKey",
    "sourceAccountId",
    "destinationAccountId",
    "journalIds",
    "failureReason",
    "providerPayload",
  ])
    assert.equal(forbidden in receipt, false);
});

test("accepts only existing public transfer status values and matching request fields", () => {
  for (const status of ["PROCESSING", "PENDING_SETTLEMENT", "COMPLETED", "FAILED"])
    assert.equal(parseWalletTransferReceipt({ ...rawTransferReceipt(), status }).status, status);
  assert.throws(() => parseWalletTransferReceipt({ ...rawTransferReceipt(), status: "SETTLED" }), /status/);
  assert.throws(() => parseWalletTransferReceipt({ ...rawTransferReceipt(), type: "TREASURY_RESERVE" }), /type/);
  assert.throws(() => parseWalletTransferReceipt(rawTransferReceipt("bad/id")), /operation id/);
  assert.throws(
    () => parseWalletTransferReceipt(rawTransferReceipt(), { assetCode: "EUR" }),
    /asset/,
  );
  assert.throws(
    () => parseWalletTransferReceipt(rawTransferReceipt(), { amount: "25.6" }),
    /amount/,
  );
  assert.throws(
    () => parseWalletTransferReceipt(rawTransferReceipt(), { operationId: "operation-2" }),
    /requested operation/,
  );
});

test("builds only a validated existing operation status path", () => {
  assert.equal(WALLET_TRANSFER_STATUS_REFRESH_LIMIT, 5);
  assert.equal(walletOperationPath("operation:1"), "/v1/wallet/operations/operation%3A1");
  assert.throws(() => walletOperationPath("bad/id"), /operation id/);
});

test("rejects stale transfer status after source account, scope, operation, or generation changes", () => {
  const request = {
    requestId: 4,
    scopeKey: "actor-a|tenant-a|customer-a|TEST",
    accountId: "account-a",
    operationId: "operation-a",
  };

  assert.equal(
    walletTransferStatusRequestIsCurrent(
      request,
      4,
      request.scopeKey,
      request.accountId,
      request.operationId,
    ),
    true,
  );
  assert.equal(walletTransferStatusRequestIsCurrent(request, 5, request.scopeKey, request.accountId, request.operationId), false);
  assert.equal(walletTransferStatusRequestIsCurrent(request, 4, "scope-b", request.accountId, request.operationId), false);
  assert.equal(walletTransferStatusRequestIsCurrent(request, 4, request.scopeKey, "account-b", request.operationId), false);
  assert.equal(walletTransferStatusRequestIsCurrent(request, 4, request.scopeKey, request.accountId, "operation-b"), false);
});
