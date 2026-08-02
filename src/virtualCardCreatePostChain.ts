import type { CardPage, CardRecord } from "./cardList.ts";
import {
  readCardDetailRefresh,
  type CardDetailRefreshReaders,
  type CardDetailRefreshSnapshot,
} from "./cardDetailRefresh.ts";

export const VIRTUAL_CARD_CREATE_CONFIRMATION_MAX_PAGES = 25;

export type VirtualCardCreateConfirmation = Readonly<{
  created: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type VirtualCardCreatePostChainCommit = Readonly<CardDetailRefreshSnapshot & {
  cards: readonly CardRecord[];
  nextCursor: string | null;
}>;

export type VirtualCardCreateInvalidatedCommit = Readonly<{
  card: CardRecord;
  cards: readonly CardRecord[];
  nextCursor: string | null;
  balance: null;
  limits: null;
  transactions: null;
  timeline: null;
}>;

export type VirtualCardCreatePostChainResult =
  | Readonly<{
      status: "COMPLETE";
      confirmation: VirtualCardCreateConfirmation;
      commit: VirtualCardCreatePostChainCommit;
    }>
  | Readonly<{
      status: "CONFIRMED_REFRESH_FAILED";
      confirmation: VirtualCardCreateConfirmation;
      commit: VirtualCardCreateInvalidatedCommit;
      failure: unknown;
    }>;

export type VirtualCardCreateReaders = Readonly<{
  card: (cardId: string, signal?: AbortSignal) => Promise<CardRecord>;
  cards: (
    cursor: string | null,
    previousCards: readonly CardRecord[],
    signal?: AbortSignal,
  ) => Promise<CardPage>;
}>;

export type VirtualCardCreatePostChainInput = Readonly<{
  existingCards: readonly CardRecord[];
  submit: (signal?: AbortSignal) => Promise<CardRecord>;
  confirm: (created: CardRecord, signal?: AbortSignal) => Promise<VirtualCardCreateConfirmation>;
  refresh: CardDetailRefreshReaders;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}>;

export class VirtualCardCreateSubmissionError extends Error {
  constructor(cause: unknown) {
    super("Virtual Card creation submission result is not safely reusable", { cause });
    this.name = "VirtualCardCreateSubmissionError";
  }
}

export class VirtualCardCreateConfirmationError extends Error {
  constructor(message = "Virtual Card creation could not be confirmed by persisted reads", options?: ErrorOptions) {
    super(message, options);
    this.name = "VirtualCardCreateConfirmationError";
  }
}

export class VirtualCardCreatePostRefreshError extends Error {
  constructor(message = "Confirmed Virtual Card did not match the complete Card refresh") {
    super(message);
    this.name = "VirtualCardCreatePostRefreshError";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Virtual Card creation confirmation cancelled", "AbortError");
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

/** Confirms the created Card against one exact detail and one bounded list generation. */
export async function readVirtualCardCreateConfirmation(
  readers: VirtualCardCreateReaders,
  submitted: CardRecord,
  signal?: AbortSignal,
): Promise<VirtualCardCreateConfirmation> {
  if (submitted.type !== "VIRTUAL")
    throw new VirtualCardCreateConfirmationError("Created Card is not the exact Virtual Card generation");
  throwIfAborted(signal);
  const created = await readers.card(submitted.id, signal);
  throwIfAborted(signal);
  if (publicCardVersion(created) !== publicCardVersion(submitted))
    throw new VirtualCardCreateConfirmationError("Persisted Virtual Card does not match the accepted response");

  let cursor: string | null = null;
  let accumulated: CardRecord[] = [];
  let listed: CardRecord | null = null;
  let nextCursor: string | null = null;
  for (let pageNumber = 0; pageNumber < VIRTUAL_CARD_CREATE_CONFIRMATION_MAX_PAGES; pageNumber += 1) {
    throwIfAborted(signal);
    const page = await readers.cards(cursor, accumulated, signal);
    throwIfAborted(signal);
    accumulated = [...accumulated, ...page.cards];
    const matches = accumulated.filter(card => card.id === submitted.id);
    if (matches.length > 1)
      throw new VirtualCardCreateConfirmationError("Virtual Card list contains a duplicate created generation");
    listed = matches[0] ?? null;
    nextCursor = page.nextCursor;
    if (listed || page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  if (!listed)
    throw new VirtualCardCreateConfirmationError("Created Virtual Card is missing from the bounded Card list generation");
  if (publicCardVersion(listed) !== publicCardVersion(created))
    throw new VirtualCardCreateConfirmationError("Card list generation does not match the exact persisted Virtual Card");
  return Object.freeze({ created, cards: Object.freeze([...accumulated]), nextCursor });
}

export function createVirtualCardCreatePostChainCommit(
  confirmation: VirtualCardCreateConfirmation,
  snapshot: CardDetailRefreshSnapshot,
): VirtualCardCreatePostChainCommit {
  if (publicCardVersion(snapshot.card) !== publicCardVersion(confirmation.created))
    throw new VirtualCardCreatePostRefreshError();
  const matches = confirmation.cards.filter(card => card.id === snapshot.card.id);
  if (matches.length !== 1 || publicCardVersion(matches[0]) !== publicCardVersion(snapshot.card))
    throw new VirtualCardCreatePostRefreshError();
  return Object.freeze({
    ...snapshot,
    cards: Object.freeze(confirmation.cards.map(card => card.id === snapshot.card.id ? snapshot.card : card)),
    nextCursor: confirmation.nextCursor,
  });
}

export function createVirtualCardCreateInvalidatedCommit(
  confirmation: VirtualCardCreateConfirmation,
): VirtualCardCreateInvalidatedCommit {
  return Object.freeze({
    card: confirmation.created,
    cards: confirmation.cards,
    nextCursor: confirmation.nextCursor,
    balance: null,
    limits: null,
    transactions: null,
    timeline: null,
  });
}

/** Owns exactly one POST, persisted confirmation and one five-resource refresh. */
export async function runVirtualCardCreatePostChain(
  input: VirtualCardCreatePostChainInput,
): Promise<VirtualCardCreatePostChainResult | null> {
  let submitted: CardRecord;
  try {
    submitted = await input.submit(input.signal);
  } catch (cause) {
    if (!input.isCurrent()) return null;
    throw new VirtualCardCreateSubmissionError(cause);
  }
  if (!input.isCurrent()) return null;
  if (input.existingCards.some(card => card.id === submitted.id))
    throw new VirtualCardCreateConfirmationError("Created Virtual Card collides with the submitted Card generation");
  let confirmation: VirtualCardCreateConfirmation;
  try {
    confirmation = await input.confirm(submitted, input.signal);
  } catch (cause) {
    if (!input.isCurrent()) return null;
    if (cause instanceof VirtualCardCreateConfirmationError) throw cause;
    throw new VirtualCardCreateConfirmationError(undefined, { cause });
  }
  if (!input.isCurrent()) return null;
  try {
    const snapshot = await readCardDetailRefresh(input.refresh, submitted.id, input.signal);
    if (!input.isCurrent()) return null;
    return Object.freeze({
      status: "COMPLETE",
      confirmation,
      commit: createVirtualCardCreatePostChainCommit(confirmation, snapshot),
    });
  } catch (failure) {
    if (!input.isCurrent()) return null;
    return Object.freeze({
      status: "CONFIRMED_REFRESH_FAILED",
      confirmation,
      commit: createVirtualCardCreateInvalidatedCommit(confirmation),
      failure,
    });
  }
}

export function virtualCardCreatePostChainFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof VirtualCardCreateSubmissionError || value instanceof VirtualCardCreateConfirmationError;
}

export function virtualCardCreatePostChainFailureCause(value: unknown): unknown {
  return value instanceof VirtualCardCreateSubmissionError || value instanceof VirtualCardCreateConfirmationError
    ? value.cause ?? value
    : value;
}
