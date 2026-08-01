import {
  CARD_TRANSACTION_PUBLIC_FIELDS,
  parseCardTransaction,
  type CardTransactionFilter,
  type CardTransactionRecord,
} from "./cardTransactions.ts";
import type { CardTransactionHistoryState } from "./cardTransactionHistory.ts";
import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export type CardTransactionDetailTransportRequest = Readonly<{
  path: string;
  method: "GET";
  signal: AbortSignal;
}>;

export type CardTransactionDetailTransport = (
  request: CardTransactionDetailTransportRequest,
) => Promise<unknown>;

export type CardTransactionDetailRefreshRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cardId: string;
  filter: CardTransactionFilter;
  transactionId: string;
  listSnapshot: CardTransactionHistoryState;
}>;

const identifier = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    throw new Error(`Invalid ${label}`);
  return value;
};

export function cardTransactionDetailPath(cardId: string, transactionId: string): string {
  return `/v1/cards/${encodeURIComponent(identifier(cardId, "Card transaction Card ID"))}/transactions/${encodeURIComponent(identifier(transactionId, "Card transaction ID"))}`;
}

export function parseExactCardTransactionDetail(
  value: unknown,
  requested: CardTransactionRecord,
): CardTransactionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Card transaction detail");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error("Invalid Card transaction detail");
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== CARD_TRANSACTION_PUBLIC_FIELDS.length ||
    keys.some(key => typeof key !== "string" || !(CARD_TRANSACTION_PUBLIC_FIELDS as readonly string[]).includes(key))
  ) throw new Error("Card transaction detail must contain exactly the public fields");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (CARD_TRANSACTION_PUBLIC_FIELDS.some(key => !("value" in descriptors[key])))
    throw new Error("Card transaction detail fields must be data properties");
  const parsed = parseCardTransaction(value);
  if (parsed.id !== requested.id)
    throw new Error("Card transaction detail does not match the requested transaction");
  if (parsed.currency !== requested.currency || parsed.occurredAt !== requested.occurredAt)
    throw new Error("Card transaction detail immutable identity changed");
  return parsed;
}

export function createCardTransactionDetailRefreshRequestIdentity(
  requestId: number,
  scopeKey: string,
  cardId: string,
  filter: CardTransactionFilter,
  transactionId: string,
  listSnapshot: CardTransactionHistoryState,
): CardTransactionDetailRefreshRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid Card transaction detail refresh request");
  cardTransactionDetailPath(cardId, transactionId);
  if (
    listSnapshot.scopeKey !== scopeKey ||
    listSnapshot.cardId !== cardId ||
    listSnapshot.filter !== filter ||
    !listSnapshot.transactions.some(transaction => transaction.id === transactionId)
  ) throw new Error("Card transaction detail refresh does not match the list snapshot");
  return Object.freeze({requestId, scopeKey, cardId, filter, transactionId, listSnapshot});
}

export function cardTransactionDetailRefreshRequestIsCurrent(
  request: CardTransactionDetailRefreshRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
  currentFilter: CardTransactionFilter,
  currentHistory: CardTransactionHistoryState | null,
  currentTransactionId: string | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cardId === currentCardId &&
      request.filter === currentFilter &&
      request.listSnapshot === currentHistory &&
      request.transactionId === currentTransactionId,
  );
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new DOMException("Card transaction detail request cancelled", "AbortError");
};

export function cardTransactionDetailRefreshWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export async function readCardTransactionDetailRefresh(
  transport: CardTransactionDetailTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  cardId: string,
  selected: CardTransactionRecord,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<CardTransactionRecord> {
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Card transaction detail refresh is unavailable for this session");
  throwIfAborted(signal);
  const raw = await transport({
    path: cardTransactionDetailPath(cardId, selected.id),
    method: "GET",
    signal,
  });
  throwIfAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Card transaction detail refresh session expired");
  return parseExactCardTransactionDetail(raw, selected);
}
