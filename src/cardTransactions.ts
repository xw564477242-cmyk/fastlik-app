export const CARD_TRANSACTION_PAGE_SIZE = 25;

export type CardTransactionStatus =
  | "AUTHORIZED"
  | "CLEARED"
  | "SETTLED"
  | "DECLINED"
  | "REVERSED"
  | "REFUNDED";

export type CardTransactionRecord = {
  id: string;
  status: CardTransactionStatus;
  amountMinor: string;
  currency: string;
  merchantName: string | null;
  merchantCategory: string | null;
  occurredAt: string;
};

export type CardTransactionPage = {
  transactions: CardTransactionRecord[];
  nextCursor: string | null;
};

const statuses: CardTransactionStatus[] = [
  "AUTHORIZED",
  "CLEARED",
  "SETTLED",
  "DECLINED",
  "REVERSED",
  "REFUNDED",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nullableString = (value: unknown, name: string): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid card transaction ${name}`);
  return value;
};

export function parseCardTransaction(value: unknown): CardTransactionRecord {
  if (!isObject(value)) throw new Error("Invalid card transaction record");
  if (typeof value.id !== "string" || value.id.length === 0)
    throw new Error("Invalid card transaction id");
  if (!statuses.includes(value.status as CardTransactionStatus))
    throw new Error("Invalid card transaction status");
  if (typeof value.amountMinor !== "string" || !/^-?\d+$/.test(value.amountMinor))
    throw new Error("Invalid card transaction amount");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))
    throw new Error("Invalid card transaction currency");
  if (typeof value.occurredAt !== "string" || Number.isNaN(Date.parse(value.occurredAt)))
    throw new Error("Invalid card transaction occurredAt");

  return {
    id: value.id,
    status: value.status as CardTransactionStatus,
    amountMinor: value.amountMinor,
    currency: value.currency,
    merchantName: nullableString(value.merchantName, "merchantName"),
    merchantCategory: nullableString(value.merchantCategory, "merchantCategory"),
    occurredAt: value.occurredAt,
  };
}

export function parseCardTransactionPage(value: unknown): CardTransactionPage {
  if (!isObject(value) || !Array.isArray(value.transactions))
    throw new Error("Invalid card transaction page");
  if (value.transactions.length > CARD_TRANSACTION_PAGE_SIZE)
    throw new Error("Card transaction page exceeds the consumer limit");
  if (
    value.nextCursor !== null &&
    (typeof value.nextCursor !== "string" || value.nextCursor.length === 0 || value.nextCursor.length > 2048)
  )
    throw new Error("Invalid card transaction cursor");
  return {
    transactions: value.transactions.map(parseCardTransaction),
    nextCursor: value.nextCursor as string | null,
  };
}

export function cardTransactionPath(cardId: string, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(CARD_TRANSACTION_PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  return `/v1/cards/${encodeURIComponent(cardId)}/transactions?${query.toString()}`;
}

export function mergeCardTransactionPages(
  current: CardTransactionRecord[],
  incoming: CardTransactionRecord[],
): CardTransactionRecord[] {
  const merged = new Map(current.map((transaction) => [transaction.id, transaction]));
  for (const transaction of incoming) merged.set(transaction.id, transaction);
  return [...merged.values()];
}
