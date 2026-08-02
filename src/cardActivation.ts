import type { CardPage, CardRecord } from "./cardList.ts";

export const CARD_ACTIVATION_LIST_MAX_PAGES = 25;

export type CardActivationConfirmation = Readonly<{
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
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

const CARD_ID = /^[A-Za-z0-9._:-]{2,128}$/;

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

export function cardActivationFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof CardActivationConfirmationError;
}
