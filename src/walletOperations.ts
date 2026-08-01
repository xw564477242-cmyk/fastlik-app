import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const WALLET_OPERATION_PAGE_SIZE = 25;

export type WalletOperationType =
  | "DEPOSIT"
  | "INTERNAL_TRANSFER"
  | "WITHDRAWAL"
  | "FX_CONVERSION";

export type WalletOperationStatus =
  | "PROCESSING"
  | "PENDING_SETTLEMENT"
  | "COMPLETED"
  | "FAILED";

export const WALLET_OPERATION_TYPES = Object.freeze([
  "DEPOSIT",
  "INTERNAL_TRANSFER",
  "WITHDRAWAL",
  "FX_CONVERSION",
] as const);

export const WALLET_OPERATION_STATUSES = Object.freeze([
  "PROCESSING",
  "PENDING_SETTLEMENT",
  "COMPLETED",
  "FAILED",
] as const);

export type WalletOperationFilterSelection = Readonly<{
  type: WalletOperationType | "ALL";
  status: WalletOperationStatus | "ALL";
}>;

export const DEFAULT_WALLET_OPERATION_FILTERS: WalletOperationFilterSelection =
  Object.freeze({ type: "ALL", status: "ALL" });

export type WalletOperationDirection =
  | "OUTGOING"
  | "INCOMING"
  | "BETWEEN_OWN_ACCOUNTS";

export type WalletOperationRecord = {
  id: string;
  type: WalletOperationType;
  status: WalletOperationStatus;
  assetCode: string;
  amount: string;
  direction: WalletOperationDirection;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type WalletOperationPage = {
  items: WalletOperationRecord[];
  nextCursor: string | null;
};

export type WalletOperationActivityRequestIdentity = {
  requestId: number;
  scopeKey: string;
  filterKey: string;
  cursor: string | null;
};

export type WalletOperationDetailRequestIdentity = {
  requestId: number;
  scopeKey: string;
  filterKey: string;
  operationId: string;
  listSnapshot: WalletOperationPage;
};

export type WalletOperationTransportRequest = Readonly<{
  path: string;
  method: "GET";
  signal: AbortSignal;
}>;

export type WalletOperationTransport = (
  request: WalletOperationTransportRequest,
) => Promise<unknown>;

const operationDirections: WalletOperationDirection[] = [
  "OUTGOING",
  "INCOMING",
  "BETWEEN_OWN_ACCOUNTS",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const operationFields = Object.freeze([
  "id",
  "type",
  "status",
  "assetCode",
  "amount",
  "direction",
  "createdAt",
  "completedAt",
  "updatedAt",
] as const);
const pageFields = Object.freeze(["items", "nextCursor"] as const);

function exactDataRecord(
  value: unknown,
  fields: readonly string[],
  name: string,
): Record<string, unknown> {
  if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error(`Invalid ${name}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expected = [...fields].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    keys.some((key) => !("value" in descriptors[key]))
  ) throw new Error(`${name} must contain exactly the public fields`);
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

const operationId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid Wallet operation id");
  return value;
};

const assetCode = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Z0-9]{2,12}$/.test(value))
    throw new Error("Invalid Wallet operation asset code");
  return value;
};

const amount = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length > 37 ||
    !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value)
  )
    throw new Error("Invalid Wallet operation amount");
  return value;
};

const canonicalAmount = (value: string): string => {
  const [whole, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
};

const rfc3339DateTime = (value: unknown, name: string): string => {
  if (typeof value !== "string") throw new Error(`Invalid Wallet operation ${name}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid Wallet operation ${name}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid Wallet operation ${name}`);
  return value;
};

const nullableRfc3339DateTime = (value: unknown, name: string): string | null =>
  value === null ? null : rfc3339DateTime(value, name);

const cursor = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid Wallet operation cursor");
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const canonical = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    if (canonical !== value) throw new Error("non-canonical cursor");
    return value;
  } catch {
    throw new Error("Invalid Wallet operation cursor");
  }
};

export function walletOperationFilterKey(
  filters: WalletOperationFilterSelection,
): string {
  if (
    filters.type !== "ALL" &&
    !(WALLET_OPERATION_TYPES as readonly string[]).includes(filters.type)
  ) throw new Error("Invalid Wallet operation type filter");
  if (
    filters.status !== "ALL" &&
    !(WALLET_OPERATION_STATUSES as readonly string[]).includes(filters.status)
  ) throw new Error("Invalid Wallet operation status filter");
  return JSON.stringify([filters.type, filters.status]);
}

export function parseWalletOperation(value: unknown): WalletOperationRecord {
  const record = exactDataRecord(value, operationFields, "Wallet operation record");
  if (!(WALLET_OPERATION_TYPES as readonly unknown[]).includes(record.type))
    throw new Error("Invalid Wallet operation type");
  if (!(WALLET_OPERATION_STATUSES as readonly unknown[]).includes(record.status))
    throw new Error("Invalid Wallet operation status");
  if (!operationDirections.includes(record.direction as WalletOperationDirection))
    throw new Error("Invalid Wallet operation direction");
  return {
    id: operationId(record.id),
    type: record.type as WalletOperationType,
    status: record.status as WalletOperationStatus,
    assetCode: assetCode(record.assetCode),
    amount: amount(record.amount),
    direction: record.direction as WalletOperationDirection,
    createdAt: rfc3339DateTime(record.createdAt, "createdAt"),
    completedAt: nullableRfc3339DateTime(record.completedAt, "completedAt"),
    updatedAt: rfc3339DateTime(record.updatedAt, "updatedAt"),
  };
}

export function parseWalletOperationPage(value: unknown): WalletOperationPage {
  const record = exactDataRecord(value, pageFields, "Wallet operation page");
  if (!Array.isArray(record.items)) throw new Error("Invalid Wallet operation page");
  if (record.items.length > WALLET_OPERATION_PAGE_SIZE)
    throw new Error("Wallet operation page exceeds the consumer limit");
  const items = record.items.map(parseWalletOperation);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("Duplicate Wallet operation id");
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      Date.parse(previous.createdAt) < Date.parse(current.createdAt) ||
      (previous.createdAt === current.createdAt && previous.id <= current.id)
    ) throw new Error("Wallet operation page order is invalid");
  }
  const nextCursor = cursor(record.nextCursor);
  if (items.length === 0 && nextCursor !== null)
    throw new Error("Invalid Wallet operation cursor");
  return { items, nextCursor };
}

export function parseWalletOperationDetail(
  value: unknown,
  expected: Pick<WalletOperationRecord, "id" | "type" | "assetCode" | "amount">,
): WalletOperationRecord {
  const detail = parseWalletOperation(value);
  if (detail.id !== operationId(expected.id))
    throw new Error("Wallet operation detail id does not match the selected operation");
  if (
    detail.type !== expected.type ||
    !(WALLET_OPERATION_TYPES as readonly string[]).includes(expected.type)
  )
    throw new Error("Wallet operation detail type does not match the selected operation");
  if (detail.assetCode !== assetCode(expected.assetCode))
    throw new Error("Wallet operation detail asset does not match the selected operation");
  if (canonicalAmount(detail.amount) !== canonicalAmount(amount(expected.amount)))
    throw new Error("Wallet operation detail amount does not match the selected operation");
  return detail;
}

export function walletOperationActivityPath(
  filters: WalletOperationFilterSelection,
  nextCursor?: string,
): string {
  walletOperationFilterKey(filters);
  const query = new URLSearchParams();
  if (filters.type !== "ALL") query.set("type", filters.type);
  if (filters.status !== "ALL") query.set("status", filters.status);
  query.set("limit", String(WALLET_OPERATION_PAGE_SIZE));
  if (nextCursor !== undefined) query.set("cursor", cursor(nextCursor) as string);
  return `/v1/wallet/operations?${query.toString()}`;
}

export function walletOperationDetailPath(selectedOperationId: string): string {
  return `/v1/wallet/operations/${encodeURIComponent(operationId(selectedOperationId))}`;
}

export function mergeWalletOperationPages(
  current: WalletOperationRecord[],
  incoming: WalletOperationRecord[],
): WalletOperationRecord[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

export function appendWalletOperationPage(
  current: WalletOperationPage,
  incoming: WalletOperationPage,
  requestedCursor: string,
): WalletOperationPage {
  if (current.nextCursor !== cursor(requestedCursor))
    throw new Error("Wallet operation cursor does not match the current page");
  const seen = new Set(current.items.map((item) => item.id));
  if (incoming.items.some((item) => seen.has(item.id)))
    throw new Error("Duplicate Wallet operation id across pages");
  if (current.items.length && incoming.items.length) {
    const previous = current.items.at(-1)!;
    const next = incoming.items[0];
    if (
      Date.parse(previous.createdAt) < Date.parse(next.createdAt) ||
      (previous.createdAt === next.createdAt && previous.id <= next.id)
    ) throw new Error("Wallet operation page order is invalid");
  }
  if (incoming.nextCursor === requestedCursor)
    throw new Error("Wallet operation cursor loop");
  return {
    items: [...current.items, ...incoming.items],
    nextCursor: incoming.nextCursor,
  };
}

export function createWalletOperationActivityRequestIdentity(
  requestId: number,
  scopeKey: string,
  filters: WalletOperationFilterSelection,
  nextCursor: string | null,
): WalletOperationActivityRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid Wallet operation request identity");
  if (nextCursor !== null) cursor(nextCursor);
  return Object.freeze({
    requestId,
    scopeKey,
    filterKey: walletOperationFilterKey(filters),
    cursor: nextCursor,
  });
}

export function createWalletOperationDetailRequestIdentity(
  requestId: number,
  scopeKey: string,
  filters: WalletOperationFilterSelection,
  selected: WalletOperationRecord,
  listSnapshot: WalletOperationPage,
): WalletOperationDetailRequestIdentity {
  if (!listSnapshot.items.some((item) => item.id === selected.id))
    throw new Error("Wallet operation detail must belong to the current list snapshot");
  walletOperationDetailPath(selected.id);
  return Object.freeze({
    requestId,
    scopeKey,
    filterKey: walletOperationFilterKey(filters),
    operationId: selected.id,
    listSnapshot,
  });
}

export function walletOperationActivityRequestIsCurrent(
  request: WalletOperationActivityRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentFilterKey: string,
  currentCursor: string | null,
  mounted = true,
): boolean {
  return (
    mounted &&
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.filterKey === currentFilterKey &&
    request.cursor === currentCursor
  );
}

export function walletOperationDetailRequestIsCurrent(
  request: WalletOperationDetailRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentFilterKey: string,
  currentListSnapshot: WalletOperationPage | null,
  currentOperationId: string | null,
  mounted = true,
): boolean {
  return (
    mounted &&
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.filterKey === currentFilterKey &&
    request.listSnapshot === currentListSnapshot &&
    request.operationId === currentOperationId
  );
}

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted)
    throw new DOMException("Wallet operation request cancelled", "AbortError");
};

export function walletOperationRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export async function readWalletOperationActivity(
  transport: WalletOperationTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  filters: WalletOperationFilterSelection,
  nextCursor: string | undefined,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<WalletOperationPage> {
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Wallet operation activity is unavailable for this session");
  throwIfAborted(signal);
  const raw = await transport({
    path: walletOperationActivityPath(filters, nextCursor),
    method: "GET",
    signal,
  });
  throwIfAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Wallet operation activity session expired");
  return parseWalletOperationPage(raw);
}

export async function readWalletOperationDetail(
  transport: WalletOperationTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  selected: WalletOperationRecord,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<WalletOperationRecord> {
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Wallet operation detail is unavailable for this session");
  throwIfAborted(signal);
  const raw = await transport({
    path: walletOperationDetailPath(selected.id),
    method: "GET",
    signal,
  });
  throwIfAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Wallet operation detail session expired");
  return parseWalletOperationDetail(raw, selected);
}
