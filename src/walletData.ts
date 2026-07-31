export const WALLET_TRANSACTION_PAGE_SIZE = 25;

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
  createdAt: string;
};

export type WalletTransactionPage = {
  items: WalletTransactionRecord[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

export type WalletRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  accountId: string;
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

const dateTime = (value: unknown, name: string): string => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid Wallet ${name}`);
  return value;
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
  return {
    id: publicId(value.id, "transaction id"),
    type: value.type as WalletTransactionRecord["type"],
    status: value.status as WalletTransactionRecord["status"],
    assetCode: assetCode(value.assetCode),
    amount: decimal(value.amount, "transaction amount"),
    createdAt: dateTime(value.createdAt, "transaction createdAt"),
  };
}

export function parseWalletTransactionPage(value: unknown, expectedOffset = 0): WalletTransactionPage {
  if (!isObject(value) || !Array.isArray(value.items) || !isObject(value.pagination))
    throw new Error("Invalid Wallet transaction page");
  if (value.items.length > WALLET_TRANSACTION_PAGE_SIZE)
    throw new Error("Wallet transaction page exceeds the consumer limit");
  const { total, limit, offset, hasMore } = value.pagination;
  if (!Number.isInteger(total) || (total as number) < 0)
    throw new Error("Invalid Wallet transaction total");
  if (limit !== WALLET_TRANSACTION_PAGE_SIZE)
    throw new Error("Invalid Wallet transaction limit");
  if (!Number.isInteger(expectedOffset) || expectedOffset < 0 || offset !== expectedOffset)
    throw new Error("Invalid Wallet transaction offset");
  if (typeof hasMore !== "boolean") throw new Error("Invalid Wallet transaction hasMore");
  return {
    items: value.items.map(parseWalletTransaction),
    pagination: {
      total: total as number,
      limit: limit as number,
      offset: offset as number,
      hasMore,
    },
  };
}

export function walletTransactionPath(accountId: string, offset = 0): string {
  if (!Number.isInteger(offset) || offset < 0) throw new Error("Invalid Wallet transaction offset");
  const query = new URLSearchParams({
    limit: String(WALLET_TRANSACTION_PAGE_SIZE),
    offset: String(offset),
  });
  return `/v1/wallet/accounts/${encodeURIComponent(accountId)}/transactions?${query.toString()}`;
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
