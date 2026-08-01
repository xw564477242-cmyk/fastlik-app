import {
  cardTransactionPath,
  parseCardTransactionFilter,
  parseCardTransactionPage,
  type CardTransactionFilter,
  type CardTransactionPage,
  type CardTransactionRecord,
} from "./cardTransactions.ts";

export type CardTransactionHistoryRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cardId: string;
  filter: CardTransactionFilter;
  cursor: string | null;
}>;

export type CardTransactionHistoryState = Readonly<{
  scopeKey: string;
  cardId: string;
  filter: CardTransactionFilter;
  transactions: readonly CardTransactionRecord[];
  nextCursor: string | null;
  seenCursors: readonly string[];
}>;

export function createCardTransactionHistoryRequestIdentity(
  requestId: number,
  scopeKey: string,
  cardId: string,
  filterValue: unknown,
  cursor: string | null,
): CardTransactionHistoryRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new Error("Invalid Card transaction history request");
  if (scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid Card transaction history scope");
  const filter = parseCardTransactionFilter(filterValue);
  cardTransactionPath(cardId, {
    filter,
    ...(cursor === null ? {} : { cursor }),
  });
  return Object.freeze({ requestId, scopeKey, cardId, filter, cursor });
}

export function cardTransactionHistoryRequestIsCurrent(
  request: CardTransactionHistoryRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
  currentFilter: CardTransactionFilter,
  currentCursor: string | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cardId === currentCardId &&
      request.filter === currentFilter &&
      request.cursor === currentCursor,
  );
}

export function commitCardTransactionHistoryPage(
  current: CardTransactionHistoryState | null,
  request: CardTransactionHistoryRequestIdentity,
  rawPage: unknown,
): CardTransactionHistoryState {
  const page: CardTransactionPage = parseCardTransactionPage(rawPage, request.filter);
  if (request.cursor === null) {
    return Object.freeze({
      scopeKey: request.scopeKey,
      cardId: request.cardId,
      filter: request.filter,
      transactions: page.transactions,
      nextCursor: page.nextCursor,
      seenCursors: Object.freeze(page.nextCursor === null ? [] : [page.nextCursor]),
    });
  }
  if (
    !current ||
    current.scopeKey !== request.scopeKey ||
    current.cardId !== request.cardId ||
    current.filter !== request.filter ||
    current.nextCursor !== request.cursor
  ) throw new Error("Stale Card transaction history page");
  const currentIds = new Set(current.transactions.map((transaction) => transaction.id));
  if (page.transactions.some((transaction) => currentIds.has(transaction.id)))
    throw new Error("Duplicate Card transaction history page");
  if (
    page.nextCursor !== null &&
    (page.nextCursor === request.cursor || current.seenCursors.includes(page.nextCursor))
  ) throw new Error("Repeated Card transaction history cursor");
  return Object.freeze({
    ...current,
    transactions: Object.freeze([...current.transactions, ...page.transactions]),
    nextCursor: page.nextCursor,
    seenCursors: Object.freeze(
      page.nextCursor === null
        ? [...current.seenCursors]
        : [...current.seenCursors, page.nextCursor],
    ),
  });
}
