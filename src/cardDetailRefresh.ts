import { parseCardBalance, type CardBalanceRecord } from "./cardBalance.ts";
import { parseCardLimits, type CardLimitsRecord } from "./cardLimits.ts";
import { parseCardRecord, type CardRecord } from "./cardList.ts";
import {
  parseCardTransactionPage,
  type CardTransactionPage,
} from "./cardTransactions.ts";
import { parseCardTimelinePage, type CardTimelinePage } from "./cardTimeline.ts";

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
  timeline: CardTimelinePage;
}>;

export type CardDetailRefreshReaders = Readonly<{
  card: (cardId: string, signal?: AbortSignal) => Promise<unknown>;
  balance: (cardId: string, signal?: AbortSignal) => Promise<unknown>;
  limits: (cardId: string, signal?: AbortSignal) => Promise<unknown>;
  transactions: (cardId: string, signal?: AbortSignal) => Promise<unknown>;
  timeline: (cardId: string, signal?: AbortSignal) => Promise<unknown>;
}>;

export type CardDetailRefreshResource = "card" | "balance" | "limits" | "transactions" | "timeline";

export class CardDetailRefreshError extends Error {
  readonly resource: CardDetailRefreshResource;

  constructor(resource: CardDetailRefreshResource, options?: ErrorOptions) {
    super(`Card ${resource} refresh failed`, options);
    this.resource = resource;
  }
}

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

export function cardDetailRefreshRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function throwIfCardDetailRefreshRequestWasAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException("Card detail refresh cancelled", "AbortError");
}

/**
 * Reads one complete Card screen snapshot. Nothing is returned until all five
 * public responses have passed their existing allowlist parsers.
 */
export async function readCardDetailRefresh(
  readers: CardDetailRefreshReaders,
  selectedCardId: string,
  signal?: AbortSignal,
): Promise<CardDetailRefreshSnapshot> {
  if (!CARD_ID.test(selectedCardId)) throw new Error("Invalid Card detail refresh Card ID");
  throwIfCardDetailRefreshRequestWasAborted(signal);

  const guarded = async (resource: CardDetailRefreshResource, read: () => Promise<unknown>) => {
    try {
      return await read();
    } catch (cause) {
      if (cardDetailRefreshRequestWasAborted(cause)) throw cause;
      throw new CardDetailRefreshError(resource, { cause });
    }
  };
  const [rawCard, rawBalance, rawLimits, rawTransactions, rawTimeline] = await Promise.all([
    guarded("card", () => readers.card(selectedCardId, signal)),
    guarded("balance", () => readers.balance(selectedCardId, signal)),
    guarded("limits", () => readers.limits(selectedCardId, signal)),
    guarded("transactions", () => readers.transactions(selectedCardId, signal)),
    guarded("timeline", () => readers.timeline(selectedCardId, signal)),
  ]);
  throwIfCardDetailRefreshRequestWasAborted(signal);

  const card = parseCardRecord(rawCard);
  if (card.id !== selectedCardId)
    throw new Error("Card detail does not match the selected Card");
  const balance = parseCardBalance(rawBalance, selectedCardId);
  const limits = parseCardLimits(rawLimits, selectedCardId);
  const transactions = parseCardTransactionPage(rawTransactions);
  const timeline = parseCardTimelinePage(rawTimeline);
  if (balance.currency !== card.currency)
    throw new Error("Card detail and balance currencies do not match");

  return Object.freeze({ card, balance, limits, transactions, timeline });
}
