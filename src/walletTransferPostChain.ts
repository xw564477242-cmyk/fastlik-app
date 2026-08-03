import type {
  WalletAccountRecord,
  WalletBalanceRecord,
  WalletTransferReceipt,
} from "./walletData.ts";
import type {
  WalletAccountTransactionHistoryState,
  WalletAccountTransactionRecord,
} from "./walletTransactions.ts";
import { walletTransferFailureIsAmbiguous } from "./walletTransfer.ts";

export type WalletTransferPostChainCommit = Readonly<{
  receipt: WalletTransferReceipt;
  accounts: readonly WalletAccountRecord[];
  sourceAccount: WalletAccountRecord;
  destinationAccount: WalletAccountRecord;
  sourceBalance: WalletBalanceRecord;
  destinationBalance: WalletBalanceRecord;
  sourceTransactions: WalletAccountTransactionHistoryState;
  destinationTransactions: WalletAccountTransactionHistoryState;
}>;

export type WalletTransferInvalidatedCommit = Readonly<{
  receipt: WalletTransferReceipt;
  accounts: null;
  sourceAccount: null;
  destinationAccount: null;
  sourceBalance: null;
  destinationBalance: null;
  sourceTransactions: null;
  destinationTransactions: null;
}>;

export type WalletTransferPostChainResult =
  | Readonly<{
      status: "COMPLETE";
      commit: WalletTransferPostChainCommit;
    }>
  | Readonly<{
      status: "CONFIRMED_REFRESH_FAILED";
      commit: WalletTransferInvalidatedCommit;
      failure: unknown;
    }>;

export type WalletTransferPostChainInput = Readonly<{
  sourceAccountId: string;
  destinationAccountId: string;
  assetCode: string;
  submit: (signal?: AbortSignal) => Promise<WalletTransferReceipt>;
  confirm: (
    submitted: WalletTransferReceipt,
    signal?: AbortSignal,
  ) => Promise<WalletTransferReceipt>;
  refresh: Readonly<{
    accounts: (signal?: AbortSignal) => Promise<readonly WalletAccountRecord[]>;
    balance: (account: WalletAccountRecord, signal?: AbortSignal) => Promise<WalletBalanceRecord>;
    transactions: (
      account: WalletAccountRecord,
      signal?: AbortSignal,
    ) => Promise<WalletAccountTransactionHistoryState>;
  }>;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}>;

export class WalletTransferSubmissionError extends Error {
  constructor(cause: unknown) {
    super("Wallet transfer submission result is not confirmed", { cause });
    this.name = "WalletTransferSubmissionError";
  }
}

export class WalletTransferConfirmationError extends Error {
  constructor(cause: unknown) {
    super("Wallet transfer was not confirmed by persisted operation status", { cause });
    this.name = "WalletTransferConfirmationError";
  }
}

export class WalletTransferRefreshError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WalletTransferRefreshError";
  }
}

function balanceMatchesAccount(
  balance: WalletBalanceRecord,
  account: WalletAccountRecord,
): boolean {
  return (
    balance.accountId === account.id &&
    balance.assetCode === account.assetCode &&
    balance.status === account.status &&
    balance.currentBalance === account.currentBalance &&
    balance.postedBalance === account.postedBalance &&
    balance.pendingBalance === account.pendingBalance &&
    balance.availableBalance === account.availableBalance &&
    balance.updatedAt === account.updatedAt
  );
}

export function createWalletTransferInvalidatedCommit(
  receipt: WalletTransferReceipt,
): WalletTransferInvalidatedCommit {
  return Object.freeze({
    receipt,
    accounts: null,
    sourceAccount: null,
    destinationAccount: null,
    sourceBalance: null,
    destinationBalance: null,
    sourceTransactions: null,
    destinationTransactions: null,
  });
}

function operationEntries(
  history: WalletAccountTransactionHistoryState,
  operationId: string,
): readonly WalletAccountTransactionRecord[] {
  return history.items.filter(item => item.operationId === operationId);
}

function entryMatchesConfirmedTransfer(
  entry: WalletAccountTransactionRecord,
  receipt: WalletTransferReceipt,
  direction: "OUTGOING" | "INCOMING",
): boolean {
  return (
    entry.type === "TRANSFER" &&
    entry.status === "COMPLETED" &&
    entry.assetCode === receipt.assetCode &&
    entry.amount === receipt.amount &&
    entry.direction === direction &&
    entry.operationId === receipt.id &&
    Date.parse(entry.createdAt) >= Date.parse(receipt.createdAt)
  );
}

function historiesMatchConfirmedOperation(
  receipt: WalletTransferReceipt,
  source: WalletAccountRecord,
  destination: WalletAccountRecord,
  sourceHistory: WalletAccountTransactionHistoryState,
  destinationHistory: WalletAccountTransactionHistoryState,
): boolean {
  if (
    receipt.status !== "COMPLETED" ||
    receipt.completedAt === null ||
    sourceHistory.accountId !== source.id ||
    destinationHistory.accountId !== destination.id ||
    sourceHistory.accountId === destinationHistory.accountId ||
    sourceHistory.filterKey !== destinationHistory.filterKey
  ) return false;
  const sourceEntries = operationEntries(sourceHistory, receipt.id);
  const destinationEntries = operationEntries(destinationHistory, receipt.id);
  return (
    sourceEntries.length === 1 &&
    destinationEntries.length === 1 &&
    sourceEntries[0].id !== destinationEntries[0].id &&
    entryMatchesConfirmedTransfer(sourceEntries[0], receipt, "OUTGOING") &&
    entryMatchesConfirmedTransfer(destinationEntries[0], receipt, "INCOMING")
  );
}

async function readWalletTransferPostChainRefresh(
  input: WalletTransferPostChainInput,
  receipt: WalletTransferReceipt,
): Promise<WalletTransferPostChainCommit> {
  const accounts = await input.refresh.accounts(input.signal);
  if (!input.isCurrent()) throw new DOMException("Wallet transfer refresh cancelled", "AbortError");
  const source = accounts.find(account => account.id === input.sourceAccountId);
  const destination = accounts.find(account => account.id === input.destinationAccountId);
  if (
    !source ||
    !destination ||
    source.id === destination.id ||
    source.assetCode !== input.assetCode ||
    destination.assetCode !== input.assetCode
  ) throw new WalletTransferRefreshError("Wallet transfer accounts changed after confirmation");
  const [sourceBalance, destinationBalance, sourceTransactions, destinationTransactions] = await Promise.all([
    input.refresh.balance(source, input.signal),
    input.refresh.balance(destination, input.signal),
    input.refresh.transactions(source, input.signal),
    input.refresh.transactions(destination, input.signal),
  ]);
  if (!input.isCurrent()) throw new DOMException("Wallet transfer refresh cancelled", "AbortError");
  if (!balanceMatchesAccount(sourceBalance, source) || !balanceMatchesAccount(destinationBalance, destination))
    throw new WalletTransferRefreshError("Wallet transfer account and balance generations disagree");
  if (!historiesMatchConfirmedOperation(receipt, source, destination, sourceTransactions, destinationTransactions))
    throw new WalletTransferRefreshError("Wallet transfer debit and credit histories do not confirm one operation");
  return Object.freeze({
    receipt,
    accounts: Object.freeze([...accounts]),
    sourceAccount: source,
    destinationAccount: destination,
    sourceBalance,
    destinationBalance,
    sourceTransactions,
    destinationTransactions,
  });
}

/** Owns one POST, one persisted operation confirmation and one atomic resource generation. */
export async function runWalletTransferPostChain(
  input: WalletTransferPostChainInput,
): Promise<WalletTransferPostChainResult | null> {
  if (!input.isCurrent() || input.signal?.aborted) return null;
  let submitted: WalletTransferReceipt;
  try {
    submitted = await input.submit(input.signal);
  } catch (cause) {
    if (!input.isCurrent()) return null;
    throw new WalletTransferSubmissionError(cause);
  }
  if (!input.isCurrent()) return null;
  let confirmed: WalletTransferReceipt;
  try {
    confirmed = await input.confirm(submitted, input.signal);
  } catch (cause) {
    if (!input.isCurrent()) return null;
    throw new WalletTransferConfirmationError(cause);
  }
  if (!input.isCurrent()) return null;
  try {
    const commit = await readWalletTransferPostChainRefresh(input, confirmed);
    if (!input.isCurrent()) return null;
    return Object.freeze({ status: "COMPLETE", commit });
  } catch (failure) {
    if (!input.isCurrent()) return null;
    return Object.freeze({
      status: "CONFIRMED_REFRESH_FAILED",
      commit: createWalletTransferInvalidatedCommit(confirmed),
      failure,
    });
  }
}

export function walletTransferPostChainFailureIsAmbiguous(value: unknown): boolean {
  return value instanceof WalletTransferConfirmationError ||
    (value instanceof WalletTransferSubmissionError && walletTransferFailureIsAmbiguous(value.cause));
}

export function walletTransferPostChainFailureCause(value: unknown): unknown {
  return value instanceof WalletTransferSubmissionError || value instanceof WalletTransferConfirmationError
    ? value.cause ?? value
    : value;
}
