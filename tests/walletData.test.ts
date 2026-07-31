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
  parseWalletTransactionPage,
  parseWalletTransferReceipt,
  walletRequestIsCurrent,
  walletOperationPath,
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
  createdAt: "2026-07-31T01:02:03.000Z",
  tenantId: "tenant-private",
  walletAccountId: "account-private",
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

test("builds a bounded account transaction request", () => {
  assert.equal(WALLET_TRANSACTION_PAGE_SIZE, 25);
  assert.equal(
    walletTransactionPath("account/1"),
    "/v1/wallet/accounts/account%2F1/transactions?limit=25&offset=0",
  );
  assert.equal(
    walletTransactionPath("account-1", 25),
    "/v1/wallet/accounts/account-1/transactions?limit=25&offset=25",
  );
  assert.throws(() => walletTransactionPath("account-1", -1), /offset/);
});

test("reconstructs only public transaction fields and validates pagination", () => {
  const page = parseWalletTransactionPage({
    items: [rawTransaction("transaction-1")],
    pagination: { total: 2, limit: 25, offset: 0, hasMore: true },
  });

  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    "amount",
    "assetCode",
    "createdAt",
    "id",
    "status",
    "type",
  ]);
  for (const forbidden of ["tenantId", "walletAccountId", "referenceId", "metadata"])
    assert.equal(forbidden in page.items[0], false);
  assert.throws(
    () => parseWalletTransactionPage({ items: [], pagination: { total: 0, limit: 25, offset: 0 } }),
    /hasMore/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPage(
        { items: [], pagination: { total: 50, limit: 25, offset: 0, hasMore: true } },
        25,
      ),
    /offset/,
  );
  assert.throws(() => parseWalletTransaction({ ...rawTransaction("transaction-1"), type: "RAW" }), /type/);
});

test("fails closed when Backend returns more than the requested transaction page", () => {
  assert.throws(
    () =>
      parseWalletTransactionPage({
        items: Array.from({ length: 26 }, (_, index) => rawTransaction(`transaction-${index}`)),
        pagination: { total: 26, limit: 25, offset: 0, hasMore: true },
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
