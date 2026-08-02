import type { CardRecord } from "./cardList.ts";
import type { WalletAccountRecord } from "./walletData.ts";
import type { WalletBalanceSummary } from "./walletBalanceSummary.ts";
import type { WalletOperationPage, WalletOperationRecord } from "./walletOperations.ts";

export const CONSUMER_OVERVIEW_RECENT_OPERATION_LIMIT = 3;

export type ConsumerOverviewSnapshot = Readonly<{
  balances: WalletBalanceSummary["items"];
  selectedAccount: WalletAccountRecord | null;
  selectedCard: CardRecord | null;
  loadedCardCount: number;
  recentOperations: readonly WalletOperationRecord[];
}>;

export function createConsumerOverviewSnapshot(
  summary: WalletBalanceSummary | null,
  accounts: readonly WalletAccountRecord[],
  selectedAccount: WalletAccountRecord | null,
  cards: readonly CardRecord[],
  selectedCard: CardRecord | null,
  operations: WalletOperationPage | null,
): ConsumerOverviewSnapshot {
  return Object.freeze({
    balances: Object.freeze(summary ? [...summary.items] : []),
    selectedAccount: selectedAccount && accounts.includes(selectedAccount) ? selectedAccount : null,
    selectedCard: selectedCard && cards.includes(selectedCard) ? selectedCard : null,
    loadedCardCount: cards.length,
    recentOperations: Object.freeze(
      operations
        ? operations.items.slice(0, CONSUMER_OVERVIEW_RECENT_OPERATION_LIMIT)
        : [],
    ),
  });
}
