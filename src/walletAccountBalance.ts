import type { WalletAccountRecord, WalletBalanceRecord } from "./walletData";
import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const WALLET_ACCOUNT_BALANCE_MAX_JSON_BYTES = 16_384;
export const WALLET_ACCOUNT_BALANCE_MAX_JSON_DEPTH = 16;

export type WalletAccountBalanceTransportRequest = Readonly<{
  path: string;
  method: "GET";
  signal?: AbortSignal;
}>;

export type WalletAccountBalanceTransport = (
  request: WalletAccountBalanceTransportRequest,
) => Promise<string>;

const publicFields = [
  "accountId",
  "assetCode",
  "status",
  "currentBalance",
  "postedBalance",
  "pendingBalance",
  "holdBalance",
  "availableBalance",
  "updatedAt",
] as const;

function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value)) {
    throw new Error("Invalid Wallet balance account id");
  }
  return value;
}

export function walletAccountBalancePath(accountId: unknown): string {
  return `/v1/wallet/accounts/${encodeURIComponent(identifier(accountId))}/balance`;
}

function rejectDuplicateJsonKeys(raw: string): void {
  let index = 0;
  const malformed = () => new Error("Invalid Wallet account balance JSON response");
  const whitespace = () => {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1;
  };
  const string = (): string => {
    const start = index;
    if (raw[index] !== '"') throw malformed();
    index += 1;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        try {
          const value = JSON.parse(raw.slice(start, index)) as unknown;
          if (typeof value !== "string") throw malformed();
          return value;
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
  const value = (depth: number): void => {
    if (depth > WALLET_ACCOUNT_BALANCE_MAX_JSON_DEPTH) throw malformed();
    whitespace();
    if (raw[index] === "{") {
      index += 1;
      whitespace();
      const keys = new Set<string>();
      if (raw[index] === "}") { index += 1; return; }
      while (index < raw.length) {
        const key = string();
        if (keys.has(key)) throw new Error("Duplicate Wallet account balance JSON object key");
        keys.add(key);
        whitespace();
        if (raw[index] !== ":") throw malformed();
        index += 1;
        value(depth + 1);
        whitespace();
        if (raw[index] === "}") { index += 1; return; }
        if (raw[index] !== ",") throw malformed();
        index += 1;
        whitespace();
      }
      throw malformed();
    }
    if (raw[index] === "[") {
      index += 1;
      whitespace();
      if (raw[index] === "]") { index += 1; return; }
      while (index < raw.length) {
        value(depth + 1);
        whitespace();
        if (raw[index] === "]") { index += 1; return; }
        if (raw[index] !== ",") throw malformed();
        index += 1;
        whitespace();
      }
      throw malformed();
    }
    if (raw[index] === '"') { string(); return; }
    for (const literal of ["true", "false", "null"]) {
      if (raw.startsWith(literal, index)) { index += literal.length; return; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index));
    if (!number) throw malformed();
    index += number[0].length;
  };
  whitespace();
  value(0);
  whitespace();
  if (index !== raw.length) throw malformed();
}

function publicRecord(raw: string): Record<(typeof publicFields)[number], unknown> {
  if (
    typeof raw !== "string" ||
    raw.length > WALLET_ACCOUNT_BALANCE_MAX_JSON_BYTES ||
    new TextEncoder().encode(raw).byteLength > WALLET_ACCOUNT_BALANCE_MAX_JSON_BYTES
  ) throw new Error("Wallet account balance response exceeds the consumer limit");
  rejectDuplicateJsonKeys(raw);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { throw new Error("Invalid Wallet account balance JSON response"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("Invalid Wallet account balance response");
  }
  const selected: Record<string, unknown> = {};
  for (const field of publicFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error("Invalid Wallet account balance public fields");
    }
    selected[field] = descriptor.value;
  }
  return selected as Record<(typeof publicFields)[number], unknown>;
}

function amount(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 38 ||
    !/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value) ||
    value === "-0" ||
    (value.includes(".") && value.endsWith("0"))
  ) throw new Error(`Invalid Wallet account balance ${label}`);
  return value;
}

function mantissa(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [integer, fraction = ""] = unsigned.split(".");
  const result = BigInt(`${integer}${fraction.padEnd(18, "0")}`);
  return negative ? -result : result;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error("Invalid Wallet account balance updatedAt");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error("Invalid Wallet account balance updatedAt");
  }
  return value;
}

export function parseWalletAccountBalance(raw: string): WalletBalanceRecord {
  const value = publicRecord(raw);
  const currentBalance = amount(value.currentBalance, "currentBalance");
  const postedBalance = amount(value.postedBalance, "postedBalance");
  const pendingBalance = amount(value.pendingBalance, "pendingBalance");
  const holdBalance = amount(value.holdBalance, "holdBalance");
  const availableBalance = amount(value.availableBalance, "availableBalance");
  if (
    mantissa(postedBalance) + mantissa(pendingBalance) !== mantissa(currentBalance) ||
    mantissa(holdBalance) !== mantissa(pendingBalance) ||
    mantissa(availableBalance) !== mantissa(postedBalance)
  ) throw new Error("Invalid Wallet account balance ledger equation");
  if (typeof value.assetCode !== "string" || !/^[A-Z0-9]{2,12}$/.test(value.assetCode)) {
    throw new Error("Invalid Wallet account balance assetCode");
  }
  if (value.status !== "ACTIVE" && value.status !== "FROZEN" && value.status !== "CLOSED") {
    throw new Error("Invalid Wallet account balance status");
  }
  return Object.freeze({
    accountId: identifier(value.accountId),
    assetCode: value.assetCode,
    status: value.status,
    currentBalance,
    postedBalance,
    pendingBalance,
    holdBalance,
    availableBalance,
    updatedAt: timestamp(value.updatedAt),
  });
}

function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Wallet account balance request cancelled", "AbortError");
}

export function walletAccountBalanceRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export function walletAccountBalanceRetainsSnapshotOnFailure(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "status");
  if (!descriptor || !("value" in descriptor) || !Number.isInteger(descriptor.value)) return false;
  const status = descriptor.value as number;
  return status >= 0 && status <= 599 && (status === 0 || status === 408 || status === 429 || status >= 500);
}

export async function readWalletAccountBalance(
  transport: WalletAccountBalanceTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  account: WalletAccountRecord,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<WalletBalanceRecord> {
  const scopeKey = walletTransferSessionScope(session, runtimeEnvironment, now());
  if (!scopeKey || scopeKey !== expectedScopeKey) throw new Error("Wallet account balance is unavailable for this session");
  const path = walletAccountBalancePath(account.id);
  aborted(signal);
  const raw = await transport({ path, method: "GET", signal });
  aborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== scopeKey) {
    throw new Error("Wallet account balance session expired during the request");
  }
  const balance = parseWalletAccountBalance(raw);
  if (balance.accountId !== account.id || balance.assetCode !== account.assetCode) {
    throw new Error("Wallet account balance does not match the selected account");
  }
  return balance;
}
