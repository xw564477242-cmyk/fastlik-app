import type { CardPage, CardRecord } from "./cardList.ts";
import {
  readCardDetailRefresh,
  type CardDetailRefreshReaders,
  type CardDetailRefreshSnapshot,
} from "./cardDetailRefresh.ts";

export const CARD_ACTIVATION_LIST_MAX_PAGES = 25;

export type CardActivationConfirmation = Readonly<{
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardActivationCommit = Readonly<CardDetailRefreshSnapshot & {
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardActivationInvalidatedCommit = Readonly<{
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
  balance: null;
  limits: null;
  transactions: null;
  timeline: null;
}>;

export type CardActivationPostChainResult =
  | Readonly<{
      status: "COMPLETE";
      confirmation: CardActivationConfirmation;
      commit: CardActivationCommit;
    }>
  | Readonly<{
      status: "CONFIRMED_REFRESH_FAILED";
      confirmation: CardActivationConfirmation;
      commit: CardActivationInvalidatedCommit;
      failure: unknown;
    }>;

export type CardActivationPostChainInput = Readonly<{
  selected: CardRecord;
  submit: (signal?: AbortSignal) => Promise<CardRecord>;
  confirm: (signal?: AbortSignal) => Promise<CardActivationConfirmation>;
  refresh: CardDetailRefreshReaders;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}>;

export type CardActivationReaders = Readonly<{
  card: (cardId: string, signal?: AbortSignal) => Promise<CardRecord>;
  cards: (
    cursor: string | null,
    previousCards: readonly CardRecord[],
    signal?: AbortSignal,
  ) => Promise<CardPage>;
}>;

export class CardActivationConfirmationError extends Error {
  constructor(message = "Card activation could not be confirmed by persisted reads") {
    super(message);
    this.name = "CardActivationConfirmationError";
  }
}

export class CardActivationPostRefreshError extends Error {
  constructor(message = "Confirmed Card activation did not match the complete Card refresh") {
    super(message);
    this.name = "CardActivationPostRefreshError";
  }
}

const CARD_ID = /^[A-Za-z0-9_-]{2,128}$/;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Card activation confirmation cancelled", "AbortError");
}

function cardPublicVersion(card: CardRecord): string {
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

function immutableCardVersion(card: CardRecord): string {
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

/**
 * Confirms a successful activation against both the canonical Card GET and the
 * stable paginated Card list. No caller-visible object is returned until both
 * independent persisted reads agree on the exact ACTIVE public Card.
 */
export async function readCardActivationConfirmation(
  readers: CardActivationReaders,
  selected: CardRecord,
  signal?: AbortSignal,
): Promise<CardActivationConfirmation> {
  if (!CARD_ID.test(selected.id) || selected.status !== "PENDING")
    throw new CardActivationConfirmationError("Only the selected PENDING Card can be confirmed");
  throwIfAborted(signal);

  const card = await readers.card(selected.id, signal);
  throwIfAborted(signal);
  if (
    card.id !== selected.id ||
    card.status !== "ACTIVE" ||
    immutableCardVersion(card) !== immutableCardVersion(selected)
  ) throw new CardActivationConfirmationError();

  let cursor: string | null = null;
  let accumulated: CardRecord[] = [];
  let match: CardRecord | null = null;
  let nextCursor: string | null = null;
  for (let pageNumber = 0; pageNumber < CARD_ACTIVATION_LIST_MAX_PAGES; pageNumber += 1) {
    throwIfAborted(signal);
    const page = await readers.cards(cursor, accumulated, signal);
    throwIfAborted(signal);
    accumulated = [...accumulated, ...page.cards];
    match = page.cards.find(item => item.id === selected.id) ?? null;
    nextCursor = page.nextCursor;
    if (match) break;
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  if (!match) throw new CardActivationConfirmationError("Activated Card was not present in the verified Card list");
  if (match.status !== "ACTIVE" || cardPublicVersion(card) !== cardPublicVersion(match))
    throw new CardActivationConfirmationError();

  return Object.freeze({
    card,
    cards: Object.freeze([...accumulated]),
    nextCursor,
  });
}

/**
 * Produces the only commit-ready activation state. The already-confirmed Card
 * list and the complete five-resource Card snapshot must describe the exact
 * same ACTIVE public Card; otherwise callers must invalidate associated state.
 */
export function createCardActivationCommit(
  confirmation: CardActivationConfirmation,
  snapshot: CardDetailRefreshSnapshot,
): CardActivationCommit {
  if (
    snapshot.card.status !== "ACTIVE" ||
    cardPublicVersion(snapshot.card) !== cardPublicVersion(confirmation.card)
  ) throw new CardActivationPostRefreshError();
  const listed = confirmation.cards.find(card => card.id === snapshot.card.id);
  if (!listed || cardPublicVersion(listed) !== cardPublicVersion(snapshot.card))
    throw new CardActivationPostRefreshError();

  return Object.freeze({
    ...snapshot,
    cards: Object.freeze(confirmation.cards.map(card =>
      card.id === snapshot.card.id ? snapshot.card : card
    )),
    nextCursor: confirmation.nextCursor,
  });
}

export function createCardActivationInvalidatedCommit(
  confirmation: CardActivationConfirmation,
): CardActivationInvalidatedCommit {
  return Object.freeze({
    card: confirmation.card,
    cards: confirmation.cards,
    nextCursor: confirmation.nextCursor,
    balance: null,
    limits: null,
    transactions: null,
    timeline: null,
  });
}

/**
 * Runs the production activation POST, both persisted confirmation reads and
 * the complete five-resource Card refresh as one fail-closed chain. A stale
 * request resolves to null, so late success, failure and 401 completions cannot
 * reach caller-visible commit/error/finally handlers guarded by the same
 * current-request predicate.
 */
export async function runCardActivationPostChain(
  input: CardActivationPostChainInput,
): Promise<CardActivationPostChainResult | null> {
  let confirmation: CardActivationConfirmation | null = null;
  try {
    await input.submit(input.signal);
    if (!input.isCurrent()) return null;

    confirmation = await input.confirm(input.signal);
    if (!input.isCurrent()) return null;

    try {
      const snapshot = await readCardDetailRefresh(
        input.refresh,
        input.selected.id,
        input.signal,
      );
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "COMPLETE",
        confirmation,
        commit: createCardActivationCommit(confirmation, snapshot),
      });
    } catch (failure) {
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "CONFIRMED_REFRESH_FAILED",
        confirmation,
        commit: createCardActivationInvalidatedCommit(confirmation),
        failure,
      });
    }
  } catch (failure) {
    if (!input.isCurrent()) return null;
    throw failure;
  }
}

export function cardActivationFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof CardActivationConfirmationError;
}
