import type {
  WalletAccountRecord,
  WalletTransferReceipt,
} from "./walletData";

export const WALLET_TRANSFER_ACCOUNT_MAX_ITEMS = 100;
export const WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES = 65_536;
export const WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES = 16_384;
export const WALLET_TRANSFER_MAX_JSON_DEPTH = 128;
export const WALLET_TRANSFER_ACCOUNTS_PATH = "/v1/wallet/accounts";
export const WALLET_TRANSFER_PATH = "/v1/wallet/transfers";

export type WalletTransferEnvironment =
  | "LOCAL"
  | "SANDBOX"
  | "TEST"
  | "UAT"
  | "PRODUCTION";

export type WalletTransferSession = Readonly<{
  actorId: string;
  tenantId: string;
  customerId: string;
  environment: WalletTransferEnvironment;
  expiresAt?: string;
}>;

export type WalletTransferInput = Readonly<{
  sourceAccountId: string;
  destinationAccountId: string;
  assetCode: string;
  amount: string;
}>;

export type WalletTransferTransportRequest = Readonly<{
  path: string;
  method: "GET" | "POST";
  body?: WalletTransferInput;
  idempotencyKey?: string;
}>;

export type WalletTransferTransport = (
  request: WalletTransferTransportRequest,
) => Promise<string>;

export type WalletTransferRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  sourceAccountVersion: string;
  destinationAccountId: string;
  amount: string;
  idempotencyKey: string;
}>;

const accountFields = [
  "id",
  "accountCode",
  "name",
  "assetCode",
  "status",
  "currentBalance",
  "postedBalance",
  "pendingBalance",
  "availableBalance",
  "updatedAt",
] as const;

const receiptFields = [
  "id",
  "type",
  "status",
  "assetCode",
  "amount",
  "direction",
  "createdAt",
  "completedAt",
  "updatedAt",
] as const;

const inputFields = [
  "sourceAccountId",
  "destinationAccountId",
  "assetCode",
  "amount",
] as const;

function rejectDuplicateJsonObjectKeys(raw: string, name: string): void {
  let index = 0;
  const invalid = () => new Error(`Invalid ${name} JSON response`);
  const skipWhitespace = () => {
    while (
      index < raw.length &&
      (raw[index] === " " ||
        raw[index] === "\t" ||
        raw[index] === "\n" ||
        raw[index] === "\r")
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
    if (depth > WALLET_TRANSFER_MAX_JSON_DEPTH) throw invalid();
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
        if (keys.has(key)) throw new Error(`Duplicate ${name} JSON object key`);
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

function boundedRawJson(raw: unknown, maximumBytes: number, name: string): unknown {
  if (typeof raw !== "string") throw new Error(`Invalid ${name} raw response`);
  if (raw.length > maximumBytes || new TextEncoder().encode(raw).byteLength > maximumBytes)
    throw new Error(`${name} raw response exceeds the consumer limit`);
  rejectDuplicateJsonObjectKeys(raw, name);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid ${name} JSON response`);
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
  const expected = new Set<string>(fields);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !expected.has(key))
  )
    throw new Error(`Invalid ${name} fields`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      throw new Error(`Invalid ${name} field`);
  }
  return value as Record<T[number], unknown>;
}

function publicId(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error(`Invalid ${name}`);
  return value;
}

function publicText(value: unknown, name: string, maximum = 120): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    new TextEncoder().encode(value).byteLength > maximum
  )
    throw new Error(`Invalid ${name}`);
  return value;
}

function assetCode(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z0-9]{2,12}$/.test(value))
    throw new Error("Invalid transfer asset code");
  return value;
}

function rfc3339(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${name}`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
    value,
  );
  if (!match || Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${name}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1])
    throw new Error(`Invalid ${name}`);
  return value;
}

function decimalParts(value: unknown, name: string, positive = false): {
  canonical: string;
  scaled: bigint;
} {
  if (
    typeof value !== "string" ||
    value.length > 38 ||
    !/^-?(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value)
  )
    throw new Error(`Invalid ${name}`);
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, rawFraction = ""] = unsigned.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const canonicalUnsigned = fraction ? `${whole}.${fraction}` : whole;
  const canonical = negative && canonicalUnsigned !== "0" ? `-${canonicalUnsigned}` : canonicalUnsigned;
  const scaled =
    BigInt(`${whole}${rawFraction.padEnd(18, "0")}`) * (negative ? -1n : 1n);
  if (positive && scaled <= 0n) throw new Error(`Invalid ${name}`);
  return { canonical, scaled };
}

function accountVersion(account: WalletAccountRecord): string {
  return JSON.stringify([
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
  ]);
}

function parseAccount(value: unknown): WalletAccountRecord {
  const record = exactDataRecord(value, accountFields, "Wallet transfer account");
  const current = decimalParts(record.currentBalance, "current balance");
  const posted = decimalParts(record.postedBalance, "posted balance");
  const pending = decimalParts(record.pendingBalance, "pending balance");
  const available = decimalParts(record.availableBalance, "available balance");
  if (current.scaled !== posted.scaled + pending.scaled)
    throw new Error("Inconsistent Wallet transfer account balance");
  if (available.scaled < 0n || available.scaled !== posted.scaled)
    throw new Error("Inconsistent Wallet transfer available balance");
  if (!(["ACTIVE", "FROZEN", "CLOSED"] as unknown[]).includes(record.status))
    throw new Error("Invalid Wallet transfer account status");
  return {
    id: publicId(record.id, "Wallet transfer account id"),
    accountCode: publicText(record.accountCode, "Wallet transfer account code", 128),
    name: publicText(record.name, "Wallet transfer account name"),
    assetCode: assetCode(record.assetCode),
    status: record.status as WalletAccountRecord["status"],
    currentBalance: current.canonical,
    postedBalance: posted.canonical,
    pendingBalance: pending.canonical,
    availableBalance: available.canonical,
    updatedAt: rfc3339(record.updatedAt, "Wallet transfer account updatedAt"),
  };
}

export function parseWalletTransferAccountsRaw(raw: unknown): WalletAccountRecord[] {
  const value = boundedRawJson(
    raw,
    WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES,
    "Wallet transfer account",
  );
  if (!Array.isArray(value) || value.length > WALLET_TRANSFER_ACCOUNT_MAX_ITEMS)
    throw new Error("Invalid Wallet transfer account list");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index))
      throw new Error("Invalid sparse Wallet transfer account list");
  }
  const accounts = value.map(parseAccount);
  if (new Set(accounts.map(({ id }) => id)).size !== accounts.length)
    throw new Error("Duplicate Wallet transfer account id");
  return accounts;
}

export function normalizeWalletTransferInput(
  value: unknown,
  accounts: readonly WalletAccountRecord[],
): WalletTransferInput {
  const record = exactDataRecord(value, inputFields, "Wallet transfer input");
  const sourceId = publicId(record.sourceAccountId, "Wallet transfer source account id");
  const destinationId = publicId(
    record.destinationAccountId,
    "Wallet transfer destination account id",
  );
  if (sourceId === destinationId) throw new Error("Wallet transfer accounts must differ");
  const source = accounts.find(({ id }) => id === sourceId);
  const destination = accounts.find(({ id }) => id === destinationId);
  if (!source || !destination) throw new Error("Wallet transfer account is outside this session");
  if (source.status !== "ACTIVE" || destination.status !== "ACTIVE")
    throw new Error("Wallet transfer account is inactive");
  const selectedAsset = assetCode(record.assetCode);
  if (source.assetCode !== selectedAsset || destination.assetCode !== selectedAsset)
    throw new Error("Wallet transfer asset does not match both accounts");
  const amount = decimalParts(record.amount, "Wallet transfer amount", true);
  if (amount.scaled > decimalParts(source.availableBalance, "available balance").scaled)
    throw new Error("Wallet transfer amount exceeds available balance");
  return {
    sourceAccountId: sourceId,
    destinationAccountId: destinationId,
    assetCode: selectedAsset,
    amount: amount.canonical,
  };
}

export function validateWalletTransferIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new Error("Invalid Wallet transfer idempotency key");
  return value;
}

export function walletTransferFailureIsAmbiguous(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "status");
  if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "number")
    return false;
  return descriptor.value === 0 || descriptor.value === 408 ||
    (descriptor.value >= 500 && descriptor.value <= 599);
}

export function walletTransferSessionScope(
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
  const expiry = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return null;
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

function parseReceipt(
  value: unknown,
  expected: WalletTransferInput | WalletTransferReceipt,
): WalletTransferReceipt {
  const record = exactDataRecord(value, receiptFields, "Wallet transfer receipt");
  if (record.type !== "INTERNAL_TRANSFER") throw new Error("Invalid Wallet transfer type");
  if (
    !(["PROCESSING", "PENDING_SETTLEMENT", "COMPLETED", "FAILED"] as unknown[]).includes(
      record.status,
    )
  )
    throw new Error("Invalid Wallet transfer status");
  if (!(["OUTGOING", "BETWEEN_OWN_ACCOUNTS"] as unknown[]).includes(record.direction))
    throw new Error("Invalid Wallet transfer direction");
  const amount = decimalParts(record.amount, "Wallet transfer receipt amount", true);
  const completedAt =
    record.completedAt === null
      ? null
      : rfc3339(record.completedAt, "Wallet transfer completedAt");
  const receipt: WalletTransferReceipt = {
    id: publicId(record.id, "Wallet transfer operation id"),
    type: "INTERNAL_TRANSFER",
    status: record.status as WalletTransferReceipt["status"],
    assetCode: assetCode(record.assetCode),
    amount: amount.canonical,
    direction: record.direction as WalletTransferReceipt["direction"],
    createdAt: rfc3339(record.createdAt, "Wallet transfer createdAt"),
    completedAt,
    updatedAt: rfc3339(record.updatedAt, "Wallet transfer updatedAt"),
  };
  const createdAtEpoch = Date.parse(receipt.createdAt);
  const updatedAtEpoch = Date.parse(receipt.updatedAt);
  const completedAtEpoch = receipt.completedAt === null ? null : Date.parse(receipt.completedAt);
  if (
    updatedAtEpoch < createdAtEpoch ||
    (completedAtEpoch !== null &&
      (completedAtEpoch < createdAtEpoch || completedAtEpoch > updatedAtEpoch))
  )
    throw new Error("Invalid Wallet transfer receipt time order");
  if (
    receipt.assetCode !== expected.assetCode ||
    receipt.amount !== decimalParts(expected.amount, "expected transfer amount", true).canonical
  )
    throw new Error("Wallet transfer receipt does not match the request");
  if ("id" in expected) {
    if (
      receipt.id !== expected.id ||
      receipt.type !== expected.type ||
      receipt.direction !== expected.direction ||
      receipt.createdAt !== expected.createdAt
    )
      throw new Error("Wallet transfer status changed immutable fields");
    const rank: Record<WalletTransferReceipt["status"], number> = {
      PROCESSING: 0,
      PENDING_SETTLEMENT: 1,
      COMPLETED: 2,
      FAILED: 2,
    };
    if (
      rank[receipt.status] < rank[expected.status] ||
      ((expected.status === "COMPLETED" || expected.status === "FAILED") &&
        receipt.status !== expected.status) ||
      Date.parse(receipt.updatedAt) < Date.parse(expected.updatedAt)
    )
      throw new Error("Wallet transfer status moved backwards");
  }
  if (
    (receipt.status === "COMPLETED" || receipt.status === "FAILED") !==
    (receipt.completedAt !== null)
  )
    throw new Error("Invalid Wallet transfer completion time");
  return receipt;
}

export function parseWalletTransferReceiptRaw(
  raw: unknown,
  expected: WalletTransferInput | WalletTransferReceipt,
): WalletTransferReceipt {
  return parseReceipt(
    boundedRawJson(raw, WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES, "Wallet transfer receipt"),
    expected,
  );
}

function requireScope(
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  now: number,
): string {
  const scope = walletTransferSessionScope(session, runtimeEnvironment, now);
  if (!scope) throw new Error("Wallet transfer is unavailable for this session");
  return scope;
}

export async function readWalletTransferAccounts(
  transport: WalletTransferTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  now = Date.now(),
): Promise<WalletAccountRecord[]> {
  requireScope(session, runtimeEnvironment, now);
  return parseWalletTransferAccountsRaw(
    await transport({ path: WALLET_TRANSFER_ACCOUNTS_PATH, method: "GET" }),
  );
}

export async function submitWalletTransfer(
  transport: WalletTransferTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  accounts: readonly WalletAccountRecord[],
  input: unknown,
  idempotencyKey: unknown,
  now = Date.now(),
): Promise<WalletTransferReceipt> {
  requireScope(session, runtimeEnvironment, now);
  const normalized = normalizeWalletTransferInput(input, accounts);
  const key = validateWalletTransferIdempotencyKey(idempotencyKey);
  const raw = await transport({
    path: WALLET_TRANSFER_PATH,
    method: "POST",
    body: normalized,
    idempotencyKey: key,
  });
  return parseWalletTransferReceiptRaw(raw, normalized);
}

export async function readWalletTransferStatus(
  transport: WalletTransferTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  previous: WalletTransferReceipt,
  now = Date.now(),
): Promise<WalletTransferReceipt> {
  requireScope(session, runtimeEnvironment, now);
  const operationId = publicId(previous.id, "Wallet transfer operation id");
  const raw = await transport({
    path: `/v1/wallet/operations/${encodeURIComponent(operationId)}`,
    method: "GET",
  });
  return parseWalletTransferReceiptRaw(raw, previous);
}

export function createWalletTransferRequestIdentity(
  requestId: number,
  scopeKey: string,
  source: WalletAccountRecord,
  input: WalletTransferInput,
  idempotencyKey: string,
): WalletTransferRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new Error("Invalid Wallet transfer request generation");
  return {
    requestId,
    scopeKey,
    sourceAccountVersion: accountVersion(source),
    destinationAccountId: input.destinationAccountId,
    amount: input.amount,
    idempotencyKey: validateWalletTransferIdempotencyKey(idempotencyKey),
  };
}

export function walletTransferRequestIsCurrent(
  request: WalletTransferRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  accounts: readonly WalletAccountRecord[],
  selectedAccount: WalletAccountRecord | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    selectedAccount !== null &&
    accountVersion(selectedAccount) === request.sourceAccountVersion &&
    accounts.some(
      (account) =>
        account.id === request.destinationAccountId &&
        account.assetCode === selectedAccount.assetCode &&
        account.status === "ACTIVE",
    )
  );
}

export function walletTransferRetryKey(
  retry: WalletTransferRequestIdentity | null,
  scopeKey: string,
  accounts: readonly WalletAccountRecord[],
  selectedAccount: WalletAccountRecord,
  input: WalletTransferInput,
): string | null {
  if (
    !retry ||
    retry.destinationAccountId !== input.destinationAccountId ||
    retry.amount !== input.amount ||
    !walletTransferRequestIsCurrent(
      retry,
      retry.requestId,
      scopeKey,
      accounts,
      selectedAccount,
    )
  ) return null;
  return retry.idempotencyKey;
}

export type WalletTransferSubmitGate = { activeRequestId: number | null };

export function beginWalletTransferSubmit(
  gate: WalletTransferSubmitGate,
  nextRequestId: number,
): boolean {
  if (gate.activeRequestId !== null) return false;
  gate.activeRequestId = nextRequestId;
  return true;
}

export function settleWalletTransferSubmit(
  gate: WalletTransferSubmitGate,
  requestId: number,
): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}
