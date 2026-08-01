import {
  parseCardTransaction,
  type CardTransactionRecord,
} from "./cardTransactions.ts";

export type CardTransactionDetailSelection = Readonly<{
  scopeKey: string;
  cardId: string;
  transaction: CardTransactionRecord;
}>;

const CARD_ID = /^[A-Za-z0-9._:-]{2,128}$/;

const currentTransaction = (
  transactionId: string,
  transactions: readonly CardTransactionRecord[],
): CardTransactionRecord | null => {
  const match = transactions.find((transaction) => transaction.id === transactionId);
  if (!match) return null;
  try {
    return parseCardTransaction(match);
  } catch {
    return null;
  }
};

export function createCardTransactionDetailSelection(
  scopeKey: string,
  cardId: string,
  selected: unknown,
  transactions: readonly CardTransactionRecord[],
): CardTransactionDetailSelection {
  if (scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid Card transaction detail scope");
  if (!CARD_ID.test(cardId)) throw new Error("Invalid Card transaction detail Card ID");
  const candidate = parseCardTransaction(selected);
  const transaction = currentTransaction(candidate.id, transactions);
  if (!transaction) throw new Error("Card transaction is no longer in the selected Card history");
  return Object.freeze({ scopeKey, cardId, transaction });
}

export function reconcileCardTransactionDetailSelection(
  selection: CardTransactionDetailSelection | null,
  currentScopeKey: string | null,
  currentCardId: string | null,
  transactions: readonly CardTransactionRecord[],
  mounted: boolean,
): CardTransactionDetailSelection | null {
  if (
    !mounted ||
    !selection ||
    currentScopeKey === null ||
    currentCardId === null ||
    selection.scopeKey !== currentScopeKey ||
    selection.cardId !== currentCardId
  ) return null;
  const transaction = currentTransaction(selection.transaction.id, transactions);
  if (
    !transaction ||
    transaction.currency !== selection.transaction.currency ||
    transaction.occurredAt !== selection.transaction.occurredAt
  ) return null;
  return Object.freeze({
    scopeKey: currentScopeKey,
    cardId: currentCardId,
    transaction,
  });
}
