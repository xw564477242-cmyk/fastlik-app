import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const CARD_LIST_PAGE_SIZE = 20;
export const CARD_LIST_MAX_JSON_BYTES = 131_072;
export const CARD_LIST_MAX_JSON_DEPTH = 32;

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

export type CardListTransportRequest = Readonly<{
  path: string;
  method: "GET";
  signal?: AbortSignal;
}>;

export type CardListTransport = (
  request: CardListTransportRequest,
) => Promise<string>;

export type CardListRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cursor: string | null;
}>;

export type CardRequestIdentity = { requestId: number; scopeKey: string | null; cardId: string };

export type CardStatusActionDecision = {
  operation: "freeze" | "unfreeze" | null;
  label: string;
  allowed: boolean;
  reason: string | null;
};

const pageFields = ["cards", "nextCursor"] as const;
const cardRequiredFields = [
  "id",
  "type",
  "status",
  "last4",
  "expiryMonth",
  "expiryYear",
  "currency",
  "alias",
  "createdAt",
  "capabilities",
] as const;
const capabilityFields = ["freeze", "unfreeze", "replace", "renew", "updateLimits"] as const;

function exactDataRecord<T extends readonly string[]>(
  value: unknown,
  required: T,
  optional: readonly string[],
  name: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid ${name}`);
  const requiredSet = new Set<string>(required);
  const allowed = new Set<string>([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    [...requiredSet].some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  )
    throw new Error(`Invalid ${name} fields`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new Error(`Invalid ${name} field`);
  }
  return value as Record<string, unknown>;
}

function publicCardDataRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error("Invalid card record");
  const selected: Record<string, unknown> = {};
  for (const key of cardRequiredFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new Error("Invalid card record field");
    selected[key] = descriptor.value;
  }
  const optional = Object.getOwnPropertyDescriptor(value, "availableBalanceMinor");
  if (optional) {
    if (!("value" in optional) || !optional.enumerable)
      throw new Error("Invalid card record field");
    selected.availableBalanceMinor = optional.value;
  }
  return selected;
}

function rejectDuplicateJsonObjectKeys(raw: string): void {
  let index = 0;
  const invalid = () => new Error("Invalid Card list JSON response");
  const skipWhitespace = () => {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1;
  };
  const readString = (): string => {
    const start = index;
    if (raw[index] !== '"') throw invalid();
    index += 1;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        try {
          const decoded = JSON.parse(raw.slice(start, index)) as unknown;
          if (typeof decoded !== "string") throw invalid();
          return decoded;
        } catch {
          throw invalid();
        }
      }
      if (code <= 0x1f) throw invalid();
      if (code === 0x5c) {
        index += 1;
        if (index >= raw.length) throw invalid();
        if (raw[index] === "u") {
          if (!/^[0-9A-Fa-f]{4}$/.test(raw.slice(index + 1, index + 5))) throw invalid();
          index += 5;
        } else index += 1;
      } else index += 1;
    }
    throw invalid();
  };
  const parseValue = (depth: number): void => {
    if (depth > CARD_LIST_MAX_JSON_DEPTH) throw invalid();
    skipWhitespace();
    if (raw[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (raw[index] === "}") {
        index += 1;
        return;
      }
      while (index < raw.length) {
        const key = readString();
        if (keys.has(key)) throw new Error("Duplicate Card list JSON object key");
        keys.add(key);
        skipWhitespace();
        if (raw[index] !== ":") throw invalid();
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") throw invalid();
        index += 1;
        skipWhitespace();
      }
      throw invalid();
    }
    if (raw[index] === "[") {
      index += 1;
      skipWhitespace();
      if (raw[index] === "]") {
        index += 1;
        return;
      }
      while (index < raw.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "]") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") throw invalid();
        index += 1;
        skipWhitespace();
      }
      throw invalid();
    }
    if (raw[index] === '"') {
      readString();
      return;
    }
    for (const literal of ["true", "false", "null"])
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index));
    if (!number) throw invalid();
    index += number[0].length;
  };
  skipWhitespace();
  parseValue(0);
  skipWhitespace();
  if (index !== raw.length) throw invalid();
}

function boundedRawJson(raw: unknown): unknown {
  if (typeof raw !== "string") throw new Error("Invalid Card list raw response");
  if (
    raw.length > CARD_LIST_MAX_JSON_BYTES ||
    new TextEncoder().encode(raw).byteLength > CARD_LIST_MAX_JSON_BYTES
  )
    throw new Error("Card list response exceeds the consumer limit");
  rejectDuplicateJsonObjectKeys(raw);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid Card list JSON response");
  }
}

function publicId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid card id");
  return value;
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(`Invalid card ${name}`);
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

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw new Error("Invalid card createdAt");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value)
    throw new Error("Invalid card createdAt");
  return value;
}

function cardTimestamp(value: unknown, exact: boolean): string {
  if (exact) return canonicalTimestamp(value);
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new Error("Invalid card createdAt");
  return value;
}

function signedInt64(value: unknown): string {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d{0,18})$/.test(value))
    throw new Error("Invalid card balance");
  const parsed = BigInt(value);
  if (parsed < -9_223_372_036_854_775_808n || parsed > 9_223_372_036_854_775_807n)
    throw new Error("Invalid card balance");
  return value;
}

function opaqueCursor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 2 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid card cursor");
  const remainder = value.length % 4;
  const alphabetIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(
    value[value.length - 1],
  );
  if (
    remainder === 1 ||
    (remainder === 2 && alphabetIndex % 16 !== 0) ||
    (remainder === 3 && alphabetIndex % 4 !== 0)
  )
    throw new Error("Invalid card cursor");
  return value;
}

function precedes(left: CardRecord, right: CardRecord): boolean {
  return left.createdAt > right.createdAt || (left.createdAt === right.createdAt && left.id > right.id);
}

function throwIfCardListRequestAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Card list request cancelled", "AbortError");
}

export function cardListRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function parseCardRecordValue(value: unknown, exact: boolean): CardRecord {
  const record = exact
    ? exactDataRecord(value, cardRequiredFields, ["availableBalanceMinor"], "card record")
    : publicCardDataRecord(value);
  if (record.type !== "VIRTUAL" && record.type !== "PHYSICAL") throw new Error("Invalid card type");
  if (!(record.status === "PENDING" || record.status === "ACTIVE" || record.status === "FROZEN" || record.status === "CLOSED" || record.status === "FAILED"))
    throw new Error("Invalid card status");
  const last4 = nullableString(record.last4, "last4");
  if (last4 !== null && !/^\d{4}$/.test(last4)) throw new Error("Invalid card last4");
  if (typeof record.currency !== "string" || !/^[A-Z]{3}$/.test(record.currency))
    throw new Error("Invalid card currency");
  const capabilities = exactDataRecord(record.capabilities, capabilityFields, [], "card capabilities");
  for (const key of capabilityFields)
    if (typeof capabilities[key] !== "boolean") throw new Error(`Invalid card capability ${key}`);
  return {
    id: publicId(record.id),
    type: record.type,
    status: record.status,
    last4,
    expiryMonth: nullableInteger(record.expiryMonth, "expiryMonth", 1, 12),
    expiryYear: nullableInteger(record.expiryYear, "expiryYear", 2000, 9999),
    currency: record.currency,
    alias: nullableString(record.alias, "alias"),
    ...(record.availableBalanceMinor === undefined
      ? {}
      : { availableBalanceMinor: signedInt64(record.availableBalanceMinor) }),
    createdAt: cardTimestamp(record.createdAt, exact),
    capabilities: {
      freeze: capabilities.freeze as boolean,
      unfreeze: capabilities.unfreeze as boolean,
      replace: capabilities.replace as boolean,
      renew: capabilities.renew as boolean,
      updateLimits: capabilities.updateLimits as boolean,
    },
  };
}

export function parseCardRecord(value: unknown): CardRecord {
  return parseCardRecordValue(value, false);
}

export function parseCardPage(value: unknown): CardPage {
  const page = exactDataRecord(value, pageFields, [], "card page");
  if (!Array.isArray(page.cards) || page.cards.length > CARD_LIST_PAGE_SIZE)
    throw new Error("Invalid card page size");
  for (let index = 0; index < page.cards.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(page.cards, index))
      throw new Error("Invalid sparse card page");
  const cards = page.cards.map(value => parseCardRecordValue(value, true));
  if (new Set(cards.map(({ id }) => id)).size !== cards.length)
    throw new Error("Duplicate card id");
  for (let index = 1; index < cards.length; index += 1)
    if (!precedes(cards[index - 1], cards[index]))
      throw new Error("Card page is not strictly monotonic");
  const nextCursor = opaqueCursor(page.nextCursor);
  if (nextCursor !== null && cards.length !== CARD_LIST_PAGE_SIZE)
    throw new Error("Card cursor does not match a full page");
  return { cards, nextCursor };
}

export function parseCardPageRaw(raw: unknown): CardPage {
  return parseCardPage(boundedRawJson(raw));
}

export function cardListPath(cursor?: unknown): string {
  const query = new URLSearchParams({ limit: String(CARD_LIST_PAGE_SIZE) });
  if (cursor !== undefined) query.set("cursor", opaqueCursor(cursor) as string);
  return `/v1/cards?${query.toString()}`;
}

export async function readCardListPage(
  transport: CardListTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  cursor: string | null = null,
  previousCards: readonly CardRecord[] = [],
  signal?: AbortSignal,
): Promise<CardPage> {
  throwIfCardListRequestAborted(signal);
  const scope = walletTransferSessionScope(session, runtimeEnvironment);
  if (!scope || scope !== expectedScopeKey)
    throw new Error("Card list is unavailable for this session");
  if ((cursor === null) !== (previousCards.length === 0))
    throw new Error("Card cursor is not bound to the current list");
  const requestedCursor = cursor === null ? null : opaqueCursor(cursor);
  const raw = await transport({
    path: cardListPath(requestedCursor ?? undefined),
    method: "GET",
    ...(signal ? { signal } : {}),
  });
  throwIfCardListRequestAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment) !== scope)
    throw new Error("Card list session expired during the request");
  const page = parseCardPageRaw(raw);
  const previousIds = new Set(previousCards.map(({ id }) => id));
  if (page.cards.some(({ id }) => previousIds.has(id)))
    throw new Error("Duplicate card id across pages");
  const priorLast = previousCards.at(-1);
  const nextFirst = page.cards[0];
  if (priorLast && nextFirst && !precedes(priorLast, nextFirst))
    throw new Error("Card pages are not strictly monotonic");
  if (page.nextCursor !== null && page.nextCursor === requestedCursor)
    throw new Error("Card cursor loop");
  return page;
}

export function createCardListRequestIdentity(
  requestId: number,
  scopeKey: string,
  cursor: string | null,
): CardListRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid Card list request identity");
  return Object.freeze({
    requestId,
    scopeKey,
    cursor: cursor === null ? null : opaqueCursor(cursor),
  });
}

export function cardListRequestIsCurrent(
  request: CardListRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCursor: string | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cursor === currentCursor,
  );
}

export function mergeCardPages(current: CardRecord[], incoming: CardRecord[]): CardRecord[] {
  const merged = new Map(current.map((card) => [card.id, card]));
  for (const card of incoming) merged.set(card.id, card);
  return [...merged.values()];
}

export function cardStatusActionDecision(
  card: CardRecord,
  expectedScopeKey: string | null,
  currentScopeKey: string | null,
  currentCardId: string | null,
): CardStatusActionDecision {
  if (
    expectedScopeKey === null ||
    expectedScopeKey !== currentScopeKey ||
    card.id !== currentCardId
  ) {
    return {
      operation: null,
      label: "Card action unavailable",
      allowed: false,
      reason: "Card scope or selection changed. Refresh before trying again.",
    };
  }
  if (card.status === "ACTIVE") {
    return card.capabilities.freeze
      ? { operation: "freeze", label: "Freeze", allowed: true, reason: null }
      : {
          operation: "freeze",
          label: "Freeze unavailable",
          allowed: false,
          reason: "Freeze is not permitted by the current card capabilities.",
        };
  }
  if (card.status === "FROZEN") {
    return card.capabilities.unfreeze
      ? { operation: "unfreeze", label: "Unfreeze", allowed: true, reason: null }
      : {
          operation: "unfreeze",
          label: "Unfreeze unavailable",
          allowed: false,
          reason: "Unfreeze is not permitted by the current card capabilities.",
        };
  }
  return {
    operation: null,
    label: "Card action unavailable",
    allowed: false,
    reason: `Card status ${card.status} does not permit freeze or unfreeze.`,
  };
}

export function cardRequestIsCurrent(
  request: CardRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.cardId === currentCardId
  );
}
