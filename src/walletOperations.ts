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
  scopeKey: string | null;
  cursor: string | null;
};

export type WalletOperationDetailRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  operationId: string;
};

const operationTypes: WalletOperationType[] = [
  "DEPOSIT",
  "INTERNAL_TRANSFER",
  "WITHDRAWAL",
  "FX_CONVERSION",
];
const operationStatuses: WalletOperationStatus[] = [
  "PROCESSING",
  "PENDING_SETTLEMENT",
  "COMPLETED",
  "FAILED",
];
const operationDirections: WalletOperationDirection[] = [
  "OUTGOING",
  "INCOMING",
  "BETWEEN_OWN_ACCOUNTS",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  return value;
};

export function parseWalletOperation(value: unknown): WalletOperationRecord {
  if (!isObject(value)) throw new Error("Invalid Wallet operation record");
  if (!operationTypes.includes(value.type as WalletOperationType))
    throw new Error("Invalid Wallet operation type");
  if (!operationStatuses.includes(value.status as WalletOperationStatus))
    throw new Error("Invalid Wallet operation status");
  if (!operationDirections.includes(value.direction as WalletOperationDirection))
    throw new Error("Invalid Wallet operation direction");
  return {
    id: operationId(value.id),
    type: value.type as WalletOperationType,
    status: value.status as WalletOperationStatus,
    assetCode: assetCode(value.assetCode),
    amount: amount(value.amount),
    direction: value.direction as WalletOperationDirection,
    createdAt: rfc3339DateTime(value.createdAt, "createdAt"),
    completedAt: nullableRfc3339DateTime(value.completedAt, "completedAt"),
    updatedAt: rfc3339DateTime(value.updatedAt, "updatedAt"),
  };
}

export function parseWalletOperationPage(value: unknown): WalletOperationPage {
  if (!isObject(value) || !Array.isArray(value.items))
    throw new Error("Invalid Wallet operation page");
  if (value.items.length > WALLET_OPERATION_PAGE_SIZE)
    throw new Error("Wallet operation page exceeds the consumer limit");
  const items = value.items.map(parseWalletOperation);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("Duplicate Wallet operation id");
  return { items, nextCursor: cursor(value.nextCursor) };
}

export function parseWalletOperationDetail(
  value: unknown,
  expected: Pick<WalletOperationRecord, "id" | "type" | "assetCode" | "amount">,
): WalletOperationRecord {
  const detail = parseWalletOperation(value);
  if (detail.id !== operationId(expected.id))
    throw new Error("Wallet operation detail id does not match the selected operation");
  if (detail.type !== expected.type || !operationTypes.includes(expected.type))
    throw new Error("Wallet operation detail type does not match the selected operation");
  if (detail.assetCode !== assetCode(expected.assetCode))
    throw new Error("Wallet operation detail asset does not match the selected operation");
  if (canonicalAmount(detail.amount) !== canonicalAmount(amount(expected.amount)))
    throw new Error("Wallet operation detail amount does not match the selected operation");
  return detail;
}

export function walletOperationActivityPath(nextCursor?: string): string {
  const query = new URLSearchParams({ limit: String(WALLET_OPERATION_PAGE_SIZE) });
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

export function walletOperationActivityRequestIsCurrent(
  request: WalletOperationActivityRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCursor: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.cursor === currentCursor
  );
}

export function walletOperationDetailRequestIsCurrent(
  request: WalletOperationDetailRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentOperationId: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.operationId === currentOperationId
  );
}
