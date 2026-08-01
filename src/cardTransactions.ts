export const CARD_TRANSACTION_PAGE_SIZE = 25;
// Matches the Backend's bounded opaque public cursor contract.
export const CARD_TRANSACTION_CURSOR_MAX_BYTES = 16_384;

export const CARD_TRANSACTION_STATUSES = [
  "AUTHORIZED",
  "CLEARED",
  "SETTLED",
  "DECLINED",
  "REVERSED",
  "REFUNDED",
] as const;

export type CardTransactionStatus = (typeof CARD_TRANSACTION_STATUSES)[number];
export const CARD_TRANSACTION_FILTERS = ["ALL", ...CARD_TRANSACTION_STATUSES] as const;
export type CardTransactionFilter = (typeof CARD_TRANSACTION_FILTERS)[number];
export type CardTransactionQuery = Readonly<{
  filter: CardTransactionFilter;
  cursor?: string;
}>;
export type CardTransactionLifecycleType =
  | "AUTHORIZATION"
  | "CLEARING"
  | "SETTLEMENT"
  | "DECLINE"
  | "REVERSAL"
  | "REFUND";

export const CARD_TRANSACTION_PUBLIC_FIELDS = [
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
] as const;

export type CardTransactionRecord = Readonly<{
  id: string;
  status: CardTransactionStatus;
  amountMinor: string;
  authorizedAmountMinor: string;
  clearedAmountMinor: string;
  settledAmountMinor: string;
  reversedAmountMinor: string;
  refundedAmountMinor: string;
  currency: string;
  traceId: string | null;
  merchantName: string | null;
  merchantCategory: string | null;
  occurredAt: string;
}>;

export type CardTransactionPage = Readonly<{
  transactions: readonly CardTransactionRecord[];
  nextCursor: string | null;
}>;

type OwnData = Readonly<Record<string, PropertyDescriptor>>;
const MIN_SIGNED_64 = -9_223_372_036_854_775_808n;
const MAX_SIGNED_64 = 9_223_372_036_854_775_807n;

const ownData = (value: unknown, message: string): OwnData => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  return Object.getOwnPropertyDescriptors(value);
};

const ownValue = (source: OwnData, key: string): unknown => source[key]?.value;

const text = (source: OwnData, key: string, maxBytes: number): string => {
  const value = ownValue(source, key);
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > maxBytes ||
    [...value].some((character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f)
  ) throw new Error(`Invalid card transaction ${key}`);
  return value;
};

const identifier = (source: OwnData, key: string): string => {
  const value = text(source, key, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value))
    throw new Error(`Invalid card transaction ${key}`);
  return value;
};

const minorUnits = (source: OwnData, key: string): string => {
  const value = ownValue(source, key);
  if (typeof value !== "string" || !/^(0|-?[1-9][0-9]{0,18})$/.test(value))
    throw new Error(`Invalid card transaction ${key}`);
  const amount = BigInt(value);
  if (amount < MIN_SIGNED_64 || amount > MAX_SIGNED_64)
    throw new Error(`Invalid card transaction ${key}`);
  return value;
};

const nullableText = (source: OwnData, key: string, maxBytes: number): string | null =>
  ownValue(source, key) === null ? null : text(source, key, maxBytes);

const timestamp = (source: OwnData, key: string): string => {
  const value = text(source, key, 32);
  const parsed = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value)
    throw new Error(`Invalid card transaction ${key}`);
  return value;
};

export function parseCardTransactionFilter(value: unknown): CardTransactionFilter {
  if (
    typeof value !== "string" ||
    !(CARD_TRANSACTION_FILTERS as readonly string[]).includes(value)
  ) throw new Error("Invalid Card transaction status filter");
  return value as CardTransactionFilter;
}

const cursor = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > CARD_TRANSACTION_CURSOR_MAX_BYTES ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  ) throw new Error("Invalid card transaction cursor");
  return value;
};

export function cardTransactionLifecycleType(status: CardTransactionStatus): CardTransactionLifecycleType {
  switch (status) {
    case "AUTHORIZED": return "AUTHORIZATION";
    case "CLEARED": return "CLEARING";
    case "SETTLED": return "SETTLEMENT";
    case "DECLINED": return "DECLINE";
    case "REVERSED": return "REVERSAL";
    case "REFUNDED": return "REFUND";
  }
}

export function parseCardTransaction(value: unknown): CardTransactionRecord {
  const source = ownData(value, "Invalid card transaction record");
  const status = text(source, "status", 32);
  if (!(CARD_TRANSACTION_STATUSES as readonly string[]).includes(status))
    throw new Error("Invalid card transaction status");
  const currency = text(source, "currency", 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid card transaction currency");
  const merchantCategory = nullableText(source, "merchantCategory", 4);
  if (merchantCategory !== null && !/^[0-9]{4}$/.test(merchantCategory))
    throw new Error("Invalid card transaction merchantCategory");

  return Object.freeze({
    id: identifier(source, "id"),
    status: status as CardTransactionStatus,
    amountMinor: minorUnits(source, "amountMinor"),
    authorizedAmountMinor: minorUnits(source, "authorizedAmountMinor"),
    clearedAmountMinor: minorUnits(source, "clearedAmountMinor"),
    settledAmountMinor: minorUnits(source, "settledAmountMinor"),
    reversedAmountMinor: minorUnits(source, "reversedAmountMinor"),
    refundedAmountMinor: minorUnits(source, "refundedAmountMinor"),
    currency,
    traceId: ownValue(source, "traceId") === null ? null : identifier(source, "traceId"),
    merchantName: nullableText(source, "merchantName", 200),
    merchantCategory,
    occurredAt: timestamp(source, "occurredAt"),
  });
}

export function parseCardTransactionPage(
  value: unknown,
  expectedFilter: CardTransactionFilter = "ALL",
): CardTransactionPage {
  const filter = parseCardTransactionFilter(expectedFilter);
  const source = ownData(value, "Invalid card transaction page");
  const rawTransactions = ownValue(source, "transactions");
  if (!Array.isArray(rawTransactions)) throw new Error("Invalid card transaction page");
  if (rawTransactions.length > CARD_TRANSACTION_PAGE_SIZE)
    throw new Error("Card transaction page exceeds the consumer limit");
  const rawCursor = ownValue(source, "nextCursor");
  const nextCursor = rawCursor === null ? null : cursor(rawCursor);
  const transactions = rawTransactions.map(parseCardTransaction);
  if (new Set(transactions.map((transaction) => transaction.id)).size !== transactions.length)
    throw new Error("Duplicate card transaction ids");
  if (filter !== "ALL" && transactions.some((transaction) => transaction.status !== filter))
    throw new Error("Card transaction page does not match the active status filter");
  return Object.freeze({
    transactions: Object.freeze(transactions),
    nextCursor,
  });
}

export function cardTransactionPath(cardId: string, query: CardTransactionQuery): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(cardId))
    throw new Error("Invalid Card transaction Card ID");
  const filter = parseCardTransactionFilter(query.filter);
  const nextCursor = query.cursor === undefined ? undefined : cursor(query.cursor);
  const params = new URLSearchParams({ limit: String(CARD_TRANSACTION_PAGE_SIZE) });
  if (filter !== "ALL") params.set("status", filter);
  if (nextCursor) params.set("cursor", nextCursor);
  return `/v1/cards/${encodeURIComponent(cardId)}/transactions?${params.toString()}`;
}

export function mergeCardTransactionPages(
  current: readonly CardTransactionRecord[],
  incoming: readonly CardTransactionRecord[],
): CardTransactionRecord[] {
  const merged = new Map(current.map((transaction) => [transaction.id, transaction]));
  for (const transaction of incoming) merged.set(transaction.id, transaction);
  return [...merged.values()];
}
