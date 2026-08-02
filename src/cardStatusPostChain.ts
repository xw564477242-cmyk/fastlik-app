import type { CardPage, CardRecord } from "./cardList.ts";
import type { CardStatusOperation } from "./cardStatusAction.ts";
import {
  readCardDetailRefresh,
  type CardDetailRefreshReaders,
  type CardDetailRefreshSnapshot,
} from "./cardDetailRefresh.ts";

export const CARD_STATUS_CONFIRMATION_MAX_PAGES = 25;

export type CardStatusConfirmation = Readonly<{
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardStatusCommit = Readonly<CardDetailRefreshSnapshot & {
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type CardStatusInvalidatedCommit = Readonly<{
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
  balance: null;
  limits: null;
  transactions: null;
  timeline: null;
}>;

export type CardStatusPostChainResult =
  | Readonly<{ status: "COMPLETE"; confirmation: CardStatusConfirmation; commit: CardStatusCommit }>
  | Readonly<{
      status: "CONFIRMED_REFRESH_FAILED";
      confirmation: CardStatusConfirmation;
      commit: CardStatusInvalidatedCommit;
      failure: unknown;
    }>;

export type CardStatusReaders = Readonly<{
  card: (cardId: string, signal?: AbortSignal) => Promise<CardRecord>;
  cards: (
    cursor: string | null,
    previousCards: readonly CardRecord[],
    signal?: AbortSignal,
  ) => Promise<CardPage>;
}>;

export type CardStatusPostChainInput = Readonly<{
  selected: CardRecord;
  operation: Extract<CardStatusOperation, "freeze" | "unfreeze">;
  submit: (signal?: AbortSignal) => Promise<CardRecord>;
  confirm: (submitted: CardRecord, signal?: AbortSignal) => Promise<CardStatusConfirmation>;
  refresh: CardDetailRefreshReaders;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}>;

export class CardStatusConfirmationError extends Error {
  constructor(message = "Card status change could not be confirmed by persisted reads") {
    super(message);
    this.name = "CardStatusConfirmationError";
  }
}

export class CardStatusPostRefreshError extends Error {
  constructor(message = "Confirmed Card status did not match the complete Card refresh") {
    super(message);
    this.name = "CardStatusPostRefreshError";
  }
}

const CARD_ID = /^[A-Za-z0-9._:-]{2,128}$/;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Card status confirmation cancelled", "AbortError");
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

function expectedStatus(operation: Extract<CardStatusOperation, "freeze" | "unfreeze">): "ACTIVE" | "FROZEN" {
  return operation === "freeze" ? "FROZEN" : "ACTIVE";
}

/**
 * Confirms one accepted freeze/unfreeze response against both canonical Card
 * detail and the stable paginated Card list. All three public versions must be
 * identical and must retain the immutable selected Card identity.
 */
export async function readCardStatusConfirmation(
  readers: CardStatusReaders,
  selected: CardRecord,
  submitted: CardRecord,
  operation: Extract<CardStatusOperation, "freeze" | "unfreeze">,
  signal?: AbortSignal,
): Promise<CardStatusConfirmation> {
  const sourceStatus = operation === "freeze" ? "ACTIVE" : "FROZEN";
  const targetStatus = expectedStatus(operation);
  if (!CARD_ID.test(selected.id) || selected.status !== sourceStatus)
    throw new CardStatusConfirmationError("Selected Card does not allow this exact status transition");
  if (
    submitted.id !== selected.id ||
    submitted.status !== targetStatus ||
    immutableCardVersion(submitted) !== immutableCardVersion(selected)
  ) throw new CardStatusConfirmationError("Accepted response does not match the selected Card generation");
  throwIfAborted(signal);

  const card = await readers.card(selected.id, signal);
  throwIfAborted(signal);
  if (
    card.status !== targetStatus ||
    cardPublicVersion(card) !== cardPublicVersion(submitted)
  ) throw new CardStatusConfirmationError();

  let cursor: string | null = null;
  let accumulated: CardRecord[] = [];
  let match: CardRecord | null = null;
  let nextCursor: string | null = null;
  for (let pageNumber = 0; pageNumber < CARD_STATUS_CONFIRMATION_MAX_PAGES; pageNumber += 1) {
    throwIfAborted(signal);
    const page = await readers.cards(cursor, accumulated, signal);
    throwIfAborted(signal);
    accumulated = [...accumulated, ...page.cards];
    match = page.cards.find(item => item.id === selected.id) ?? null;
    nextCursor = page.nextCursor;
    if (match || page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  if (!match) throw new CardStatusConfirmationError("Changed Card was not present in the verified Card list");
  if (cardPublicVersion(match) !== cardPublicVersion(card))
    throw new CardStatusConfirmationError();

  return Object.freeze({ card, cards: Object.freeze([...accumulated]), nextCursor });
}

export function createCardStatusCommit(
  confirmation: CardStatusConfirmation,
  snapshot: CardDetailRefreshSnapshot,
): CardStatusCommit {
  if (cardPublicVersion(snapshot.card) !== cardPublicVersion(confirmation.card))
    throw new CardStatusPostRefreshError();
  const listed = confirmation.cards.find(card => card.id === snapshot.card.id);
  if (!listed || cardPublicVersion(listed) !== cardPublicVersion(snapshot.card))
    throw new CardStatusPostRefreshError();
  return Object.freeze({
    ...snapshot,
    cards: Object.freeze(confirmation.cards.map(card =>
      card.id === snapshot.card.id ? snapshot.card : card
    )),
    nextCursor: confirmation.nextCursor,
  });
}

export function createCardStatusInvalidatedCommit(
  confirmation: CardStatusConfirmation,
): CardStatusInvalidatedCommit {
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

/** Owns exactly one POST, two confirmation reads and one complete associated refresh. */
export async function runCardStatusPostChain(
  input: CardStatusPostChainInput,
): Promise<CardStatusPostChainResult | null> {
  let confirmation: CardStatusConfirmation | null = null;
  try {
    const submitted = await input.submit(input.signal);
    if (!input.isCurrent()) return null;
    confirmation = await input.confirm(submitted, input.signal);
    if (!input.isCurrent()) return null;
    try {
      const snapshot = await readCardDetailRefresh(input.refresh, input.selected.id, input.signal);
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "COMPLETE",
        confirmation,
        commit: createCardStatusCommit(confirmation, snapshot),
      });
    } catch (failure) {
      if (!input.isCurrent()) return null;
      return Object.freeze({
        status: "CONFIRMED_REFRESH_FAILED",
        confirmation,
        commit: createCardStatusInvalidatedCommit(confirmation),
        failure,
      });
    }
  } catch (failure) {
    if (!input.isCurrent()) return null;
    throw failure;
  }
}

export function cardStatusPostChainFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof CardStatusConfirmationError;
}
