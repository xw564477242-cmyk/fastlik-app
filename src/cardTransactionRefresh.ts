import {
  commitCardTransactionHistoryPage,
  createCardTransactionHistoryRequestIdentity,
  type CardTransactionHistoryRequestIdentity,
  type CardTransactionHistoryState,
} from "./cardTransactionHistory.ts";
import type { CardTransactionFilter } from "./cardTransactions.ts";

export const CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS = 3;

export type CardTransactionRefreshRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cardId: string;
  filter: CardTransactionFilter;
  attempt: number;
  snapshot: CardTransactionHistoryState | null;
  historyRequest: CardTransactionHistoryRequestIdentity;
}>;

export function cardTransactionRefreshAllowed(
  sessionEnvironment: string,
  runtimeEnvironment: string,
  scopeKey: string | null,
  currentScopeKey: string | null,
  cardId: string | null,
  currentCardId: string | null,
  filter: CardTransactionFilter,
  currentFilter: CardTransactionFilter,
  history: CardTransactionHistoryState | null,
): boolean {
  return Boolean(
    (sessionEnvironment === "SANDBOX" || sessionEnvironment === "TEST") &&
      runtimeEnvironment === sessionEnvironment &&
      scopeKey !== null &&
      scopeKey === currentScopeKey &&
      cardId !== null &&
      cardId === currentCardId &&
      filter === currentFilter &&
      (!history || (
        history.scopeKey === scopeKey &&
        history.cardId === cardId &&
        history.filter === filter
      )),
  );
}

export function createCardTransactionRefreshRequestIdentity(
  requestId: number,
  scopeKey: string,
  cardId: string,
  filter: CardTransactionFilter,
  attempt: number,
  snapshot: CardTransactionHistoryState | null,
): CardTransactionRefreshRequestIdentity {
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    attempt > CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS
  ) throw new Error("Invalid Card transaction refresh attempt");
  if (snapshot && (
    snapshot.scopeKey !== scopeKey ||
    snapshot.cardId !== cardId ||
    snapshot.filter !== filter
  )) throw new Error("Card transaction refresh snapshot does not match the request");
  const historyRequest = createCardTransactionHistoryRequestIdentity(
    requestId,
    scopeKey,
    cardId,
    filter,
    null,
  );
  return Object.freeze({
    requestId,
    scopeKey,
    cardId,
    filter,
    attempt,
    snapshot,
    historyRequest,
  });
}

export function cardTransactionRefreshRequestIsCurrent(
  request: CardTransactionRefreshRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
  currentFilter: CardTransactionFilter,
  currentAttempt: number,
  currentHistory: CardTransactionHistoryState | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cardId === currentCardId &&
      request.filter === currentFilter &&
      request.attempt === currentAttempt &&
      request.snapshot === currentHistory,
  );
}

export function commitCardTransactionRefreshPage(
  request: CardTransactionRefreshRequestIdentity,
  rawPage: unknown,
): CardTransactionHistoryState {
  return commitCardTransactionHistoryPage(null, request.historyRequest, rawPage);
}
