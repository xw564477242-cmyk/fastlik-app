import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WALLET_OPERATION_FILTERS,
  WALLET_OPERATION_PAGE_SIZE,
  WALLET_OPERATION_STATUSES,
  WALLET_OPERATION_TYPES,
  appendWalletOperationPage,
  createWalletOperationActivityRequestIdentity,
  createWalletOperationDetailRequestIdentity,
  parseWalletOperation,
  parseWalletOperationDetail,
  parseWalletOperationPage,
  walletOperationActivityPath,
  walletOperationActivityRequestIsCurrent,
  walletOperationDetailPath,
  walletOperationDetailRequestIsCurrent,
  walletOperationFilterKey,
} from "../src/walletOperations.ts";

const backendCursor = (id = "operation-1") => Buffer.from(JSON.stringify({
  version: 2,
  createdAt: "2026-08-01T01:02:03.000Z",
  id,
  type: null,
  status: null,
})).toString("base64url");

const rawOperation = (
  id = "operation-1",
  createdAt = "2026-07-31T01:02:03.000Z",
): Record<string, unknown> => ({
  id,
  type: "INTERNAL_TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: "25.5",
  direction: "BETWEEN_OWN_ACCOUNTS",
  createdAt,
  completedAt: "2026-07-31T01:02:04.000Z",
  updatedAt: "2026-07-31T01:02:04.000Z",
});

test("builds only canonical Backend type/status filters, bounded cursor pagination and no asset filter", () => {
  const cursor = backendCursor();
  assert.equal(WALLET_OPERATION_PAGE_SIZE, 25);
  assert.equal(
    walletOperationActivityPath(DEFAULT_WALLET_OPERATION_FILTERS),
    "/v1/wallet/operations?limit=25",
  );
  assert.equal(
    walletOperationActivityPath({ type: "DEPOSIT", status: "COMPLETED" }, cursor),
    `/v1/wallet/operations?type=DEPOSIT&status=COMPLETED&limit=25&cursor=${cursor}`,
  );
  assert.equal(walletOperationActivityPath(DEFAULT_WALLET_OPERATION_FILTERS).includes("assetCode"), false);
  assert.throws(() => walletOperationActivityPath({ type: "TREASURY_RESERVE" as never, status: "ALL" }), /type filter/);
  assert.throws(() => walletOperationActivityPath({ type: "ALL", status: "REVERSED" as never }), /status filter/);
  assert.throws(() => walletOperationActivityPath(DEFAULT_WALLET_OPERATION_FILTERS, "bad/cursor"), /cursor/);
  assert.throws(() => walletOperationActivityPath(DEFAULT_WALLET_OPERATION_FILTERS, "x".repeat(513)), /cursor/);
});

test("accepts exactly the nine public DTO fields and rejects every internal or unknown field", () => {
  const operation = parseWalletOperation(rawOperation());
  assert.deepEqual(Object.keys(operation).sort(), [
    "amount", "assetCode", "completedAt", "createdAt", "direction", "id", "status", "type", "updatedAt",
  ]);
  for (const forbidden of ["tenantId", "customerId", "environment", "sourceAccountId", "destinationAccountId", "providerPayload", "journalIds", "failureReason"]) {
    assert.throws(() => parseWalletOperation({ ...rawOperation(), [forbidden]: "private" }), /exactly the public fields/);
  }
  assert.throws(() => parseWalletOperationPage({ items: [], nextCursor: null, internal: true }), /exactly the public fields/);
});

test("reconstructs operation detail while binding id, type, asset and canonical amount", () => {
  const selected = parseWalletOperation(rawOperation());
  const detail = parseWalletOperationDetail({
    ...rawOperation(),
    status: "FAILED",
    direction: "OUTGOING",
    completedAt: null,
    updatedAt: "2026-07-31T01:03:04.000Z",
  }, selected);
  assert.equal(detail.status, "FAILED");
  assert.equal(detail.direction, "OUTGOING");
  assert.equal(detail.completedAt, null);
  assert.throws(() => parseWalletOperationDetail(rawOperation("operation-2"), selected), /detail id/);
  assert.throws(() => parseWalletOperationDetail({ ...rawOperation(), type: "DEPOSIT" }, selected), /detail type/);
  assert.throws(() => parseWalletOperationDetail({ ...rawOperation(), assetCode: "EUR" }, selected), /detail asset/);
  assert.throws(() => parseWalletOperationDetail({ ...rawOperation(), amount: "25.6" }, selected), /detail amount/);
  assert.equal(parseWalletOperationDetail({ ...rawOperation(), amount: "25.5000" }, selected).amount, "25.5000");
});

test("builds a separately validated public operation detail GET path", () => {
  assert.equal(walletOperationDetailPath("operation:1"), "/v1/wallet/operations/operation%3A1");
  assert.throws(() => walletOperationDetailPath("bad/id"), /operation id/);
});

test("uses only the Backend canonical public operation enums", () => {
  assert.deepEqual(WALLET_OPERATION_TYPES, ["DEPOSIT", "INTERNAL_TRANSFER", "WITHDRAWAL", "FX_CONVERSION"]);
  assert.deepEqual(WALLET_OPERATION_STATUSES, ["PROCESSING", "PENDING_SETTLEMENT", "COMPLETED", "FAILED"]);
  for (const type of WALLET_OPERATION_TYPES)
    assert.equal(parseWalletOperation({ ...rawOperation(), type }).type, type);
  for (const status of WALLET_OPERATION_STATUSES)
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

test("rejects oversized, duplicate and non-monotonic pages", () => {
  assert.deepEqual(parseWalletOperationPage({ items: [], nextCursor: null }), { items: [], nextCursor: null });
  assert.throws(() => parseWalletOperation({ ...rawOperation(), id: "bad/id" }), /operation id/);
  assert.throws(() => parseWalletOperationPage({ items: [rawOperation(), rawOperation()], nextCursor: null }), /Duplicate/);
  assert.throws(() => parseWalletOperationPage({ items: Array.from({ length: 26 }, (_, index) => rawOperation(`operation-${index}`)), nextCursor: null }), /consumer limit/);
  assert.throws(() => parseWalletOperationPage({
    items: [rawOperation("operation-1", "2026-07-31T01:00:00.000Z"), rawOperation("operation-2", "2026-07-31T02:00:00.000Z")],
    nextCursor: null,
  }), /order/);
});

test("appends filter-bound cursor pages without duplicate, regression or cursor loop", () => {
  const cursor = backendCursor("operation-2");
  const first = parseWalletOperationPage({
    items: [rawOperation("operation-2", "2026-07-31T02:00:00.000Z")],
    nextCursor: cursor,
  });
  const next = parseWalletOperationPage({
    items: [rawOperation("operation-1", "2026-07-31T01:00:00.000Z")],
    nextCursor: null,
  });
  assert.deepEqual(appendWalletOperationPage(first, next, cursor).items.map((item) => item.id), ["operation-2", "operation-1"]);
  assert.throws(() => appendWalletOperationPage(first, parseWalletOperationPage({ items: [rawOperation("operation-2", "2026-07-31T01:00:00.000Z")], nextCursor: null }), cursor), /across pages/);
  assert.throws(() => appendWalletOperationPage(first, { ...next, nextCursor: cursor }, cursor), /cursor loop/);
});

test("binds activity writes to actor/session scope, filters, cursor, generation and mount", () => {
  const filters = { type: "DEPOSIT", status: "COMPLETED" } as const;
  const cursor = backendCursor();
  const request = createWalletOperationActivityRequestIdentity(7, "actor|expiry|tenant|customer|TEST", filters, cursor);
  const filterKey = walletOperationFilterKey(filters);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, request.scopeKey, filterKey, cursor, true), true);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 8, request.scopeKey, filterKey, cursor, true), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, "other-scope", filterKey, cursor, true), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, request.scopeKey, walletOperationFilterKey({ ...filters, status: "FAILED" }), cursor, true), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, request.scopeKey, filterKey, null, true), false);
  assert.equal(walletOperationActivityRequestIsCurrent(request, 7, request.scopeKey, filterKey, cursor, false), false);
});

test("binds detail writes to the exact filter, list snapshot, selection, scope and generation", () => {
  const filters = { type: "ALL", status: "COMPLETED" } as const;
  const list = parseWalletOperationPage({ items: [rawOperation()], nextCursor: null });
  const selected = list.items[0];
  const request = createWalletOperationDetailRequestIdentity(11, "actor|expiry|tenant|customer|TEST", filters, selected, list);
  const filterKey = walletOperationFilterKey(filters);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 11, request.scopeKey, filterKey, list, selected.id, true), true);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 12, request.scopeKey, filterKey, list, selected.id, true), false);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 11, "other-scope", filterKey, list, selected.id, true), false);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 11, request.scopeKey, walletOperationFilterKey(DEFAULT_WALLET_OPERATION_FILTERS), list, selected.id, true), false);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 11, request.scopeKey, filterKey, { ...list }, selected.id, true), false);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 11, request.scopeKey, filterKey, list, "operation-2", true), false);
  assert.equal(walletOperationDetailRequestIsCurrent(request, 11, request.scopeKey, filterKey, list, selected.id, false), false);
});
