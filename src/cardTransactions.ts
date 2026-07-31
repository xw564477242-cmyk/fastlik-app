import type { CardRecord } from "./cardList";

export const CARD_TRANSACTION_PAGE_SIZE = 25;
export const MAX_CARD_TRANSACTION_CURSOR_LENGTH = 512;

export type CardTransactionStatus =
  | "AUTHORIZED"
  | "CLEARED"
  | "SETTLED"
  | "DECLINED"
  | "REVERSED"
  | "REFUNDED";

export type CardTransactionRecord = Readonly<{
  id: string;
  status: CardTransactionStatus;
  amountMinor: string;
  currency: string;
  merchantName: string | null;
  merchantCategory: string | null;
  occurredAt: string;
}>;

export type CardTransactionPage = Readonly<{
  transactions: CardTransactionRecord[];
  nextCursor: string | null;
}>;

export type CardTransactionRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string | null;
  cardId: string;
  cardVersion: string;
  cursor: string | null;
  cursorHistoryVersion: string;
}>;

export type CardTransactionPaginationState = Readonly<{
  transactions: CardTransactionRecord[];
  nextCursor: string | null;
  cursorHistory: ReadonlySet<string>;
}>;

const statuses: readonly CardTransactionStatus[] = [
  "AUTHORIZED",
  "CLEARED",
  "SETTLED",
  "DECLINED",
  "REVERSED",
  "REFUNDED",
];

const transactionFields = new Set([
  "id",
  "status",
  "amountMinor",
  "authorizedAmountMinor",
  "clearedAmountMinor",
  "settledAmountMinor",
  "reversedAmountMinor",
  "refundedAmountMinor",
  "currency",
  "traceId",
  "merchantName",
  "merchantCategory",
  "occurredAt",
]);
const pageFields = new Set(["transactions", "nextCursor"]);
const signed64Minimum = -(1n << 63n);
const signed64Maximum = (1n << 63n) - 1n;

type OwnData = Readonly<Record<string, PropertyDescriptor>>;

function invalid(label: string): never {
  throw new Error(`Invalid card transaction ${label}`);
}

function assertOrdinaryDataGraph(value: unknown, label: string, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) invalid(label);
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) invalid(label);
    } else if (prototype !== Object.prototype) {
      invalid(label);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") invalid(label);
      const descriptor = descriptors[key];
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) invalid(label);
      if (key !== "length") assertOrdinaryDataGraph(descriptor.value, label, seen);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid card transaction ")) throw error;
    invalid(label);
  }
}

function ordinaryOwnData(value: unknown, allowed: ReadonlySet<string>, label: string): OwnData {
  assertOrdinaryDataGraph(value, label);
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label);
  try {
    if (typeof structuredClone !== "function") invalid(label);
    structuredClone(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) invalid(`${label} fields`);
    return descriptors;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid card transaction ")) throw error;
    invalid(label);
  }
}

const valueOf = (source: OwnData, key: string): unknown => source[key]?.value;

function publicId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) invalid("id");
  return value;
}

function publicCardId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) invalid("card id");
  return value;
}

function signed64Minor(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]*)$/.test(value)) invalid(name);
  const integer = BigInt(value);
  if (integer < signed64Minimum || integer > signed64Maximum) invalid(name);
  return value;
}

function currency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) invalid("currency");
  return value;
}

function nullableText(value: unknown, name: string, maximum: number): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) invalid(name);
  return value;
}

function merchantCategory(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[0-9]{4}$/.test(value)) invalid("merchantCategory");
  return value;
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") invalid("occurredAt");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/.exec(value);
  if (!match) invalid("occurredAt");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value))) {
    invalid("occurredAt");
  }
  return value;
}

export function opaqueCardTransactionCursor(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_CARD_TRANSACTION_CURSOR_LENGTH ||
    value.trim().length < 1 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) invalid("cursor");
  return value;
}

export function parseCardTransaction(value: unknown): CardTransactionRecord {
  const source = ordinaryOwnData(value, transactionFields, "record");
  const status = valueOf(source, "status");
  if (!statuses.includes(status as CardTransactionStatus)) invalid("status");

  // Validate the full Backend public contract before projecting the finite Wallet view.
  for (const field of [
    "amountMinor",
    "authorizedAmountMinor",
    "clearedAmountMinor",
    "settledAmountMinor",
    "reversedAmountMinor",
    "refundedAmountMinor",
  ]) signed64Minor(valueOf(source, field), field);
  nullableText(valueOf(source, "traceId"), "traceId", 128);

  return Object.freeze({
    id: publicId(valueOf(source, "id")),
    status: status as CardTransactionStatus,
    amountMinor: signed64Minor(valueOf(source, "amountMinor"), "amountMinor"),
    currency: currency(valueOf(source, "currency")),
    merchantName: nullableText(valueOf(source, "merchantName"), "merchantName", 160),
    merchantCategory: merchantCategory(valueOf(source, "merchantCategory")),
    occurredAt: canonicalTimestamp(valueOf(source, "occurredAt")),
  });
}

function compareDescending(left: CardTransactionRecord, right: CardTransactionRecord): number {
  if (left.occurredAt !== right.occurredAt) return left.occurredAt > right.occurredAt ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function assertStrictlyDescending(transactions: readonly CardTransactionRecord[]): void {
  for (let index = 1; index < transactions.length; index += 1) {
    if (compareDescending(transactions[index - 1], transactions[index]) >= 0) invalid("order");
  }
}

export function parseCardTransactionPage(value: unknown): CardTransactionPage {
  const source = ordinaryOwnData(value, pageFields, "page");
  const rawTransactions = valueOf(source, "transactions");
  if (!Array.isArray(rawTransactions)) invalid("page");
  if (rawTransactions.length > CARD_TRANSACTION_PAGE_SIZE) {
    throw new Error("Card transaction page exceeds the consumer limit");
  }
  const transactions = rawTransactions.map(parseCardTransaction);
  assertStrictlyDescending(transactions);
  return Object.freeze({
    transactions,
    nextCursor: opaqueCardTransactionCursor(valueOf(source, "nextCursor")),
  });
}

export function cardTransactionPath(cardId: string, cursor?: string): string {
  const canonicalCardId = publicCardId(cardId);
  const query = new URLSearchParams({ limit: String(CARD_TRANSACTION_PAGE_SIZE) });
  if (cursor !== undefined) query.set("cursor", opaqueCardTransactionCursor(cursor) as string);
  return `/v1/cards/${encodeURIComponent(canonicalCardId)}/transactions?${query.toString()}`;
}

export function cardTransactionReadAllowed(sessionEnvironment: string, runtimeEnvironment: string): boolean {
  return sessionEnvironment === runtimeEnvironment && (runtimeEnvironment === "SANDBOX" || runtimeEnvironment === "TEST");
}

export function captureCardTransactionCardVersion(card: CardRecord): string {
  return JSON.stringify([
    card.id,
    card.type,
    card.status,
    card.last4,
    card.expiryMonth,
    card.expiryYear,
    card.currency,
    card.alias,
    card.availableBalanceMinor ?? null,
    card.createdAt,
    card.capabilities.freeze,
    card.capabilities.unfreeze,
    card.capabilities.replace,
    card.capabilities.renew,
    card.capabilities.updateLimits,
  ]);
}

export function cardTransactionCursorHistoryVersion(history: ReadonlySet<string>): string {
  return JSON.stringify([...history]);
}

export function cardTransactionRequestIsCurrent(
  request: CardTransactionRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCard: CardRecord | null,
  currentCursor: string | null,
  currentCursorHistory: ReadonlySet<string>,
): boolean {
  return Boolean(
    currentCard &&
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.cardId === currentCard.id &&
    request.cardVersion === captureCardTransactionCardVersion(currentCard) &&
    request.cursor === currentCursor &&
    request.cursorHistoryVersion === cardTransactionCursorHistoryVersion(currentCursorHistory)
  );
}

export function acceptCardTransactionPage(
  current: readonly CardTransactionRecord[],
  page: CardTransactionPage,
  requestedCursor: string | null,
  cursorHistory: ReadonlySet<string>,
): CardTransactionPaginationState {
  if (requestedCursor !== null && !cursorHistory.has(requestedCursor)) invalid("cursor history");
  if (page.nextCursor !== null && (page.nextCursor === requestedCursor || cursorHistory.has(page.nextCursor))) {
    invalid("cursor loop");
  }
  const knownIds = new Set(current.map((transaction) => transaction.id));
  if (page.transactions.some((transaction) => knownIds.has(transaction.id))) invalid("duplicate across pages");
  const transactions = [...current, ...page.transactions];
  assertStrictlyDescending(transactions);
  const nextHistory = new Set(cursorHistory);
  if (page.nextCursor !== null) nextHistory.add(page.nextCursor);
  return Object.freeze({ transactions, nextCursor: page.nextCursor, cursorHistory: nextHistory });
}
