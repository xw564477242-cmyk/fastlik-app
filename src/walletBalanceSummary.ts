import type { WalletAccountRecord } from "./walletData";

export const WALLET_BALANCE_SUMMARY_PATH = "/v1/wallet/balances";
export const WALLET_BALANCE_SUMMARY_MAX_ITEMS = 50;

export type WalletBalanceSummaryItem = Readonly<{
  assetCode: string;
  availableBalance: string;
  ledgerBalance: string;
  pendingBalance: string;
  updatedAt: string;
}>;

export type WalletBalanceSummary = Readonly<{
  items: readonly WalletBalanceSummaryItem[];
}>;

export type WalletBalanceSummaryRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string | null;
  accountId: string | null;
  accountsVersion: string;
}>;

const responseFields = new Set(["items"]);
const itemFields = new Set(["assetCode", "availableBalance", "ledgerBalance", "pendingBalance", "updatedAt"]);
type OwnData = Readonly<Record<string, PropertyDescriptor>>;

function invalid(label: string): never {
  throw new Error(`Invalid Wallet balance summary ${label}`);
}

function assertOrdinaryDataGraph(value: unknown, label: string, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) invalid(label);
  seen.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) invalid(label);
    } else if (prototype !== Object.prototype) {
      invalid(label);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") invalid(label);
      const descriptor = descriptors[key];
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) invalid(label);
      if (key !== "length") assertOrdinaryDataGraph(descriptor.value, label, seen);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid Wallet balance summary ")) throw error;
    invalid(label);
  }
}

function ordinaryOwnData(value: unknown, allowed: ReadonlySet<string>, label: string): OwnData {
  assertOrdinaryDataGraph(value, label);
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label);
  try {
    if (typeof structuredClone !== "function") invalid(label);
    structuredClone(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key))) {
      invalid(`${label} fields`);
    }
    return descriptors;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid Wallet balance summary ")) throw error;
    invalid(label);
  }
}

const valueOf = (source: OwnData, key: string): unknown => source[key]?.value;

function assetCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z0-9]{2,12}$/.test(value)) invalid("assetCode");
  return value;
}

function amount(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 56 ||
    !/^-?(?:0|[1-9][0-9]{0,35})(?:\.[0-9]{1,18})?$/.test(value) ||
    value === "-0" ||
    (value.endsWith("0") && value.includes("."))
  ) invalid(label);
  return value;
}

function amountMantissa(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");
  const mantissa = BigInt(`${integer}${fraction.padEnd(18, "0")}`);
  return negative ? -mantissa : mantissa;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string") invalid("updatedAt");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/.exec(value);
  if (!match) invalid("updatedAt");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number.isNaN(Date.parse(value))) {
    invalid("updatedAt");
  }
  return value;
}

export function parseWalletBalanceSummaryItem(value: unknown): WalletBalanceSummaryItem {
  const source = ordinaryOwnData(value, itemFields, "item");
  const availableBalance = amount(valueOf(source, "availableBalance"), "availableBalance");
  const ledgerBalance = amount(valueOf(source, "ledgerBalance"), "ledgerBalance");
  const pendingBalance = amount(valueOf(source, "pendingBalance"), "pendingBalance");
  if (amountMantissa(availableBalance) + amountMantissa(pendingBalance) !== amountMantissa(ledgerBalance)) {
    invalid("ledger equation");
  }
  return Object.freeze({
    assetCode: assetCode(valueOf(source, "assetCode")),
    availableBalance,
    ledgerBalance,
    pendingBalance,
    updatedAt: timestamp(valueOf(source, "updatedAt")),
  });
}

export function parseWalletBalanceSummary(value: unknown): WalletBalanceSummary {
  const source = ordinaryOwnData(value, responseFields, "response");
  const rawItems = valueOf(source, "items");
  if (!Array.isArray(rawItems)) invalid("items");
  if (rawItems.length > WALLET_BALANCE_SUMMARY_MAX_ITEMS) invalid("item limit");
  const itemDescriptors = Object.getOwnPropertyDescriptors(rawItems);
  if (Reflect.ownKeys(itemDescriptors).length !== rawItems.length + 1) invalid("items fields");
  for (let index = 0; index < rawItems.length; index += 1) {
    const descriptor = itemDescriptors[String(index)];
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) invalid("items fields");
  }
  const items = rawItems.map(parseWalletBalanceSummaryItem);
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1].assetCode >= items[index].assetCode) invalid("asset order");
  }
  return Object.freeze({ items: Object.freeze(items) });
}

export function walletBalanceSummaryReadAllowed(sessionEnvironment: string, runtimeEnvironment: string): boolean {
  return sessionEnvironment === runtimeEnvironment && (runtimeEnvironment === "SANDBOX" || runtimeEnvironment === "TEST");
}

export function captureWalletAccountsVersion(accounts: readonly WalletAccountRecord[]): string {
  return JSON.stringify(accounts.map((account) => [
    account.id,
    account.accountCode,
    account.name,
    account.assetCode,
    account.status,
    account.currentBalance,
    account.postedBalance,
    account.pendingBalance,
    account.availableBalance,
    account.updatedAt,
  ]));
}

export function walletBalanceSummaryRequestIsCurrent(
  request: WalletBalanceSummaryRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentAccounts: readonly WalletAccountRecord[],
  currentAccount: WalletAccountRecord | null,
): boolean {
  return request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.accountId === (currentAccount?.id ?? null) &&
    request.accountsVersion === captureWalletAccountsVersion(currentAccounts);
}
