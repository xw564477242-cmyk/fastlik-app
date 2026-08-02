import type { WalletAccountRecord } from "./walletData";
import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const WALLET_BALANCE_SUMMARY_PATH = "/v1/wallet/balances";
export const WALLET_BALANCE_SUMMARY_MAX_ITEMS = 50;
export const WALLET_BALANCE_SUMMARY_MAX_JSON_BYTES = 32_768;
export const WALLET_BALANCE_SUMMARY_MAX_JSON_DEPTH = 16;

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

export type WalletBalanceSummaryTransportRequest = Readonly<{
  path: typeof WALLET_BALANCE_SUMMARY_PATH;
  method: "GET";
  signal?: AbortSignal;
}>;

export type WalletBalanceSummaryTransport = (
  request: WalletBalanceSummaryTransportRequest,
) => Promise<string>;

const responseFields = new Set(["items"]);
const itemFields = new Set(["assetCode", "availableBalance", "ledgerBalance", "pendingBalance", "updatedAt"]);
type OwnData = Readonly<Record<string, PropertyDescriptor>>;

function invalid(label: string): never {
  throw new Error(`Invalid Wallet balance summary ${label}`);
}

function rejectDuplicateJsonObjectKeys(raw: string): void {
  let index = 0;
  const malformed = () => new Error("Invalid Wallet balance summary raw JSON");
  const skipWhitespace = () => {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1;
  };
  const readString = (): string => {
    const start = index;
    if (raw[index] !== '"') throw malformed();
    index += 1;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        try {
          const decoded = JSON.parse(raw.slice(start, index)) as unknown;
          if (typeof decoded !== "string") throw malformed();
          return decoded;
        } catch {
          throw malformed();
        }
      }
      if (code <= 0x1f) throw malformed();
      if (code === 0x5c) {
        index += 1;
        if (index >= raw.length) throw malformed();
        if (raw[index] === "u") {
          if (!/^[0-9A-Fa-f]{4}$/.test(raw.slice(index + 1, index + 5))) throw malformed();
          index += 5;
        } else index += 1;
      } else index += 1;
    }
    throw malformed();
  };
  const parseValue = (depth: number): void => {
    if (depth > WALLET_BALANCE_SUMMARY_MAX_JSON_DEPTH) throw malformed();
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
        if (keys.has(key)) throw new Error("Duplicate Wallet balance summary JSON object key");
        keys.add(key);
        skipWhitespace();
        if (raw[index] !== ":") throw malformed();
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") throw malformed();
        index += 1;
        skipWhitespace();
      }
      throw malformed();
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
        if (raw[index] !== ",") throw malformed();
        index += 1;
        skipWhitespace();
      }
      throw malformed();
    }
    if (raw[index] === '"') {
      readString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index));
    if (!number) throw malformed();
    index += number[0].length;
  };
  skipWhitespace();
  parseValue(0);
  skipWhitespace();
  if (index !== raw.length) throw malformed();
}

function ordinaryOwnData(value: unknown, allowed: ReadonlySet<string>, label: string): OwnData {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label);
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid(label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key))) {
    invalid(`${label} fields`);
  }
  return descriptors;
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

function parseWalletBalanceSummaryItem(value: unknown): WalletBalanceSummaryItem {
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

export function parseWalletBalanceSummary(rawJson: string): WalletBalanceSummary {
  if (typeof rawJson !== "string" || rawJson.length > WALLET_BALANCE_SUMMARY_MAX_JSON_BYTES) {
    invalid("raw JSON");
  }
  if (new TextEncoder().encode(rawJson).byteLength > WALLET_BALANCE_SUMMARY_MAX_JSON_BYTES) {
    invalid("raw JSON size");
  }
  rejectDuplicateJsonObjectKeys(rawJson);
  let value: unknown;
  try {
    value = JSON.parse(rawJson) as unknown;
  } catch {
    invalid("raw JSON");
  }
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

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Wallet balance summary request cancelled", "AbortError");
  }
}

export function walletBalanceSummaryRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export function walletBalanceSummaryRetainsSnapshotOnFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "status");
  if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number") return false;
  const status = descriptor.value;
  if (!Number.isInteger(status) || status < 0 || status > 599) return false;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export async function readWalletBalanceSummary(
  transport: WalletBalanceSummaryTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<WalletBalanceSummary> {
  const scopeKey = walletTransferSessionScope(session, runtimeEnvironment, now());
  if (!scopeKey || scopeKey !== expectedScopeKey) {
    throw new Error("Wallet balance summary is unavailable for this session");
  }
  throwIfAborted(signal);
  const raw = await transport({ path: WALLET_BALANCE_SUMMARY_PATH, method: "GET", signal });
  throwIfAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== scopeKey) {
    throw new Error("Wallet balance summary session expired during the request");
  }
  return parseWalletBalanceSummary(raw);
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
