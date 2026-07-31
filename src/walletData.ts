export const WALLET_TRANSACTION_PAGE_SIZE = 25;
export const WALLET_TRANSFER_STATUS_REFRESH_LIMIT = 5;

export type WalletAccountStatus = "ACTIVE" | "FROZEN" | "CLOSED";

export type WalletAccountRecord = {
  id: string;
  accountCode: string;
  name: string;
  assetCode: string;
  status: WalletAccountStatus;
  currentBalance: string;
  postedBalance: string;
  pendingBalance: string;
  availableBalance: string;
  updatedAt: string;
};

export type WalletBalanceRecord = {
  accountId: string;
  assetCode: string;
  status: WalletAccountStatus;
  currentBalance: string;
  postedBalance: string;
  pendingBalance: string;
  holdBalance: string;
  availableBalance: string;
  updatedAt: string;
};

export type WalletTransactionRecord = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "TRANSFER" | "MERCHANT_PAYMENT" | "REFUND" | "FX";
  status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
  assetCode: string;
  amount: string;
  direction: "OUTGOING" | "INCOMING";
  createdAt: string;
  updatedAt: string;
};

export type WalletTransactionPage = {
  items: WalletTransactionRecord[];
  nextCursor: string | null;
};

export type WalletRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  accountId: string;
};

export type WalletHistoryRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  assetCode: string;
  cursor: string | null;
};

export type WalletTransactionDetailRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  assetCode: string;
  transactionId: string;
};

export type WalletTransferReceipt = {
  id: string;
  type: "INTERNAL_TRANSFER";
  status: "PROCESSING" | "PENDING_SETTLEMENT" | "COMPLETED" | "FAILED";
  assetCode: string;
  amount: string;
  direction: "OUTGOING" | "INCOMING" | "BETWEEN_OWN_ACCOUNTS";
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type WalletTransferStatusRequestIdentity = WalletRequestIdentity & {
  operationId: string;
};

const accountStatuses: WalletAccountStatus[] = ["ACTIVE", "FROZEN", "CLOSED"];
const transactionTypes: WalletTransactionRecord["type"][] = [
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER",
  "MERCHANT_PAYMENT",
  "REFUND",
  "FX",
];
const transactionStatuses: WalletTransactionRecord["status"][] = [
  "PENDING",
  "COMPLETED",
  "FAILED",
  "REVERSED",
];
const transactionDirections: WalletTransactionRecord["direction"][] = ["OUTGOING", "INCOMING"];
const transferStatuses: WalletTransferReceipt["status"][] = [
  "PROCESSING",
  "PENDING_SETTLEMENT",
  "COMPLETED",
  "FAILED",
];
const transferDirections: WalletTransferReceipt["direction"][] = [
  "OUTGOING",
  "INCOMING",
  "BETWEEN_OWN_ACCOUNTS",
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const publicId = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length < 1 || value.length > 128)
    throw new Error(`Invalid Wallet ${name}`);
  return value;
};

const publicText = (value: unknown, name: string, maximum = 120): string => {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum)
    throw new Error(`Invalid Wallet ${name}`);
  return value;
};

const transferOperationId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid Wallet transfer operation id");
  return value;
};

const walletTransactionId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid Wallet transaction id");
  return value;
};

const assetCode = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Z0-9]{2,12}$/.test(value))
    throw new Error("Invalid Wallet asset code");
  return value;
};

const decimal = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,18})?$/.test(value))
    throw new Error(`Invalid Wallet ${name}`);
  return value;
};

const unsignedDecimal = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length > 37 ||
    !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value)
  )
    throw new Error(`Invalid Wallet ${name}`);
  return value;
};

const rfc3339DateTime = (value: unknown, name: string): string => {
  if (typeof value !== "string") throw new Error(`Invalid Wallet ${name}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid Wallet ${name}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid Wallet ${name}`);
  return value;
};

const walletCursor = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("Invalid Wallet transaction cursor");
  return value;
};

const dateTime = (value: unknown, name: string): string => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid Wallet ${name}`);
  return value;
};

const nullableDateTime = (value: unknown, name: string): string | null => {
  if (value === null) return null;
  return dateTime(value, name);
};

const canonicalDecimal = (value: string): string => {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [rawWhole, rawFraction = ""] = unsigned.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  const normalized = fraction ? `${whole}.${fraction}` : whole;
  return negative && normalized !== "0" ? `-${normalized}` : normalized;
};

const accountStatus = (value: unknown): WalletAccountStatus => {
  if (!accountStatuses.includes(value as WalletAccountStatus))
    throw new Error("Invalid Wallet account status");
  return value as WalletAccountStatus;
};

export function parseWalletAccount(value: unknown): WalletAccountRecord {
  if (!isObject(value)) throw new Error("Invalid Wallet account record");
  return {
    id: publicId(value.id, "account id"),
    accountCode: publicText(value.accountCode, "account code", 128),
    name: publicText(value.name, "account name"),
    assetCode: assetCode(value.assetCode),
    status: accountStatus(value.status),
    currentBalance: decimal(value.currentBalance, "current balance"),
    postedBalance: decimal(value.postedBalance, "posted balance"),
    pendingBalance: decimal(value.pendingBalance, "pending balance"),
    availableBalance: decimal(value.availableBalance, "available balance"),
    updatedAt: dateTime(value.updatedAt, "account updatedAt"),
  };
}

export function parseWalletAccounts(value: unknown): WalletAccountRecord[] {
  if (!Array.isArray(value)) throw new Error("Invalid Wallet account list");
  const accounts = value.map(parseWalletAccount);
  if (new Set(accounts.map((account) => account.id)).size !== accounts.length)
    throw new Error("Duplicate Wallet account id");
  return accounts;
}

export function parseWalletBalance(value: unknown): WalletBalanceRecord {
  if (!isObject(value)) throw new Error("Invalid Wallet balance record");
  return {
    accountId: publicId(value.accountId, "balance account id"),
    assetCode: assetCode(value.assetCode),
    status: accountStatus(value.status),
    currentBalance: decimal(value.currentBalance, "current balance"),
    postedBalance: decimal(value.postedBalance, "posted balance"),
    pendingBalance: decimal(value.pendingBalance, "pending balance"),
    holdBalance: decimal(value.holdBalance, "hold balance"),
    availableBalance: decimal(value.availableBalance, "available balance"),
    updatedAt: dateTime(value.updatedAt, "balance updatedAt"),
  };
}

export function parseWalletTransaction(value: unknown): WalletTransactionRecord {
  if (!isObject(value)) throw new Error("Invalid Wallet transaction record");
  if (!transactionTypes.includes(value.type as WalletTransactionRecord["type"]))
    throw new Error("Invalid Wallet transaction type");
  if (!transactionStatuses.includes(value.status as WalletTransactionRecord["status"]))
    throw new Error("Invalid Wallet transaction status");
  if (!transactionDirections.includes(value.direction as WalletTransactionRecord["direction"]))
    throw new Error("Invalid Wallet transaction direction");
  return {
    id: walletTransactionId(value.id),
    type: value.type as WalletTransactionRecord["type"],
    status: value.status as WalletTransactionRecord["status"],
    assetCode: assetCode(value.assetCode),
    amount: unsignedDecimal(value.amount, "transaction amount"),
    direction: value.direction as WalletTransactionRecord["direction"],
    createdAt: rfc3339DateTime(value.createdAt, "transaction createdAt"),
    updatedAt: rfc3339DateTime(value.updatedAt, "transaction updatedAt"),
  };
}

export function parseWalletTransactionDetail(
  value: unknown,
  expected: { transactionId: string; assetCode: string; amount: string },
): WalletTransactionRecord {
  const detail = parseWalletTransaction(value);
  if (detail.id !== walletTransactionId(expected.transactionId))
    throw new Error("Wallet transaction detail id does not match the selected transaction");
  if (detail.assetCode !== assetCode(expected.assetCode))
    throw new Error("Wallet transaction detail asset does not match the selected transaction");
  if (
    canonicalDecimal(detail.amount) !==
    canonicalDecimal(unsignedDecimal(expected.amount, "selected transaction amount"))
  )
    throw new Error("Wallet transaction detail amount does not match the selected transaction");
  return detail;
}

export function parseWalletTransactionPage(value: unknown, expectedAsset?: string): WalletTransactionPage {
  if (!isObject(value) || !Array.isArray(value.items))
    throw new Error("Invalid Wallet transaction page");
  if (value.items.length > WALLET_TRANSACTION_PAGE_SIZE)
    throw new Error("Wallet transaction page exceeds the consumer limit");
  const items = value.items.map(parseWalletTransaction);
  if (new Set(items.map((transaction) => transaction.id)).size !== items.length)
    throw new Error("Duplicate Wallet transaction id");
  if (
    expectedAsset !== undefined &&
    items.some((transaction) => transaction.assetCode !== assetCode(expectedAsset))
  )
    throw new Error("Wallet transaction asset does not match the selected asset");
  return {
    items,
    nextCursor: walletCursor(value.nextCursor),
  };
}

export function parseWalletTransferReceipt(
  value: unknown,
  expected?: { operationId?: string; assetCode?: string; amount?: string },
): WalletTransferReceipt {
  if (!isObject(value)) throw new Error("Invalid Wallet transfer receipt");
  if (value.type !== "INTERNAL_TRANSFER") throw new Error("Invalid Wallet transfer operation type");
  if (!transferStatuses.includes(value.status as WalletTransferReceipt["status"]))
    throw new Error("Invalid Wallet transfer status");
  if (!transferDirections.includes(value.direction as WalletTransferReceipt["direction"]))
    throw new Error("Invalid Wallet transfer direction");
  const receipt: WalletTransferReceipt = {
    id: transferOperationId(value.id),
    type: "INTERNAL_TRANSFER",
    status: value.status as WalletTransferReceipt["status"],
    assetCode: assetCode(value.assetCode),
    amount: decimal(value.amount, "transfer amount"),
    direction: value.direction as WalletTransferReceipt["direction"],
    createdAt: dateTime(value.createdAt, "transfer createdAt"),
    completedAt: nullableDateTime(value.completedAt, "transfer completedAt"),
    updatedAt: dateTime(value.updatedAt, "transfer updatedAt"),
  };
  if (expected?.operationId !== undefined && receipt.id !== expected.operationId)
    throw new Error("Wallet transfer operation does not match the requested operation");
  if (expected?.assetCode !== undefined && receipt.assetCode !== expected.assetCode)
    throw new Error("Wallet transfer asset does not match the request");
  if (
    expected?.amount !== undefined &&
    canonicalDecimal(decimal(expected.amount, "requested transfer amount")) !== canonicalDecimal(receipt.amount)
  )
    throw new Error("Wallet transfer amount does not match the request");
  return receipt;
}

export function walletOperationPath(operationId: string): string {
  return `/v1/wallet/operations/${encodeURIComponent(transferOperationId(operationId))}`;
}

export function walletTransactionPath(selectedAsset: string, cursor?: string): string {
  const query = new URLSearchParams({
    assetCode: assetCode(selectedAsset),
    limit: String(WALLET_TRANSACTION_PAGE_SIZE),
  });
  if (cursor !== undefined) query.set("cursor", walletCursor(cursor) as string);
  return `/v1/wallet/transactions?${query.toString()}`;
}

export function walletTransactionDetailPath(transactionId: string): string {
  return `/v1/wallet/transactions/${encodeURIComponent(walletTransactionId(transactionId))}`;
}

export function mergeWalletTransactionPages(
  current: WalletTransactionRecord[],
  incoming: WalletTransactionRecord[],
): WalletTransactionRecord[] {
  const merged = new Map(current.map((transaction) => [transaction.id, transaction]));
  for (const transaction of incoming) merged.set(transaction.id, transaction);
  return [...merged.values()];
}

export function walletRequestIsCurrent(
  request: WalletRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentAccountId: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.accountId === currentAccountId
  );
}

export function walletHistoryRequestIsCurrent(
  request: WalletHistoryRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentAssetCode: string | null,
  currentCursor: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.assetCode === currentAssetCode &&
    request.cursor === currentCursor
  );
}

export function walletTransactionDetailRequestIsCurrent(
  request: WalletTransactionDetailRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentAssetCode: string | null,
  currentTransactionId: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.assetCode === currentAssetCode &&
    request.transactionId === currentTransactionId
  );
}

export function walletTransferStatusRequestIsCurrent(
  request: WalletTransferStatusRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentAccountId: string | null,
  currentOperationId: string | null,
): boolean {
  return (
    walletRequestIsCurrent(request, currentRequestId, currentScopeKey, currentAccountId) &&
    request.operationId === currentOperationId
  );
}
