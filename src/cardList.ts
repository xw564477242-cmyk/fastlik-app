export const CARD_LIST_PAGE_SIZE = 20;

export type CardCapabilities = {
  freeze: boolean;
  unfreeze: boolean;
  replace: boolean;
  renew: boolean;
  updateLimits: boolean;
};

export type CardRecord = {
  id: string;
  type: "VIRTUAL" | "PHYSICAL";
  status: "PENDING" | "ACTIVE" | "FROZEN" | "CLOSED" | "FAILED";
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  currency: string;
  alias: string | null;
  availableBalanceMinor?: string;
  createdAt: string;
  capabilities: CardCapabilities;
};

export type CardPage = { cards: CardRecord[]; nextCursor: string | null };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid card ${name}`);
  return value;
}

function nullableInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid card ${name}`);
  return value as number;
}

export function parseCardRecord(value: unknown): CardRecord {
  if (!isObject(value)) throw new Error("Invalid card record");
  if (typeof value.id !== "string" || value.id.length === 0) throw new Error("Invalid card id");
  if (value.type !== "VIRTUAL" && value.type !== "PHYSICAL") throw new Error("Invalid card type");
  if (!["PENDING", "ACTIVE", "FROZEN", "CLOSED", "FAILED"].includes(String(value.status)))
    throw new Error("Invalid card status");
  const last4 = nullableString(value.last4, "last4");
  if (last4 !== null && !/^\d{4}$/.test(last4)) throw new Error("Invalid card last4");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency))
    throw new Error("Invalid card currency");
  if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)))
    throw new Error("Invalid card createdAt");
  if (!isObject(value.capabilities)) throw new Error("Invalid card capabilities");
  const capabilities = value.capabilities;
  for (const key of ["freeze", "unfreeze", "replace", "renew", "updateLimits"] as const) {
    if (typeof capabilities[key] !== "boolean") throw new Error(`Invalid card capability ${key}`);
  }
  if (
    value.availableBalanceMinor !== undefined &&
    (typeof value.availableBalanceMinor !== "string" || !/^-?\d+$/.test(value.availableBalanceMinor))
  )
    throw new Error("Invalid card balance");

  return {
    id: value.id,
    type: value.type,
    status: value.status as CardRecord["status"],
    last4,
    expiryMonth: nullableInteger(value.expiryMonth, "expiryMonth", 1, 12),
    expiryYear: nullableInteger(value.expiryYear, "expiryYear", 2000, 9999),
    currency: value.currency,
    alias: nullableString(value.alias, "alias"),
    ...(value.availableBalanceMinor === undefined
      ? {}
      : { availableBalanceMinor: value.availableBalanceMinor }),
    createdAt: value.createdAt,
    capabilities: {
      freeze: capabilities.freeze as boolean,
      unfreeze: capabilities.unfreeze as boolean,
      replace: capabilities.replace as boolean,
      renew: capabilities.renew as boolean,
      updateLimits: capabilities.updateLimits as boolean,
    },
  };
}

export function parseCardPage(value: unknown): CardPage {
  if (!isObject(value) || !Array.isArray(value.cards)) throw new Error("Invalid card page");
  if (
    value.nextCursor !== null &&
    (typeof value.nextCursor !== "string" || value.nextCursor.length === 0 || value.nextCursor.length > 2048)
  )
    throw new Error("Invalid card cursor");
  return { cards: value.cards.map(parseCardRecord), nextCursor: value.nextCursor as string | null };
}

export function cardListPath(cursor?: string): string {
  const query = new URLSearchParams({ limit: String(CARD_LIST_PAGE_SIZE) });
  if (cursor) query.set("cursor", cursor);
  return `/v1/cards?${query.toString()}`;
}

export function mergeCardPages(current: CardRecord[], incoming: CardRecord[]): CardRecord[] {
  const merged = new Map(current.map((card) => [card.id, card]));
  for (const card of incoming) merged.set(card.id, card);
  return [...merged.values()];
}
