import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_OPERATION_PAGE_SIZE,
  mergeWalletOperationPages,
  parseWalletOperation,
  parseWalletOperationPage,
  walletOperationActivityPath,
  walletOperationActivityRequestIsCurrent,
} from "../src/walletOperations.ts";

const rawOperation = (id = "operation-1"): Record<string, unknown> => ({
  id,
  type: "INTERNAL_TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: "25.5",
  direction: "BETWEEN_OWN_ACCOUNTS",
  createdAt: "2026-07-31T01:02:03.000Z",
  completedAt: "2026-07-31T01:02:04.000Z",
  updatedAt: "2026-07-31T01:02:04.000Z",
  tenantId: "tenant-private",
  customerId: "customer-private",
  environment: "TEST",
  sourceAccountId: "source-private",
  destinationAccountId: "destination-private",
  providerPayload: { raw: true },
  journalIds: ["journal-private"],
  failureReason: "private",
});

test("builds the bounded all-account activity request without an asset filter", () => {
  assert.equal(WALLET_OPERATION_PAGE_SIZE, 25);
  assert.equal(walletOperationActivityPath(), "/v1/wallet/operations?limit=25");
  assert.equal(walletOperationActivityPath("next_cursor-1"), "/v1/wallet/operations?limit=25&cursor=next_cursor-1");
  assert.equal(walletOperationActivityPath().includes("assetCode"), false);
  assert.throws(() => walletOperationActivityPath("bad/cursor"), /cursor/);
  assert.throws(() => walletOperationActivityPath("x".repeat(513)), /cursor/);
});

test("reconstructs exactly the nine public Wallet operation fields", () => {
  const operation = parseWalletOperation(rawOperation());
  assert.deepEqual(Object.keys(operation).sort(), [
    "amount", "assetCode", "completedAt", "createdAt", "direction", "id", "status", "type", "updatedAt",
  ]);
  for (const forbidden of ["tenantId", "customerId", "environment", "sourceAccountId", "destinationAccountId", "providerPayload", "journalIds", "failureReason"])
    assert.equal(forbidden in operation, false);
});

test("accepts only the public operation enums", () => {
  for (const type of ["DEPOSIT", "INTERNAL_TRANSFER", "WITHDRAWAL", "FX_CONVERSION"])
    assert.equal(parseWalletOperation({ ...rawOperation(), type }).type, type);
  for (const status of ["PROCESSING", "PENDING_SETTLEMENT", "COMPLETED", "FAILED"])
    assert.equal(parseWalletOperation({ ...rawOperation(), status }).status, status);
  for (const direction of ["OUTGOING", "INCOMING", "BETWEEN_OWN_ACCOUNTS"])
    assert.equal(parseWalletOperation({ ...rawOperation(), direction }).direction, direction);
  assert.throws(() => parseWalletOperation({ ...rawOperation(), type: "TREASURY_TRANSFER" }), /type/);
  assert.throws(() => parseWalletOperation({ ...rawOperation(), status: "REVERSED" }), /status/);
  assert.throws(() => parseWalletOperation({ ...rawOperation(), direction: "INTERNAL" }), /direction/);
});

test("accepts only canonical absolute Decimal(36,18) operation amounts", () => {
  for (const value of ["0", "0.000000000000000001", "999999999999999999", "999999999999999999.999999999999999999"])
    assert.equal(parseWalletOperation({ ...rawOperation(), amount: value }).amount, value);
  for (const value of ["-1", "00", "01", "1.0000000000000000000", "1000000000000000000"])
    assert.throws(() => parseWalletOperation({ ...rawOperation(), amount: value }), /amount/);
});

test("validates strict RFC3339 timestamps and nullable completedAt", () => {
  const operation = parseWalletOperation({
    ...rawOperation(),
    createdAt: "2024-02-29T23:59:59.123456789+14:00",
    completedAt: null,
  });
  assert.equal(operation.completedAt, null);
  for (const createdAt of ["0", "2026-02-30T00:00:00Z", "2026-01-01 00:00:00Z", "2026-01-01T24:00:00Z"])
    assert.throws(() => parseWalletOperation({ ...rawOperation(), createdAt }), /createdAt/);
  assert.throws(() => parseWalletOperation({ ...rawOperation(), completedAt: "later" }), /completedAt/);
  assert.throws(() => parseWalletOperation({ ...rawOperation(), updatedAt: "0" }), /updatedAt/);
});

test("rejects oversized pages, malformed ids and duplicate operation ids", () => {
  assert.deepEqual(parseWalletOperationPage({ items: [], nextCursor: null }), { items: [], nextCursor: null });
  assert.throws(() => parseWalletOperation({ ...rawOperation(), id: "bad/id" }), /operation id/);
  assert.throws(() => parseWalletOperationPage({ items: [rawOperation(), rawOperation()], nextCursor: null }), /Duplicate/);
  assert.throws(() => parseWalletOperationPage({ items: Array.from({ length: 26 }, (_, index) => rawOperation(`operation-${index}`)), nextCursor: null }), /consumer limit/);
});

test("merges paged activity without duplicate operation ids", () => {
  const first = parseWalletOperation(rawOperation("operation-1"));
  const updated = parseWalletOperation({ ...rawOperation("operation-1"), status: "FAILED" });
  const second = parseWalletOperation(rawOperation("operation-2"));
  assert.deepEqual(mergeWalletOperationPages([first], [updated, second]).map(item => [item.id, item.status]), [
    ["operation-1", "FAILED"],
    ["operation-2", "COMPLETED"],
  ]);
});

test("rejects operation activity success, error and finally after scope, cursor or generation changes", () => {
  const request = { requestId: 7, scopeKey: "actor|tenant|customer|TEST", cursor: "cursor-a" };
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, request.scopeKey, "cursor-a"), true);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 8, request.scopeKey, "cursor-a"), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, "other-actor|tenant|customer|TEST", "cursor-a"), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, "actor|other-tenant|customer|TEST", "cursor-a"), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, "actor|tenant|other-customer|TEST", "cursor-a"), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, "actor|tenant|customer|SANDBOX", "cursor-a"), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, request.scopeKey, "cursor-b"), false);
});
