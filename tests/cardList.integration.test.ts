import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_LIST_PAGE_SIZE,
  cardListRequestWasAborted,
  readCardListPage,
  type CardListTransport,
} from "../src/cardList.ts";
import { walletTransferSessionScope, type WalletTransferSession } from "../src/walletTransfer.ts";
import { sessionFailureRequiresClear } from "../src/sessionLifecycle.ts";

const runtime = (process.env.FASTLINK_TEST_ENVIRONMENT ?? "TEST") as "SANDBOX" | "TEST";
const now = Date.parse("2026-08-01T00:00:00.000Z");
const session = (patch: Partial<WalletTransferSession> = {}): WalletTransferSession => ({
  actorId: "actor-1",
  tenantId: "tenant-1",
  customerId: "customer-1",
  environment: runtime,
  expiresAt: "2099-08-02T00:00:00.000Z",
  ...patch,
});
const scope = (value = session()): string => walletTransferSessionScope(value, runtime, now)!;
const cursor = (value: string): string => Buffer.from(value).toString("base64url");
const card = (index: number) => ({
  id: `card-${String(100 - index).padStart(3, "0")}`,
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: String(9000 - index),
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: `Card ${index}`,
  availableBalanceMinor: "10000",
  createdAt: new Date(Date.parse("2026-07-31T00:00:00.000Z") - index * 1_000).toISOString(),
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: true, updateLimits: true },
});

test("reads only the matching SANDBOX/TEST session through the exact GET route", async () => {
  const active = session();
  let captured: Parameters<CardListTransport>[0] | null = null;
  const transport: CardListTransport = async request => {
    captured = request;
    return JSON.stringify({ cards: [card(0)], nextCursor: null });
  };
  const page = await readCardListPage(transport, active, runtime, scope(active), null, [], undefined);
  assert.equal(captured?.method, "GET");
  assert.equal(captured?.path, "/v1/cards?limit=20");
  assert.equal(page.cards[0].id, "card-100");
  await assert.rejects(
    readCardListPage(transport, active, runtime, scope(active).replace("tenant-1", "tenant-2")),
    /unavailable for this session/,
  );
});

test("binds pagination to the prior snapshot and rejects overlap or boundary regression", async () => {
  const active = session();
  const firstCards = Array.from({ length: CARD_LIST_PAGE_SIZE }, (_, index) => card(index));
  const firstCursor = cursor("page-2");
  const first = await readCardListPage(
    async () => JSON.stringify({ cards: firstCards, nextCursor: firstCursor }),
    active,
    runtime,
    scope(active),
  );
  const next = await readCardListPage(
    async ({ path }) => {
      assert.equal(path, `/v1/cards?limit=20&cursor=${firstCursor}`);
      return JSON.stringify({ cards: [card(20)], nextCursor: null });
    },
    active,
    runtime,
    scope(active),
    first.nextCursor,
    first.cards,
  );
  assert.equal(next.cards[0].id, "card-080");
  await assert.rejects(
    readCardListPage(
      async () => JSON.stringify({ cards: [card(0)], nextCursor: null }),
      active,
      runtime,
      scope(active),
      first.nextCursor,
      first.cards,
    ),
    /Duplicate card id across pages/,
  );
});

test("aborts stale work before a late response can be parsed or committed", async () => {
  const active = session();
  const controller = new AbortController();
  let resolveResponse!: (value: string) => void;
  const pending = readCardListPage(
    () => new Promise(resolve => { resolveResponse = resolve; }),
    active,
    runtime,
    scope(active),
    null,
    [],
    controller.signal,
  );
  controller.abort();
  resolveResponse(JSON.stringify({ cards: [card(0)], nextCursor: null }));
  await assert.rejects(pending, value => {
    assert.equal(cardListRequestWasAborted(value), true);
    return true;
  });
});

test("rejects a response when actor scope changes while the GET is in flight", async () => {
  const active = session();
  await assert.rejects(
    readCardListPage(
      async () => {
        (active as { tenantId: string }).tenantId = "tenant-2";
        return JSON.stringify({ cards: [card(0)], nextCursor: null });
      },
      active,
      runtime,
      scope(active),
    ),
    /session expired during the request/,
  );
});

test("clears on 401 but retains the verified snapshot on transient failures", () => {
  assert.equal(sessionFailureRequiresClear({ status: 401, message: "Unauthorized" }), true);
  assert.equal(sessionFailureRequiresClear({ status: 408, message: "Timeout" }), false);
  assert.equal(sessionFailureRequiresClear({ status: 429, message: "Rate limited" }), false);
  assert.equal(sessionFailureRequiresClear({ status: 503, message: "Unavailable" }), false);
  assert.equal(sessionFailureRequiresClear({ status: 0, message: "Network failure" }), false);
});
