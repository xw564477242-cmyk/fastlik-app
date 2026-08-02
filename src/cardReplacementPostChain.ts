import type { CardPage, CardRecord } from "./cardList.ts";
import {
  readCardDetailRefresh,
  type CardDetailRefreshReaders,
  type CardDetailRefreshSnapshot,
} from "./cardDetailRefresh.ts";

export const CARD_REPLACEMENT_CONFIRMATION_MAX_PAGES = 25;

export type CardReplacementConfirmation = Readonly<{
  predecessor: CardRecord;
  successor: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardReplacementPostChainCommit = Readonly<CardDetailRefreshSnapshot & {
  predecessor: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardReplacementInvalidatedCommit = Readonly<{
  predecessor: CardRecord;
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
  balance: null;
  limits: null;
  transactions: null;
  timeline: null;
}>;

export type CardReplacementPostChainResult =
  | Readonly<{
      status: "COMPLETE";
      confirmation: CardReplacementConfirmation;
      commit: CardReplacementPostChainCommit;
    }>
  | Readonly<{
      status: "CONFIRMED_REFRESH_FAILED";
      confirmation: CardReplacementConfirmation;
      commit: CardReplacementInvalidatedCommit;
      failure: unknown;
    }>;

export type CardReplacementReaders = Readonly<{
  card: (cardId: string, signal?: AbortSignal) => Promise<CardRecord>;
  cards: (
    cursor: string | null,
    previousCards: readonly CardRecord[],
    signal?: AbortSignal,
  ) => Promise<CardPage>;
}>;

export type CardReplacementPostChainInput = Readonly<{
  selected: CardRecord;
  submit: (signal?: AbortSignal) => Promise<CardRecord>;
  confirm: (
    submitted: CardRecord,
    signal?: AbortSignal,
  ) => Promise<CardReplacementConfirmation>;
  refresh: CardDetailRefreshReaders;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}>;

export class CardReplacementConfirmationError extends Error {
  constructor(message = "Card replacement could not be confirmed by persisted reads") {
    super(message);
    this.name = "CardReplacementConfirmationError";
  }
}

export class CardReplacementPostRefreshError extends Error {
  constructor(message = "Confirmed replacement Card did not match the complete Card refresh") {
    super(message);
    this.name = "CardReplacementPostRefreshError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Card replacement confirmation cancelled", "AbortError");
}

function publicCardVersion(card: CardRecord): string {
  return JSON.stringify([
    card.id,
    card.type,
    card.status,
    card.last4,
    card.expiryMonth,
    card.expiryYear,
    card.currency,
    card.alias,
    Object.prototype.hasOwnProperty.call(card, "availableBalanceMinor"),
    card.availableBalanceMinor,
    card.createdAt,
    card.capabilities.freeze,
    card.capabilities.unfreeze,
    card.capabilities.replace,
    card.capabilities.renew,
    card.capabilities.updateLimits,
  ]);
}

function predecessorImmutableVersion(card: CardRecord): string {
  return JSON.stringify([
    card.id,
    card.type,
    card.last4,
    card.expiryMonth,
    card.expiryYear,
    card.currency,
    card.alias,
    card.createdAt,
  ]);
}

function assertAcceptedSuccessor(selected: CardRecord, submitted: CardRecord): void {
  if (
    submitted.id === selected.id ||
    submitted.type !== selected.type ||
    submitted.currency !== selected.currency ||
    submitted.alias !== selected.alias ||
    submitted.status === "CLOSED" ||
    submitted.status === "FAILED"
  ) throw new CardReplacementConfirmationError("Accepted response does not identify the exact successor Card");
}

/**
 * Confirms one accepted replacement against the canonical predecessor detail,
 * successor detail and one bounded generation of the paginated Card list.
 */
export async function readCardReplacementConfirmation(
  readers: CardReplacementReaders,
  selected: CardRecord,
  submitted: CardRecord,
  signal?: AbortSignal,
): Promise<CardReplacementConfirmation> {
  assertAcceptedSuccessor(selected, submitted);
  throwIfAborted(signal);

  const [predecessor, successor] = await Promise.all([
    readers.card(selected.id, signal),
    readers.card(submitted.id, signal),
  ]);
  throwIfAborted(signal);
  if (
    predecessor.status !== "CLOSED" ||
    predecessorImmutableVersion(predecessor) !== predecessorImmutableVersion(selected) ||
    predecessor.capabilities.freeze ||
    predecessor.capabilities.unfreeze ||
    predecessor.capabilities.replace ||
    predecessor.capabilities.renew ||
    predecessor.capabilities.updateLimits
  ) throw new CardReplacementConfirmationError("Persisted predecessor does not match the exact closed Card generation");
  if (publicCardVersion(successor) !== publicCardVersion(submitted))
    throw new CardReplacementConfirmationError("Persisted successor does not match the accepted response");

  let cursor: string | null = null;
  let accumulated: CardRecord[] = [];
  let listedPredecessor: CardRecord | null = null;
  let listedSuccessor: CardRecord | null = null;
  let nextCursor: string | null = null;
  for (let pageNumber = 0; pageNumber < CARD_REPLACEMENT_CONFIRMATION_MAX_PAGES; pageNumber += 1) {
    throwIfAborted(signal);
    const page = await readers.cards(cursor, accumulated, signal);
    throwIfAborted(signal);
    accumulated = [...accumulated, ...page.cards];
    const predecessorMatches = accumulated.filter(card => card.id === selected.id);
    const successorMatches = accumulated.filter(card => card.id === submitted.id);
    if (predecessorMatches.length > 1 || successorMatches.length > 1)
      throw new CardReplacementConfirmationError("Replacement Card list contains a duplicate generation");
    listedPredecessor = predecessorMatches[0] ?? null;
    listedSuccessor = successorMatches[0] ?? null;
    nextCursor = page.nextCursor;
    if ((listedPredecessor && listedSuccessor) || page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  if (!listedPredecessor || !listedSuccessor)
    throw new CardReplacementConfirmationError("Predecessor or successor is missing from the bounded Card list generation");
  if (
    publicCardVersion(listedPredecessor) !== publicCardVersion(predecessor) ||
    publicCardVersion(listedSuccessor) !== publicCardVersion(successor)
  ) throw new CardReplacementConfirmationError("Card list generation does not match the exact persisted details");

  return Object.freeze({
    predecessor,
    successor,
    cards: Object.freeze([...accumulated]),
    nextCursor,
  });
}

export function createCardReplacementPostChainCommit(
  confirmation: CardReplacementConfirmation,
  snapshot: CardDetailRefreshSnapshot,
): CardReplacementPostChainCommit {
  if (publicCardVersion(snapshot.card) !== publicCardVersion(confirmation.successor))
    throw new CardReplacementPostRefreshError();
  const listed = confirmation.cards.find(card => card.id === snapshot.card.id);
  if (!listed || publicCardVersion(listed) !== publicCardVersion(snapshot.card))
    throw new CardReplacementPostRefreshError();
  return Object.freeze({
    ...snapshot,
    predecessor: confirmation.predecessor,
    cards: Object.freeze(confirmation.cards.map(card =>
      card.id === snapshot.card.id ? snapshot.card : card
    )),
    nextCursor: confirmation.nextCursor,
  });
}

export function createCardReplacementInvalidatedCommit(
  confirmation: CardReplacementConfirmation,
): CardReplacementInvalidatedCommit {
  return Object.freeze({
    predecessor: confirmation.predecessor,
    card: confirmation.successor,
    cards: confirmation.cards,
    nextCursor: confirmation.nextCursor,
    balance: null,
    limits: null,
    transactions: null,
    timeline: null,
  });
}

/** Owns exactly one POST, two exact detail reads, one bounded list and one five-resource refresh. */
export async function runCardReplacementPostChain(
  input: CardReplacementPostChainInput,
): Promise<CardReplacementPostChainResult | null> {
  let confirmation: CardReplacementConfirmation | null = null;
  try {
    const submitted = await input.submit(input.signal);
    if (!input.isCurrent()) return null;
    confirmation = await input.confirm(submitted, input.signal);
    if (!input.isCurrent()) return null;
    try {
      const snapshot = await readCardDetailRefresh(input.refresh, submitted.id, input.signal);
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "COMPLETE",
        confirmation,
        commit: createCardReplacementPostChainCommit(confirmation, snapshot),
      });
    } catch (failure) {
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "CONFIRMED_REFRESH_FAILED",
        confirmation,
        commit: createCardReplacementInvalidatedCommit(confirmation),
        failure,
      });
    }
  } catch (failure) {
    if (!input.isCurrent()) return null;
    throw failure;
  }
}

export function cardReplacementPostChainFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof CardReplacementConfirmationError;
}
