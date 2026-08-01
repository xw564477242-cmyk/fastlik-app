import { parseCardBalance, type CardBalanceRecord } from "./cardBalance.ts";
import { parseCardLimits, type CardLimitsRecord } from "./cardLimits.ts";
import { parseCardRecord, type CardRecord } from "./cardList.ts";
import {
  parseCardTransactionPage,
  type CardTransactionPage,
} from "./cardTransactions.ts";

export type CardDetailRefreshRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cardId: string;
}>;

export type CardDetailRefreshSnapshot = Readonly<{
  card: CardRecord;
  balance: CardBalanceRecord;
  limits: CardLimitsRecord;
  transactions: CardTransactionPage;
}>;

export type CardDetailRefreshReaders = Readonly<{
  card: (cardId: string) => Promise<unknown>;
  balance: (cardId: string) => Promise<unknown>;
  limits: (cardId: string) => Promise<unknown>;
  transactions: (cardId: string) => Promise<unknown>;
}>;

const CARD_ID = /^[A-Za-z0-9._:-]{2,128}$/;

export function createCardDetailRefreshRequestIdentity(
  requestId: number,
  scopeKey: string,
  cardId: string,
): CardDetailRefreshRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new Error("Invalid Card detail refresh request");
  if (scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid Card detail refresh scope");
  if (!CARD_ID.test(cardId)) throw new Error("Invalid Card detail refresh Card ID");
  return Object.freeze({ requestId, scopeKey, cardId });
}

export function cardDetailRefreshRequestIsCurrent(
  request: CardDetailRefreshRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cardId === currentCardId,
  );
}

export function cardDetailRefreshCanRetainSnapshot(
  completeSnapshotCardId: string | null,
  selectedCardId: string,
): boolean {
  return completeSnapshotCardId !== null && completeSnapshotCardId === selectedCardId;
}

/**
 * Reads one complete Card screen snapshot. Nothing is returned until all four
 * public responses have passed their existing allowlist parsers.
 */
export async function readCardDetailRefresh(
  readers: CardDetailRefreshReaders,
  selectedCardId: string,
): Promise<CardDetailRefreshSnapshot> {
  if (!CARD_ID.test(selectedCardId)) throw new Error("Invalid Card detail refresh Card ID");

  const [rawCard, rawBalance, rawLimits, rawTransactions] = await Promise.all([
    readers.card(selectedCardId),
    readers.balance(selectedCardId),
    readers.limits(selectedCardId),
    readers.transactions(selectedCardId),
  ]);

  const card = parseCardRecord(rawCard);
  if (card.id !== selectedCardId)
    throw new Error("Card detail does not match the selected Card");
  const balance = parseCardBalance(rawBalance, selectedCardId);
  const limits = parseCardLimits(rawLimits, selectedCardId);
  const transactions = parseCardTransactionPage(rawTransactions);
  if (balance.currency !== card.currency)
    throw new Error("Card detail and balance currencies do not match");

  return Object.freeze({ card, balance, limits, transactions });
}
