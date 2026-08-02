import assert from "node:assert/strict";
import test from "node:test";
import type { CardRecord } from "../src/cardList.ts";
import {
  CONSUMER_OVERVIEW_RECENT_OPERATION_LIMIT,
  createConsumerOverviewSnapshot,
} from "../src/consumerOverviewState.ts";
import type { WalletAccountRecord } from "../src/walletData.ts";
import type { WalletBalanceSummary } from "../src/walletBalanceSummary.ts";
import type { WalletOperationPage, WalletOperationRecord } from "../src/walletOperations.ts";

const account = (id: string): WalletAccountRecord => ({
  id,
  accountCode: `ACCOUNT:${id}`,
  name: `Wallet ${id}`,
  assetCode: "USD",
  status: "ACTIVE",
  currentBalance: "42.10",
  postedBalance: "42.10",
  pendingBalance: "0",
  availableBalance: "42.10",
  updatedAt: "2026-08-02T00:00:00.000Z",
});

const card = (id: string): CardRecord => ({
  id,
  type: "VIRTUAL",
  status: "ACTIVE",
  last4: "4242",
  expiryMonth: 12,
  expiryYear: 2030,
  currency: "USD",
  alias: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  capabilities: { freeze: true, unfreeze: false, replace: true, renew: false, updateLimits: true },
});

const operation = (index: number): WalletOperationRecord => ({
  id: `operation-${index}`,
  type: "INTERNAL_TRANSFER",
  status: "COMPLETED",
  assetCode: "USD",
  amount: `${index}.25`,
  direction: "OUTGOING",
  createdAt: `2026-08-02T00:00:0${index}.000Z`,
  completedAt: `2026-08-02T00:00:0${index}.000Z`,
  updatedAt: `2026-08-02T00:00:0${index}.000Z`,
});

test("projects only current normalized Backend snapshots without combining asset amounts", () => {
  const selectedAccount = account("selected");
  const selectedCard = card("selected");
  const summary: WalletBalanceSummary = {
    items: [
      { assetCode: "USD", availableBalance: "42.10", ledgerBalance: "42.10", pendingBalance: "0", updatedAt: "2026-08-02T00:00:00.000Z" },
      { assetCode: "EUR", availableBalance: "9.99", ledgerBalance: "10", pendingBalance: "0.01", updatedAt: "2026-08-02T00:00:00.000Z" },
    ],
  };
  const operations: WalletOperationPage = {
    items: [operation(1), operation(2), operation(3), operation(4)],
    nextCursor: "opaque-next",
    filterKey: "ALL:ALL",
    cursorTrail: [],
  };

  const snapshot = createConsumerOverviewSnapshot(
    summary,
    [selectedAccount],
    selectedAccount,
    [selectedCard],
    selectedCard,
    operations,
  );

  assert.deepEqual(snapshot.balances.map((item) => [item.assetCode, item.availableBalance]), [
    ["USD", "42.10"],
    ["EUR", "9.99"],
  ]);
  assert.equal(snapshot.selectedAccount, selectedAccount);
  assert.equal(snapshot.selectedCard, selectedCard);
  assert.equal(snapshot.loadedCardCount, 1);
  assert.equal(snapshot.recentOperations.length, CONSUMER_OVERVIEW_RECENT_OPERATION_LIMIT);
  assert.deepEqual(snapshot.recentOperations.map((item) => item.id), [
    "operation-1",
    "operation-2",
    "operation-3",
  ]);
});

test("suppresses stale selections and invents no fallback balance, card or activity", () => {
  const currentAccount = account("current");
  const currentCard = card("current");
  const snapshot = createConsumerOverviewSnapshot(
    null,
    [currentAccount],
    { ...currentAccount },
    [currentCard],
    { ...currentCard },
    null,
  );

  assert.deepEqual(snapshot.balances, []);
  assert.equal(snapshot.selectedAccount, null);
  assert.equal(snapshot.selectedCard, null);
  assert.equal(snapshot.loadedCardCount, 1);
  assert.deepEqual(snapshot.recentOperations, []);
});
