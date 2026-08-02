import type { CardPage, CardRecord } from "./cardList.ts";
import {
  readCardDetailRefresh,
  type CardDetailRefreshReaders,
  type CardDetailRefreshSnapshot,
} from "./cardDetailRefresh.ts";

export const CARD_RENEWAL_CONFIRMATION_MAX_PAGES = 25;

export type CardRenewalConfirmation = Readonly<{
  predecessor: CardRecord;
  renewed: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardRenewalPostChainCommit = Readonly<CardDetailRefreshSnapshot & {
  predecessor: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardRenewalInvalidatedCommit = Readonly<{
  predecessor: CardRecord;
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
  balance: null;
  limits: null;
  transactions: null;
  timeline: null;
}>;

export type CardRenewalPostChainResult =
  | Readonly<{
      status: "COMPLETE";
      confirmation: CardRenewalConfirmation;
      commit: CardRenewalPostChainCommit;
    }>
  | Readonly<{
      status: "CONFIRMED_REFRESH_FAILED";
      confirmation: CardRenewalConfirmation;
      commit: CardRenewalInvalidatedCommit;
      failure: unknown;
    }>;

export type CardRenewalReaders = Readonly<{
  card: (cardId: string, signal?: AbortSignal) => Promise<CardRecord>;
  cards: (
    cursor: string | null,
    previousCards: readonly CardRecord[],
    signal?: AbortSignal,
  ) => Promise<CardPage>;
}>;

export type CardRenewalPostChainInput = Readonly<{
  selected: CardRecord;
  predecessor: (signal?: AbortSignal) => Promise<CardRecord>;
  submit: (signal?: AbortSignal) => Promise<CardRecord>;
  confirm: (renewed: CardRecord, signal?: AbortSignal) => Promise<CardRenewalConfirmation>;
  refresh: CardDetailRefreshReaders;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}>;

export class CardRenewalPredecessorError extends Error {
  constructor(message = "Selected Card does not match the persisted predecessor generation") {
    super(message);
    this.name = "CardRenewalPredecessorError";
  }
}

export class CardRenewalConfirmationError extends Error {
  constructor(message = "Card renewal could not be confirmed by persisted reads") {
    super(message);
    this.name = "CardRenewalConfirmationError";
  }
}

export class CardRenewalPostRefreshError extends Error {
  constructor(message = "Confirmed renewed Card did not match the complete Card refresh") {
    super(message);
    this.name = "CardRenewalPostRefreshError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Card renewal confirmation cancelled", "AbortError");
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

function expiryVersion(card: CardRecord): number | null {
  if (
    !Number.isInteger(card.expiryMonth) ||
    (card.expiryMonth as number) < 1 ||
    (card.expiryMonth as number) > 12 ||
    !Number.isInteger(card.expiryYear) ||
    (card.expiryYear as number) < 2000 ||
    (card.expiryYear as number) > 9999
  ) return null;
  return (card.expiryYear as number) * 12 + (card.expiryMonth as number);
}

function immutableRenewalVersion(card: CardRecord): string {
  return JSON.stringify([
    card.id,
    card.type,
    card.status,
    card.last4,
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

function assertRenewalTransition(predecessor: CardRecord, renewed: CardRecord): void {
  const oldExpiry = expiryVersion(predecessor);
  const newExpiry = expiryVersion(renewed);
  if (
    oldExpiry === null ||
    newExpiry === null ||
    newExpiry <= oldExpiry ||
    immutableRenewalVersion(renewed) !== immutableRenewalVersion(predecessor)
  ) throw new CardRenewalConfirmationError("Renewed Card is not the exact valid successor generation");
}

export function confirmCardRenewalPredecessor(
  selected: CardRecord,
  persisted: CardRecord,
): CardRecord {
  if (publicCardVersion(persisted) !== publicCardVersion(selected))
    throw new CardRenewalPredecessorError();
  return persisted;
}

/** Confirms the renewed generation against exact detail and one bounded list generation. */
export async function readCardRenewalConfirmation(
  readers: CardRenewalReaders,
  predecessor: CardRecord,
  submitted: CardRecord,
  signal?: AbortSignal,
): Promise<CardRenewalConfirmation> {
  assertRenewalTransition(predecessor, submitted);
  throwIfAborted(signal);
  const renewed = await readers.card(predecessor.id, signal);
  throwIfAborted(signal);
  if (publicCardVersion(renewed) !== publicCardVersion(submitted))
    throw new CardRenewalConfirmationError("Persisted renewed Card does not match the accepted response");

  let cursor: string | null = null;
  let accumulated: CardRecord[] = [];
  let listed: CardRecord | null = null;
  let nextCursor: string | null = null;
  for (let pageNumber = 0; pageNumber < CARD_RENEWAL_CONFIRMATION_MAX_PAGES; pageNumber += 1) {
    throwIfAborted(signal);
    const page = await readers.cards(cursor, accumulated, signal);
    throwIfAborted(signal);
    accumulated = [...accumulated, ...page.cards];
    const matches = accumulated.filter(card => card.id === predecessor.id);
    if (matches.length > 1)
      throw new CardRenewalConfirmationError("Renewed Card list contains a duplicate generation");
    listed = matches[0] ?? null;
    nextCursor = page.nextCursor;
    if (listed || page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  if (!listed)
    throw new CardRenewalConfirmationError("Renewed Card is missing from the bounded Card list generation");
  if (publicCardVersion(listed) !== publicCardVersion(renewed))
    throw new CardRenewalConfirmationError("Card list generation does not match the exact renewed detail");

  return Object.freeze({
    predecessor,
    renewed,
    cards: Object.freeze([...accumulated]),
    nextCursor,
  });
}

export function createCardRenewalPostChainCommit(
  confirmation: CardRenewalConfirmation,
  snapshot: CardDetailRefreshSnapshot,
): CardRenewalPostChainCommit {
  if (publicCardVersion(snapshot.card) !== publicCardVersion(confirmation.renewed))
    throw new CardRenewalPostRefreshError();
  const listed = confirmation.cards.find(card => card.id === snapshot.card.id);
  if (!listed || publicCardVersion(listed) !== publicCardVersion(snapshot.card))
    throw new CardRenewalPostRefreshError();
  return Object.freeze({
    ...snapshot,
    predecessor: confirmation.predecessor,
    cards: Object.freeze(confirmation.cards.map(card =>
      card.id === snapshot.card.id ? snapshot.card : card
    )),
    nextCursor: confirmation.nextCursor,
  });
}

export function createCardRenewalInvalidatedCommit(
  confirmation: CardRenewalConfirmation,
): CardRenewalInvalidatedCommit {
  return Object.freeze({
    predecessor: confirmation.predecessor,
    card: confirmation.renewed,
    cards: confirmation.cards,
    nextCursor: confirmation.nextCursor,
    balance: null,
    limits: null,
    transactions: null,
    timeline: null,
  });
}

/** Owns one predecessor GET, exactly one POST, persisted confirmation and one five-resource refresh. */
export async function runCardRenewalPostChain(
  input: CardRenewalPostChainInput,
): Promise<CardRenewalPostChainResult | null> {
  let confirmation: CardRenewalConfirmation | null = null;
  try {
    const predecessor = confirmCardRenewalPredecessor(
      input.selected,
      await input.predecessor(input.signal),
    );
    if (!input.isCurrent()) return null;
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
        commit: createCardRenewalPostChainCommit(confirmation, snapshot),
      });
    } catch (failure) {
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "CONFIRMED_REFRESH_FAILED",
        confirmation,
        commit: createCardRenewalInvalidatedCommit(confirmation),
        failure,
      });
    }
  } catch (failure) {
    if (!input.isCurrent()) return null;
    throw failure;
  }
}

export function cardRenewalPostChainFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof CardRenewalConfirmationError;
}
