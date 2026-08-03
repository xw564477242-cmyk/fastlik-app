import type { WalletTransferEnvironment, WalletTransferSession } from "./walletTransfer";

export const WALLET_TRANSACTION_PAGE_SIZE = 25;
export const WALLET_TRANSACTION_MAX_JSON_BYTES = 131_072;
export const WALLET_TRANSACTION_MAX_JSON_DEPTH = 64;
export const WALLET_TRANSACTION_PATH = "/v1/wallet/transactions";
export const WALLET_ACCOUNT_TRANSACTION_PATH_PREFIX = "/v1/wallet/accounts";

export const WALLET_TRANSACTION_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER",
  "MERCHANT_PAYMENT",
  "REFUND",
  "FX",
] as const;
export const WALLET_TRANSACTION_STATUSES = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REVERSED",
] as const;
export const WALLET_TRANSACTION_DIRECTIONS = ["OUTGOING", "INCOMING"] as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];
export type WalletTransactionStatus = (typeof WALLET_TRANSACTION_STATUSES)[number];
export type WalletTransactionDirection = (typeof WALLET_TRANSACTION_DIRECTIONS)[number];

export type WalletTransactionRecord = Readonly<{
  id: string;
  operationId: string | null;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  assetCode: string;
  amount: string;
  direction: WalletTransactionDirection;
  createdAt: string;
  updatedAt: string;
}>;

/** Account-bound alias used by pages whose cursor and ownership are tied to one account. */
export type WalletAccountTransactionRecord = Readonly<
  WalletTransactionRecord
>;

export type WalletTransactionFilters = Readonly<{
  type?: WalletTransactionType;
  status?: WalletTransactionStatus;
  assetCode?: string;
  limit: number;
}>;

export type WalletTransactionFilterSelection = Readonly<{
  type: "ALL" | WalletTransactionType;
  status: "ALL" | WalletTransactionStatus;
}>;

export type WalletTransactionOwnedAccount = Readonly<{
  id: string;
  assetCode: string;
}>;

export type WalletTransactionHistoryState = Readonly<{
  items: readonly WalletTransactionRecord[];
  nextCursor: string | null;
  filterKey: string;
  cursorTrail: readonly string[];
}>;

export type WalletAccountTransactionHistoryState = Readonly<{
  accountId: string;
  items: readonly WalletAccountTransactionRecord[];
  nextCursor: string | null;
  filterKey: string;
  cursorTrail: readonly string[];
}>;

export type WalletTransactionTransportRequest = Readonly<{
  path: string;
  method: "GET";
  signal?: AbortSignal;
}>;

export type WalletTransactionTransport = (
  request: WalletTransactionTransportRequest,
) => Promise<string>;

export type WalletTransactionHistoryRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  filterKey: string;
  cursor: string | null;
}>;

export type WalletTransactionDetailRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  accountId: string;
  filterKey: string;
  transactionKey: string;
}>;

const pageFields = ["items", "nextCursor"] as const;
const transactionFields = [
  "id",
  "operationId",
  "type",
  "status",
  "assetCode",
  "amount",
  "direction",
  "createdAt",
  "updatedAt",
] as const;
const accountTransactionFields = transactionFields;
const filterFields = ["type", "status", "assetCode", "limit"] as const;
const filterSelectionFields = ["type", "status"] as const;

function throwIfWalletTransactionRequestAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw new DOMException("Wallet transaction request cancelled", "AbortError");
}

export function walletTransactionRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function walletTransactionSessionScope(
  session: WalletTransferSession | null,
  runtimeEnvironment: WalletTransferEnvironment | undefined,
  now = Date.now(),
): string | null {
  if (
    !session ||
    (runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST") ||
    session.environment !== runtimeEnvironment ||
    typeof session.expiresAt !== "string"
  )
    return null;
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  if (
    ![session.actorId, session.tenantId, session.customerId].every(
      (value) => typeof value === "string" && value.length > 0 && value.length <= 128,
    )
  )
    return null;
  return JSON.stringify([
    session.actorId,
    session.tenantId,
    session.customerId,
    session.environment,
    session.expiresAt,
  ]);
}

function rejectDuplicateJsonObjectKeys(raw: string): void {
  let index = 0;
  const invalid = () => new Error("Invalid Wallet transaction JSON response");
  const skipWhitespace = () => {
    while (
      index < raw.length &&
      (raw[index] === " " || raw[index] === "\t" || raw[index] === "\n" || raw[index] === "\r")
    )
      index += 1;
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
    if (depth > WALLET_TRANSACTION_MAX_JSON_DEPTH) throw invalid();
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
        if (keys.has(key)) throw new Error("Duplicate Wallet transaction JSON object key");
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
  parseValue(0);
  skipWhitespace();
  if (index !== raw.length) throw invalid();
}

function boundedRawJson(raw: unknown): unknown {
  if (typeof raw !== "string") throw new Error("Invalid Wallet transaction raw response");
  if (
    raw.length > WALLET_TRANSACTION_MAX_JSON_BYTES ||
    new TextEncoder().encode(raw).byteLength > WALLET_TRANSACTION_MAX_JSON_BYTES
  )
    throw new Error("Wallet transaction response exceeds the consumer limit");
  rejectDuplicateJsonObjectKeys(raw);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid Wallet transaction JSON response");
  }
}

function exactDataRecord<T extends readonly string[]>(
  value: unknown,
  fields: T,
  name: string,
): Record<T[number], unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid ${name}`);
  const allowed = new Set<string>(fields);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !allowed.has(key)))
    throw new Error(`Invalid ${name} fields`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new Error(`Invalid ${name} field`);
  }
  return value as Record<T[number], unknown>;
}

function optionalDataRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error("Invalid Wallet transaction filters");
  const allowed = new Set<string>(filterFields);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key))
      throw new Error("Invalid Wallet transaction filter field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new Error("Invalid Wallet transaction filter field");
  }
  return value as Record<string, unknown>;
}

function publicId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid Wallet transaction id");
  return value;
}

function assetCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z0-9]{2,12}$/.test(value))
    throw new Error("Invalid Wallet transaction asset code");
  return value;
}

function absoluteAmount(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 37 ||
    !/^(?:0|[1-9]\d{0,17}|(?:0|[1-9]\d{0,17})\.\d{0,17}[1-9])$/.test(value)
  )
    throw new Error("Invalid Wallet transaction amount");
  return value;
}

function canonicalTimestamp(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw new Error(`Invalid Wallet transaction ${name}`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value)
    throw new Error(`Invalid Wallet transaction ${name}`);
  return value;
}

function canonicalBase64UrlSegment(value: string): boolean {
  if (value.length < 1 || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const remainder = value.length % 4;
  const finalAlphabetIndex = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".indexOf(
    value[value.length - 1],
  );
  return !(
    remainder === 1 ||
    (remainder === 2 && finalAlphabetIndex % 16 !== 0) ||
    (remainder === 3 && finalAlphabetIndex % 4 !== 0)
  );
}

function opaqueCursor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 512) throw new Error("Invalid Wallet transaction cursor");
  const segments = value.split(".");
  if (segments.length !== 2 || !segments.every(canonicalBase64UrlSegment))
    throw new Error("Invalid Wallet transaction cursor");
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new Error(`Invalid Wallet transaction ${name}`);
  return value as T;
}

export function normalizeWalletTransactionFilters(value: unknown): WalletTransactionFilters {
  const record = optionalDataRecord(value);
  const type = record.type === undefined
    ? undefined
    : enumValue(record.type, WALLET_TRANSACTION_TYPES, "type filter");
  const status = record.status === undefined
    ? undefined
    : enumValue(record.status, WALLET_TRANSACTION_STATUSES, "status filter");
  const selectedAsset = record.assetCode === undefined ? undefined : assetCode(record.assetCode);
  const limit = record.limit === undefined ? WALLET_TRANSACTION_PAGE_SIZE : record.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 50)
    throw new Error("Invalid Wallet transaction page limit");
  return { type, status, assetCode: selectedAsset, limit: limit as number };
}

export function normalizeWalletTransactionFilterSelection(
  value: unknown,
): WalletTransactionFilterSelection {
  const record = exactDataRecord(
    value,
    filterSelectionFields,
    "Wallet transaction filter selection",
  );
  return {
    type: record.type === "ALL"
      ? "ALL"
      : enumValue(record.type, WALLET_TRANSACTION_TYPES, "type filter"),
    status: record.status === "ALL"
      ? "ALL"
      : enumValue(record.status, WALLET_TRANSACTION_STATUSES, "status filter"),
  };
}

export function walletTransactionFiltersForSelectedAsset(
  selectionInput: unknown,
  selectedAsset: unknown,
): WalletTransactionFilters {
  const selection = normalizeWalletTransactionFilterSelection(selectionInput);
  return normalizeWalletTransactionFilters({
    ...(selection.type === "ALL" ? {} : { type: selection.type }),
    ...(selection.status === "ALL" ? {} : { status: selection.status }),
    assetCode: assetCode(selectedAsset),
    limit: WALLET_TRANSACTION_PAGE_SIZE,
  });
}

export function walletTransactionFilterRequestAllowed(
  account: WalletTransactionOwnedAccount | null,
  ownedAccounts: readonly WalletTransactionOwnedAccount[],
  selectedAccount: WalletTransactionOwnedAccount | null,
  expectedScope: string | null,
  currentScope: string | null,
): boolean {
  return Boolean(
    account &&
    expectedScope &&
    expectedScope === currentScope &&
    selectedAccount?.id === account.id &&
    selectedAccount.assetCode === account.assetCode &&
    ownedAccounts.some(row => row.id === account.id && row.assetCode === account.assetCode),
  );
}

export function walletTransactionFilterKey(filters: WalletTransactionFilters): string {
  return JSON.stringify([
    filters.type ?? null,
    filters.status ?? null,
    filters.assetCode ?? null,
    filters.limit,
  ]);
}

export function walletTransactionPath(
  filtersInput: unknown,
  cursorInput?: unknown,
): string {
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.status) query.set("status", filters.status);
  if (filters.assetCode) query.set("assetCode", filters.assetCode);
  query.set("limit", String(filters.limit));
  if (cursorInput !== undefined) query.set("cursor", opaqueCursor(cursorInput) as string);
  return `${WALLET_TRANSACTION_PATH}?${query.toString()}`;
}

export function walletAccountTransactionPath(
  accountIdInput: unknown,
  filtersInput: unknown,
  cursorInput?: unknown,
): string {
  const accountId = publicId(accountIdInput);
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.status) query.set("status", filters.status);
  if (filters.assetCode) query.set("assetCode", filters.assetCode);
  query.set("limit", String(filters.limit));
  if (cursorInput !== undefined) query.set("cursor", opaqueCursor(cursorInput) as string);
  return `${WALLET_ACCOUNT_TRANSACTION_PATH_PREFIX}/${encodeURIComponent(accountId)}/transactions?${query.toString()}`;
}

function parseRecord(value: unknown): WalletTransactionRecord {
  const record = exactDataRecord(value, transactionFields, "Wallet transaction record");
  const createdAt = canonicalTimestamp(record.createdAt, "createdAt");
  const updatedAt = canonicalTimestamp(record.updatedAt, "updatedAt");
  if (Date.parse(updatedAt) < Date.parse(createdAt))
    throw new Error("Invalid Wallet transaction time order");
  return {
    id: publicId(record.id),
    operationId: record.operationId === null ? null : publicId(record.operationId),
    type: enumValue(record.type, WALLET_TRANSACTION_TYPES, "type"),
    status: enumValue(record.status, WALLET_TRANSACTION_STATUSES, "status"),
    assetCode: assetCode(record.assetCode),
    amount: absoluteAmount(record.amount),
    direction: enumValue(record.direction, WALLET_TRANSACTION_DIRECTIONS, "direction"),
    createdAt,
    updatedAt,
  };
}

function parseAccountRecord(value: unknown): WalletAccountTransactionRecord {
  const record = exactDataRecord(
    value,
    accountTransactionFields,
    "Wallet account transaction record",
  );
  const createdAt = canonicalTimestamp(record.createdAt, "createdAt");
  const updatedAt = canonicalTimestamp(record.updatedAt, "updatedAt");
  if (Date.parse(updatedAt) < Date.parse(createdAt))
    throw new Error("Invalid Wallet transaction time order");
  return {
    id: publicId(record.id),
    type: enumValue(record.type, WALLET_TRANSACTION_TYPES, "type"),
    status: enumValue(record.status, WALLET_TRANSACTION_STATUSES, "status"),
    assetCode: assetCode(record.assetCode),
    amount: absoluteAmount(record.amount),
    direction: enumValue(record.direction, WALLET_TRANSACTION_DIRECTIONS, "direction"),
    createdAt,
    updatedAt,
    operationId: record.operationId === null ? null : publicId(record.operationId),
  };
}

function precedes(left: WalletTransactionRecord, right: WalletTransactionRecord): boolean {
  return left.createdAt > right.createdAt || (left.createdAt === right.createdAt && left.id > right.id);
}

export function parseWalletTransactionPageRaw(
  raw: unknown,
  filtersInput: unknown,
): { items: WalletTransactionRecord[]; nextCursor: string | null } {
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const page = exactDataRecord(boundedRawJson(raw), pageFields, "Wallet transaction page");
  if (!Array.isArray(page.items) || page.items.length > filters.limit)
    throw new Error("Invalid Wallet transaction page size");
  for (let index = 0; index < page.items.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(page.items, index))
      throw new Error("Invalid sparse Wallet transaction page");
  const items = page.items.map(parseRecord);
  if (new Set(items.map(({ id }) => id)).size !== items.length)
    throw new Error("Duplicate Wallet transaction id");
  if (
    items.some(
      (item) =>
        (filters.type !== undefined && item.type !== filters.type) ||
        (filters.status !== undefined && item.status !== filters.status) ||
        (filters.assetCode !== undefined && item.assetCode !== filters.assetCode),
    )
  )
    throw new Error("Wallet transaction does not match the requested filters");
  for (let index = 1; index < items.length; index += 1)
    if (!precedes(items[index - 1], items[index]))
      throw new Error("Wallet transaction page is not strictly monotonic");
  const nextCursor = opaqueCursor(page.nextCursor);
  if (nextCursor !== null && items.length !== filters.limit)
    throw new Error("Wallet transaction cursor does not match a full page");
  return { items, nextCursor };
}

export function parseWalletAccountTransactionPageRaw(
  raw: unknown,
  filtersInput: unknown,
): { items: WalletAccountTransactionRecord[]; nextCursor: string | null } {
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const page = exactDataRecord(
    boundedRawJson(raw),
    pageFields,
    "Wallet account transaction page",
  );
  if (!Array.isArray(page.items) || page.items.length > filters.limit)
    throw new Error("Invalid Wallet account transaction page size");
  for (let index = 0; index < page.items.length; index += 1)
    if (!Object.prototype.hasOwnProperty.call(page.items, index))
      throw new Error("Invalid sparse Wallet account transaction page");
  const items = page.items.map(parseAccountRecord);
  if (new Set(items.map(({ id }) => id)).size !== items.length)
    throw new Error("Duplicate Wallet account transaction id");
  if (
    items.some(
      (item) =>
        (filters.type !== undefined && item.type !== filters.type) ||
        (filters.status !== undefined && item.status !== filters.status) ||
        (filters.assetCode !== undefined && item.assetCode !== filters.assetCode),
    )
  )
    throw new Error("Wallet account transaction does not match the requested filters");
  for (let index = 1; index < items.length; index += 1)
    if (!precedes(items[index - 1], items[index]))
      throw new Error("Wallet account transaction page is not strictly monotonic");
  const nextCursor = opaqueCursor(page.nextCursor);
  if (nextCursor !== null && items.length !== filters.limit)
    throw new Error("Wallet account transaction cursor does not match a full page");
  return { items, nextCursor };
}

export function advanceWalletTransactionHistory(
  previous: WalletTransactionHistoryState | null,
  page: { items: readonly WalletTransactionRecord[]; nextCursor: string | null },
  filtersInput: unknown,
  requestedCursor: string | null,
): WalletTransactionHistoryState {
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const filterKey = walletTransactionFilterKey(filters);
  if (previous !== null) {
    if (previous.filterKey !== filterKey || previous.nextCursor !== requestedCursor)
      throw new Error("Wallet transaction cursor is not bound to the current filters");
    const priorLast = previous.items.at(-1);
    const nextFirst = page.items[0];
    if (priorLast && nextFirst && !precedes(priorLast, nextFirst))
      throw new Error("Wallet transaction pages are not strictly monotonic");
  } else if (requestedCursor !== null) {
    throw new Error("Wallet transaction initial page cannot use a cursor");
  }
  const previousIds = new Set(previous?.items.map(({ id }) => id) ?? []);
  if (page.items.some(({ id }) => previousIds.has(id)))
    throw new Error("Duplicate Wallet transaction id across pages");
  const trail = previous?.cursorTrail ?? [];
  if (
    page.nextCursor !== null &&
    (page.nextCursor === requestedCursor || trail.includes(page.nextCursor))
  )
    throw new Error("Wallet transaction cursor loop or rollback");
  return {
    items: [...(previous?.items ?? []), ...page.items],
    nextCursor: page.nextCursor,
    filterKey,
    cursorTrail: page.nextCursor === null ? [...trail] : [...trail, page.nextCursor],
  };
}

export function advanceWalletAccountTransactionHistory(
  accountIdInput: unknown,
  previous: WalletAccountTransactionHistoryState | null,
  page: { items: readonly WalletAccountTransactionRecord[]; nextCursor: string | null },
  filtersInput: unknown,
  requestedCursor: string | null,
): WalletAccountTransactionHistoryState {
  const accountId = publicId(accountIdInput);
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const filterKey = walletTransactionFilterKey(filters);
  if (previous !== null) {
    if (
      previous.accountId !== accountId ||
      previous.filterKey !== filterKey ||
      previous.nextCursor !== requestedCursor
    ) throw new Error("Wallet account transaction cursor is not bound to the current account and filters");
    const priorLast = previous.items.at(-1);
    const nextFirst = page.items[0];
    if (priorLast && nextFirst && !precedes(priorLast, nextFirst))
      throw new Error("Wallet account transaction pages are not strictly monotonic");
  } else if (requestedCursor !== null) {
    throw new Error("Wallet account transaction initial page cannot use a cursor");
  }
  const previousIds = new Set(previous?.items.map(({ id }) => id) ?? []);
  if (page.items.some(({ id }) => previousIds.has(id)))
    throw new Error("Duplicate Wallet account transaction id across pages");
  const trail = previous?.cursorTrail ?? [];
  if (
    page.nextCursor !== null &&
    (page.nextCursor === requestedCursor || trail.includes(page.nextCursor))
  ) throw new Error("Wallet account transaction cursor loop or rollback");
  return {
    accountId,
    items: [...(previous?.items ?? []), ...page.items],
    nextCursor: page.nextCursor,
    filterKey,
    cursorTrail: page.nextCursor === null ? [...trail] : [...trail, page.nextCursor],
  };
}

export async function readWalletTransactionHistory(
  transport: WalletTransactionTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  filtersInput: unknown,
  previous: WalletTransactionHistoryState | null = null,
  signal?: AbortSignal,
): Promise<WalletTransactionHistoryState> {
  throwIfWalletTransactionRequestAborted(signal);
  const scope = walletTransactionSessionScope(session, runtimeEnvironment);
  if (!scope) throw new Error("Wallet transaction history is unavailable for this session");
  const filters = normalizeWalletTransactionFilters(filtersInput);
  const filterKey = walletTransactionFilterKey(filters);
  if (previous && previous.filterKey !== filterKey)
    throw new Error("Wallet transaction filters changed before pagination");
  const requestedCursor = previous?.nextCursor ?? null;
  if (previous && requestedCursor === null)
    throw new Error("Wallet transaction history has no next page");
  const raw = await transport({
    path: walletTransactionPath(filters, requestedCursor ?? undefined),
    method: "GET",
    ...(signal ? { signal } : {}),
  });
  throwIfWalletTransactionRequestAborted(signal);
  if (walletTransactionSessionScope(session, runtimeEnvironment) !== scope)
    throw new Error("Wallet transaction session expired during the request");
  const page = parseWalletTransactionPageRaw(raw, filters);
  return advanceWalletTransactionHistory(previous, page, filters, requestedCursor);
}

export async function readWalletAccountTransactionHistory(
  transport: WalletTransactionTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  accountInput: unknown,
  filtersInput: unknown,
  previous: WalletAccountTransactionHistoryState | null = null,
  signal?: AbortSignal,
): Promise<WalletAccountTransactionHistoryState> {
  throwIfWalletTransactionRequestAborted(signal);
  const scope = walletTransactionSessionScope(session, runtimeEnvironment);
  if (!scope) throw new Error("Wallet account transaction history is unavailable for this session");
  const account = exactDataRecord(
    accountInput,
    ["id", "assetCode"] as const,
    "Wallet account transaction owner",
  );
  const accountId = publicId(account.id);
  const accountAsset = assetCode(account.assetCode);
  const filters = normalizeWalletTransactionFilters(filtersInput);
  if (filters.assetCode !== accountAsset)
    throw new Error("Wallet account transaction history is not bound to the account asset");
  const filterKey = walletTransactionFilterKey(filters);
  if (previous && (previous.accountId !== accountId || previous.filterKey !== filterKey))
    throw new Error("Wallet account transaction account or filters changed before pagination");
  const requestedCursor = previous?.nextCursor ?? null;
  if (previous && requestedCursor === null)
    throw new Error("Wallet account transaction history has no next page");
  const raw = await transport({
    path: walletAccountTransactionPath(accountId, filters, requestedCursor ?? undefined),
    method: "GET",
    ...(signal ? { signal } : {}),
  });
  throwIfWalletTransactionRequestAborted(signal);
  if (walletTransactionSessionScope(session, runtimeEnvironment) !== scope)
    throw new Error("Wallet account transaction session expired during the request");
  const page = parseWalletAccountTransactionPageRaw(raw, filters);
  return advanceWalletAccountTransactionHistory(
    accountId,
    previous,
    page,
    filters,
    requestedCursor,
  );
}

export function walletTransactionDetailPath(transactionId: unknown): string {
  return `${WALLET_TRANSACTION_PATH}/${encodeURIComponent(publicId(transactionId))}`;
}

export function parseWalletTransactionDetailRaw(
  raw: unknown,
  selected: WalletTransactionRecord,
): WalletTransactionRecord {
  const detail = parseRecord(boundedRawJson(raw));
  if (
    detail.id !== selected.id ||
    detail.operationId !== selected.operationId ||
    detail.type !== selected.type ||
    detail.assetCode !== selected.assetCode ||
    detail.amount !== selected.amount ||
    detail.direction !== selected.direction ||
    detail.createdAt !== selected.createdAt ||
    Date.parse(detail.updatedAt) < Date.parse(selected.updatedAt)
  )
    throw new Error("Wallet transaction detail changed immutable fields");
  return detail;
}

export async function readWalletTransactionDetail(
  transport: WalletTransactionTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  selected: WalletTransactionRecord,
  signal?: AbortSignal,
): Promise<WalletTransactionRecord> {
  throwIfWalletTransactionRequestAborted(signal);
  const scope = walletTransactionSessionScope(session, runtimeEnvironment);
  if (!scope) throw new Error("Wallet transaction detail is unavailable for this session");
  const raw = await transport({
    path: walletTransactionDetailPath(selected.id),
    method: "GET",
    ...(signal ? { signal } : {}),
  });
  throwIfWalletTransactionRequestAborted(signal);
  if (walletTransactionSessionScope(session, runtimeEnvironment) !== scope)
    throw new Error("Wallet transaction session expired during the request");
  return parseWalletTransactionDetailRaw(raw, selected);
}

export function createWalletTransactionHistoryRequestIdentity(
  requestId: number,
  scopeKey: string,
  filtersInput: unknown,
  cursor: string | null,
): WalletTransactionHistoryRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new Error("Invalid Wallet transaction request generation");
  return {
    requestId,
    scopeKey,
    filterKey: walletTransactionFilterKey(normalizeWalletTransactionFilters(filtersInput)),
    cursor,
  };
}

export function walletTransactionHistoryRequestIsCurrent(
  request: WalletTransactionHistoryRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentFilterKey: string | null,
  currentCursor: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.filterKey === currentFilterKey &&
    request.cursor === currentCursor
  );
}

function walletTransactionRecordKey(record: WalletTransactionRecord): string {
  return JSON.stringify([
    record.id,
    record.operationId,
    record.type,
    record.status,
    record.assetCode,
    record.amount,
    record.direction,
    record.createdAt,
    record.updatedAt,
  ]);
}

export function walletTransactionDetailRefreshAllowed(
  selected: WalletTransactionRecord | null,
  history: WalletTransactionHistoryState | null,
  filtersInput: unknown,
): boolean {
  if (!selected || !history) return false;
  let filterKey: string;
  try {
    filterKey = walletTransactionFilterKey(normalizeWalletTransactionFilters(filtersInput));
  } catch {
    return false;
  }
  const selectedKey = walletTransactionRecordKey(selected);
  return (
    history.filterKey === filterKey &&
    history.items.some(item => walletTransactionRecordKey(item) === selectedKey)
  );
}

export function createWalletTransactionDetailRequestIdentity(
  requestId: number,
  scopeKey: string,
  accountId: string,
  filtersInput: unknown,
  selected: WalletTransactionRecord,
): WalletTransactionDetailRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new Error("Invalid Wallet transaction detail request generation");
  if (typeof scopeKey !== "string" || scopeKey.length < 1 || scopeKey.length > 1024)
    throw new Error("Invalid Wallet transaction detail request scope");
  if (typeof accountId !== "string" || accountId.length < 1 || accountId.length > 128)
    throw new Error("Invalid Wallet transaction detail request account");
  return {
    requestId,
    scopeKey,
    accountId,
    filterKey: walletTransactionFilterKey(normalizeWalletTransactionFilters(filtersInput)),
    transactionKey: walletTransactionRecordKey(selected),
  };
}

export function walletTransactionDetailRequestIsCurrent(
  request: WalletTransactionDetailRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentAccountId: string | null,
  currentFilters: unknown,
  currentHistory: WalletTransactionHistoryState | null,
  currentSelected: WalletTransactionRecord | null,
): boolean {
  if (
    request.requestId !== currentRequestId ||
    request.scopeKey !== currentScopeKey ||
    request.accountId !== currentAccountId ||
    !walletTransactionDetailRefreshAllowed(currentSelected, currentHistory, currentFilters)
  ) return false;
  return (
    request.filterKey === currentHistory?.filterKey &&
    request.transactionKey === walletTransactionRecordKey(currentSelected as WalletTransactionRecord)
  );
}
