import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_TRANSACTION_MAX_JSON_BYTES,
  advanceWalletTransactionHistory,
  createWalletTransactionHistoryRequestIdentity,
  normalizeWalletTransactionFilters,
  parseWalletTransactionDetailRaw,
  parseWalletTransactionPageRaw,
  readWalletTransactionHistory,
  walletTransactionFilterKey,
  walletTransactionHistoryRequestIsCurrent,
  walletTransactionPath,
  walletTransactionRequestWasAborted,
  type WalletTransactionRecord,
} from "../src/walletTransactions.ts";

const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-history-01",
  tenantId: "tenant-history-01",
  customerId: "customer-history-01",
  environment: "SANDBOX" as const,
  expiresAt: "2099-08-01T08:00:00.000Z",
  ...overrides,
});

const transaction = (id: string, minute: number, overrides: Record<string, unknown> = {}) => ({
  id,
  type: "TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: "25.5",
  direction: "OUTGOING",
  createdAt: `2026-08-01T00:${String(minute).padStart(2, "0")}:00.000Z`,
  updatedAt: `2026-08-01T00:${String(minute).padStart(2, "0")}:00.000Z`,
  ...overrides,
});

const filters = normalizeWalletTransactionFilters({ assetCode: "USD", limit: 25 });
const cursorPage1 = "Y3Vyc29yLXBhZ2UtMQ";
const cursorPage2 = "Y3Vyc29yLXBhZ2UtMg";
const cursorPage3 = "Y3Vyc29yLXBhZ2UtMw";

test("builds only the exact bounded Backend transaction history query", () => {
  assert.equal(
    walletTransactionPath(filters),
    "/v1/wallet/transactions?assetCode=USD&limit=25",
  );
  assert.equal(
    walletTransactionPath(
      normalizeWalletTransactionFilters({
        type: "TRANSFER",
        status: "COMPLETED",
        assetCode: "USD",
        limit: 25,
      }),
      cursorPage1,
    ),
    `/v1/wallet/transactions?type=TRANSFER&status=COMPLETED&assetCode=USD&limit=25&cursor=${cursorPage1}`,
  );
  for (const invalid of [
    { assetCode: "usd" },
    { type: "TREASURY" },
    { status: "CANCELLED" },
    { limit: 51 },
    { assetCode: "USD", tenantId: "attacker" },
  ]) assert.throws(() => normalizeWalletTransactionFilters(invalid), /filter|limit|asset/);
  assert.throws(() => walletTransactionPath(filters, "bad/cursor"), /cursor/);
  assert.throws(() => walletTransactionPath(filters, "A"), /cursor/);
  assert.throws(() => walletTransactionPath(filters, "AB"), /cursor/);
  assert.equal(walletTransactionPath(filters, "AA").endsWith("cursor=AA"), true);
});

test("reconstructs exactly the eight public fields and rejects every internal field", () => {
  const page = parseWalletTransactionPageRaw(
    JSON.stringify({ items: [transaction("transaction-01", 59)], nextCursor: null }),
    filters,
  );
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
  for (const field of [
    "providerPayload",
    "walletRef",
    "walletAccountId",
    "journalIds",
    "tenantId",
    "internalId",
    "referenceId",
  ])
    assert.throws(
      () =>
        parseWalletTransactionPageRaw(
          JSON.stringify({
            items: [transaction("transaction-01", 59, { [field]: "private" })],
            nextCursor: null,
          }),
          filters,
        ),
      /fields/,
    );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({ items: [], nextCursor: null, tenantId: "private" }),
        filters,
      ),
    /fields/,
  );
});

test("rejects duplicate and escaped-equivalent JSON keys before JSON.parse", () => {
  const encoded = JSON.stringify(transaction("transaction-01", 59));
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        `{"items":[${encoded.slice(0, -1)},"status":"FAILED"}],"nextCursor":null}`,
        filters,
      ),
    /Duplicate.*key/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        `{"items":[${encoded.slice(0, -1)},"sta\\u0074us":"FAILED"}],"nextCursor":null}`,
        filters,
      ),
    /Duplicate.*key/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        `{"items":[],"it\\u0065ms":[],"nextCursor":null}`,
        filters,
      ),
    /Duplicate.*key/,
  );
});

test("bounds raw bytes, dense items, page size, ids and opaque cursor", () => {
  assert.throws(
    () => parseWalletTransactionPageRaw("x".repeat(WALLET_TRANSACTION_MAX_JSON_BYTES + 1), filters),
    /limit/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({
          items: Array.from({ length: 26 }, (_, index) => transaction(`transaction-${index}`, 59)),
          nextCursor: null,
        }),
        filters,
      ),
    /page size/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({
          items: [transaction("transaction-01", 59), transaction("transaction-01", 58)],
          nextCursor: null,
        }),
        filters,
      ),
    /Duplicate/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({ items: [transaction("transaction-01", 59)], nextCursor: "AA" }),
        filters,
      ),
    /full page/,
  );
});

test("validates exact type, status, direction, absolute Decimal(36,18), filters and time", () => {
  for (const overrides of [
    { type: "RAW" },
    { status: "CANCELLED" },
    { direction: "BETWEEN_OWN_ACCOUNTS" },
    { amount: "-1" },
    { amount: "01" },
    { amount: "1.0" },
    { amount: "0.00" },
    { amount: "1.20" },
    { amount: "0.000000000000000000" },
    { amount: "1.0000000000000000000" },
    { amount: "1000000000000000000" },
    { createdAt: "2026-08-01T00:59:00Z" },
    { updatedAt: "2026-08-01T00:58:00.000Z" },
    { assetCode: "EUR" },
  ])
    assert.throws(() =>
      parseWalletTransactionPageRaw(
        JSON.stringify({ items: [transaction("transaction-01", 59, overrides)], nextCursor: null }),
        filters,
      ));
  const accepted = parseWalletTransactionPageRaw(
    JSON.stringify({
      items: [
        transaction("transaction-01", 59, {
          type: "FX",
          status: "PENDING",
          direction: "INCOMING",
          amount: "999999999999999999.999999999999999999",
        }),
      ],
      nextCursor: null,
    }),
    normalizeWalletTransactionFilters({ limit: 25 }),
  );
  assert.equal(accepted.items[0].amount, "999999999999999999.999999999999999999");
  for (const amount of ["0", "1", "0.1", "1.01", "100000000000000000.000000000000000001"])
    assert.equal(
      parseWalletTransactionPageRaw(
        JSON.stringify({ items: [transaction("transaction-02", 58, { amount })], nextCursor: null }),
        normalizeWalletTransactionFilters({ limit: 25 }),
      ).items[0].amount,
      amount,
    );
});

test("rejects noncanonical Base64URL-equivalent cursors from callers and service output", () => {
  assert.deepEqual(Buffer.from("AA", "base64url"), Buffer.from("AB", "base64url"));
  assert.throws(() => walletTransactionPath(filters, "AB"), /cursor/);
  const fullPage = Array.from({ length: 25 }, (_, index) =>
    transaction(`transaction-${String(99 - index).padStart(2, "0")}`, 59 - index));
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({ items: fullPage, nextCursor: "AB" }),
        filters,
      ),
    /cursor/,
  );
  assert.equal(
    parseWalletTransactionPageRaw(
      JSON.stringify({ items: fullPage, nextCursor: "AA" }),
      filters,
    ).nextCursor,
    "AA",
  );
});

test("requires strict createdAt/id descending order inside every page", () => {
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({
          items: [transaction("transaction-01", 58), transaction("transaction-02", 59)],
          nextCursor: null,
        }),
        filters,
      ),
    /monotonic/,
  );
  assert.throws(
    () =>
      parseWalletTransactionPageRaw(
        JSON.stringify({
          items: [transaction("transaction-01", 59), transaction("transaction-02", 59)],
          nextCursor: null,
        }),
        filters,
      ),
    /monotonic/,
  );
});

test("fails closed on cross-page duplicate, non-monotonic page, cursor loop and rollback", () => {
  const firstPage = parseWalletTransactionPageRaw(
    JSON.stringify({
      items: Array.from({ length: 25 }, (_, index) =>
        transaction(`transaction-${String(99 - index).padStart(2, "0")}`, 59 - index)),
      nextCursor: cursorPage2,
    }),
    filters,
  );
  const first = advanceWalletTransactionHistory(null, firstPage, filters, null);
  const older = parseWalletTransactionPageRaw(
    JSON.stringify({ items: [transaction("transaction-74", 34)], nextCursor: null }),
    filters,
  );
  assert.equal(
    advanceWalletTransactionHistory(first, older, filters, cursorPage2).items.length,
    26,
  );
  assert.throws(
    () =>
      advanceWalletTransactionHistory(
        first,
        { items: [first.items[0]], nextCursor: null },
        filters,
        cursorPage2,
      ),
    /Duplicate|monotonic/,
  );
  assert.throws(
    () =>
      advanceWalletTransactionHistory(
        first,
        { items: [transaction("transaction-newer", 58) as WalletTransactionRecord], nextCursor: null },
        filters,
        cursorPage2,
      ),
    /monotonic/,
  );
  assert.throws(
    () =>
      advanceWalletTransactionHistory(
        first,
        { items: [transaction("transaction-74", 34) as WalletTransactionRecord], nextCursor: cursorPage2 },
        filters,
        cursorPage2,
      ),
    /loop|rollback/,
  );
  assert.throws(
    () => advanceWalletTransactionHistory(first, older, { ...filters, assetCode: "EUR" }, cursorPage2),
    /bound/,
  );
  const secondPage = parseWalletTransactionPageRaw(
    JSON.stringify({
      items: Array.from({ length: 25 }, (_, index) =>
        transaction(`transaction-${String(74 - index).padStart(2, "0")}`, 34 - index)),
      nextCursor: cursorPage3,
    }),
    filters,
  );
  const second = advanceWalletTransactionHistory(first, secondPage, filters, cursorPage2);
  assert.throws(
    () =>
      advanceWalletTransactionHistory(
        second,
        { items: [transaction("transaction-49", 9) as WalletTransactionRecord], nextCursor: cursorPage2 },
        filters,
        cursorPage3,
      ),
    /loop|rollback/,
  );
});

test("permits exactly one GET per page and blocks mismatch or expiry before transport", async () => {
  let calls = 0;
  const transport = async () => {
    calls += 1;
    return JSON.stringify({ items: [], nextCursor: null });
  };
  const history = await readWalletTransactionHistory(transport, session(), "SANDBOX", filters);
  assert.equal(history.items.length, 0);
  assert.equal(calls, 1);
  await assert.rejects(
    readWalletTransactionHistory(transport, session({ environment: "TEST" }), "SANDBOX", filters),
    /unavailable/,
  );
  await assert.rejects(
    readWalletTransactionHistory(
      transport,
      session({ expiresAt: "2020-01-01T00:00:00.000Z" }),
      "SANDBOX",
      filters,
    ),
    /unavailable/,
  );
  assert.equal(calls, 1);
});

test("rejects a pre-cancelled request without transport or abort-reason reflection", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort({ providerPayload: "must-not-reflect" });
  await assert.rejects(
    readWalletTransactionHistory(
      async () => {
        calls += 1;
        return JSON.stringify({ items: [], nextCursor: null });
      },
      session(),
      "SANDBOX",
      filters,
      null,
      controller.signal,
    ),
    error =>
      walletTransactionRequestWasAborted(error) &&
      (error as Error).message === "Wallet transaction request cancelled",
  );
  assert.equal(calls, 0);
});

test("binds request identity to scope, filters, cursor and generation", () => {
  const scope = JSON.stringify(["actor", "tenant", "customer", "SANDBOX", "expiry"]);
  const request = createWalletTransactionHistoryRequestIdentity(1, scope, filters, cursorPage2);
  const key = walletTransactionFilterKey(filters);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 1, scope, key, cursorPage2), true);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 2, scope, key, cursorPage2), false);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 1, "other", key, cursorPage2), false);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 1, scope, "other", cursorPage2), false);
  assert.equal(walletTransactionHistoryRequestIsCurrent(request, 1, scope, key, cursorPage3), false);
});

test("selected detail remains exact, public and immutable", () => {
  const selected = parseWalletTransactionPageRaw(
    JSON.stringify({ items: [transaction("transaction-01", 59)], nextCursor: null }),
    filters,
  ).items[0];
  const detail = parseWalletTransactionDetailRaw(
    JSON.stringify(transaction("transaction-01", 59, { status: "REVERSED" })),
    selected,
  );
  assert.equal(detail.status, "REVERSED");
  assert.throws(
    () =>
      parseWalletTransactionDetailRaw(
        JSON.stringify(transaction("transaction-01", 59, { walletRef: "private" })),
        selected,
      ),
    /fields/,
  );
  assert.throws(
    () =>
      parseWalletTransactionDetailRaw(
        JSON.stringify(transaction("transaction-01", 59, { amount: "26" })),
        selected,
      ),
    /immutable/,
  );
});
