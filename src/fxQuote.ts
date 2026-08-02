export const FX_QUOTE_PATH = "/v1/wallet/fx/quotes";
export const FX_QUOTE_RESPONSE_MAX_JSON_BYTES = 4_096;
export const FX_QUOTE_MAX_JSON_DEPTH = 32;
export const FX_QUOTE_MAX_VALIDITY_MS = 15 * 60 * 1_000;

export type FxQuoteEnvironment =
  | "LOCAL"
  | "SANDBOX"
  | "TEST"
  | "UAT"
  | "PRODUCTION";

export type FxQuoteSession = Readonly<{
  actorId: string;
  tenantId: string;
  customerId: string;
  environment: FxQuoteEnvironment;
  expiresAt?: string;
}>;

export type FxQuoteInput = Readonly<{
  sourceAssetCode: string;
  targetAssetCode: string;
  sourceAmount: string;
}>;

export type FxQuote = Readonly<{
  quoteId: string;
  environment: "SANDBOX" | "TEST";
  sourceAssetCode: string;
  targetAssetCode: string;
  sourceAmount: string;
  targetAmount: string;
  rate: string;
  expiresAt: string;
}>;

export type FxQuoteTransportRequest = Readonly<{
  path: typeof FX_QUOTE_PATH;
  method: "POST";
  body: FxQuoteInput;
  signal: AbortSignal;
}>;

export type FxQuoteTransport = (
  request: FxQuoteTransportRequest,
) => Promise<string>;

export type FxQuoteRequestIdentity = Readonly<{
  requestId: number;
  requestGeneration: number;
  inputGeneration: number;
  scopeKey: string;
  inputKey: string;
}>;

export type FxQuoteSubmitGate = { activeRequestId: number | null };

const throwIfFxQuoteRequestAborted = (signal: AbortSignal): void => {
  if (signal.aborted)
    throw new DOMException("FX quote request cancelled", "AbortError");
};

export function fxQuoteRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export function fxQuoteFailureCanInvalidateSession(
  value: unknown,
  isCurrent: boolean,
  signal: AbortSignal,
): boolean {
  if (!isCurrent || signal.aborted || !value || typeof value !== "object")
    return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "status");
  return Boolean(descriptor && "value" in descriptor && descriptor.value === 401);
}

const inputFields = [
  "sourceAssetCode",
  "targetAssetCode",
  "sourceAmount",
] as const;

const quoteFields = [
  "quoteId",
  "environment",
  "sourceAssetCode",
  "targetAssetCode",
  "sourceAmount",
  "targetAmount",
  "rate",
  "expiresAt",
] as const;

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

function assetCode(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[A-Z0-9]{2,12}$/.test(value))
    throw new Error(`Invalid ${name}`);
  return value;
}

function positiveDecimalParts(value: unknown, name: string): {
  canonical: string;
  scaled: bigint;
} {
  if (
    typeof value !== "string" ||
    value.length > 37 ||
    !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value)
  )
    throw new Error(`Invalid ${name}`);
  const [whole, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  const canonical = fraction ? `${whole}.${fraction}` : whole;
  const scaled = BigInt(`${whole}${rawFraction.padEnd(18, "0")}`);
  if (scaled <= 0n) throw new Error(`Invalid ${name}`);
  return { canonical, scaled };
}

function positiveDecimal(value: unknown, name: string): string {
  return positiveDecimalParts(value, name).canonical;
}

function strictRfc3339(value: unknown, name: string): string {
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

function rejectDuplicateJsonObjectKeys(raw: string): void {
  let index = 0;
  const invalid = () => new Error("Invalid FX quote JSON response");
  const skipWhitespace = () => {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1;
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
    if (depth > FX_QUOTE_MAX_JSON_DEPTH) throw invalid();
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
        if (keys.has(key)) throw new Error("Duplicate FX quote JSON object key");
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
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      raw.slice(index),
    );
    if (!number) throw invalid();
    index += number[0].length;
  };
  parseValue(0);
  skipWhitespace();
  if (index !== raw.length) throw invalid();
}

function parseBoundedRawJson(raw: unknown): unknown {
  if (typeof raw !== "string") throw new Error("Invalid FX quote raw response");
  if (
    raw.length > FX_QUOTE_RESPONSE_MAX_JSON_BYTES ||
    new TextEncoder().encode(raw).byteLength > FX_QUOTE_RESPONSE_MAX_JSON_BYTES
  )
    throw new Error("FX quote raw response exceeds the consumer limit");
  rejectDuplicateJsonObjectKeys(raw);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Invalid FX quote JSON response");
  }
}

export function normalizeFxQuoteInput(value: unknown): FxQuoteInput {
  const record = exactDataRecord(value, inputFields, "FX quote input");
  const sourceAssetCode = assetCode(record.sourceAssetCode, "FX quote source asset");
  const targetAssetCode = assetCode(record.targetAssetCode, "FX quote target asset");
  if (sourceAssetCode === targetAssetCode)
    throw new Error("FX quote assets must differ");
  return Object.freeze({
    sourceAssetCode,
    targetAssetCode,
    sourceAmount: positiveDecimal(record.sourceAmount, "FX quote source amount"),
  });
}

export function fxQuoteInputKey(input: FxQuoteInput): string {
  const normalized = normalizeFxQuoteInput(input);
  return JSON.stringify([
    normalized.sourceAssetCode,
    normalized.targetAssetCode,
    normalized.sourceAmount,
  ]);
}

export function fxQuoteSessionScope(
  session: FxQuoteSession | null,
  runtimeEnvironment: FxQuoteEnvironment | undefined,
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
      (value) =>
        typeof value === "string" &&
        value.length > 0 &&
        value.length <= 128 &&
        value === value.trim() &&
        !/[\u0000-\u001f\u007f]/.test(value),
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

export function parseFxQuoteRaw(
  raw: unknown,
  expected: FxQuoteInput,
  expectedEnvironment: "SANDBOX" | "TEST",
  now = Date.now(),
): FxQuote {
  const input = normalizeFxQuoteInput(expected);
  const record = exactDataRecord(parseBoundedRawJson(raw), quoteFields, "FX quote response");
  if (record.environment !== expectedEnvironment)
    throw new Error("FX quote environment does not match the session");
  const sourceAssetCode = assetCode(record.sourceAssetCode, "FX quote source asset");
  const targetAssetCode = assetCode(record.targetAssetCode, "FX quote target asset");
  const sourceAmountParts = positiveDecimalParts(
    record.sourceAmount,
    "FX quote source amount",
  );
  const sourceAmount = sourceAmountParts.canonical;
  if (
    sourceAssetCode !== input.sourceAssetCode ||
    targetAssetCode !== input.targetAssetCode ||
    sourceAmount !== input.sourceAmount
  )
    throw new Error("FX quote response does not match the request");
  const expiresAt = strictRfc3339(record.expiresAt, "FX quote expiresAt");
  const expiry = Date.parse(expiresAt);
  if (expiry <= now) throw new Error("FX quote is already expired");
  if (expiry - now > FX_QUOTE_MAX_VALIDITY_MS)
    throw new Error("FX quote validity exceeds the consumer limit");
  const targetAmount = positiveDecimalParts(record.targetAmount, "FX quote target amount");
  const rate = positiveDecimalParts(record.rate, "FX quote rate");
  const decimalScale = 10n ** 18n;
  if (targetAmount.scaled !== (sourceAmountParts.scaled * rate.scaled) / decimalScale)
    throw new Error("FX quote target amount does not match source amount and rate");
  return Object.freeze({
    quoteId: publicId(record.quoteId, "FX quote id"),
    environment: expectedEnvironment,
    sourceAssetCode,
    targetAssetCode,
    sourceAmount,
    targetAmount: targetAmount.canonical,
    rate: rate.canonical,
    expiresAt,
  });
}

export async function readFxQuote(
  transport: FxQuoteTransport,
  session: FxQuoteSession,
  runtimeEnvironment: FxQuoteEnvironment,
  input: unknown,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<FxQuote> {
  const scope = fxQuoteSessionScope(session, runtimeEnvironment, now());
  if (!scope) throw new Error("FX quote is unavailable for this session");
  throwIfFxQuoteRequestAborted(signal);
  const normalized = normalizeFxQuoteInput(input);
  const raw = await transport({
    path: FX_QUOTE_PATH,
    method: "POST",
    body: normalized,
    signal,
  });
  throwIfFxQuoteRequestAborted(signal);
  if (fxQuoteSessionScope(session, runtimeEnvironment, now()) !== scope)
    throw new Error("FX quote session expired before completion");
  return parseFxQuoteRaw(raw, normalized, runtimeEnvironment as "SANDBOX" | "TEST", now());
}

export function createFxQuoteRequestIdentity(
  requestId: number,
  requestGeneration: number,
  inputGeneration: number,
  scopeKey: string,
  input: FxQuoteInput,
): FxQuoteRequestIdentity {
  if (
    !Number.isSafeInteger(requestId) ||
    requestId < 1 ||
    !Number.isSafeInteger(requestGeneration) ||
    requestGeneration < 1 ||
    !Number.isSafeInteger(inputGeneration) ||
    inputGeneration < 0 ||
    typeof scopeKey !== "string" ||
    scopeKey.length < 1
  )
    throw new Error("Invalid FX quote request identity");
  return Object.freeze({
    requestId,
    requestGeneration,
    inputGeneration,
    scopeKey,
    inputKey: fxQuoteInputKey(input),
  });
}

export function fxQuoteRequestIsCurrent(
  request: FxQuoteRequestIdentity,
  currentRequestGeneration: number,
  currentInputGeneration: number,
  currentScopeKey: string | null,
  currentInput: FxQuoteInput | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestGeneration === currentRequestGeneration &&
      request.inputGeneration === currentInputGeneration &&
      request.scopeKey === currentScopeKey &&
      currentInput &&
      request.inputKey === fxQuoteInputKey(currentInput),
  );
}

export function beginFxQuoteSubmit(
  gate: FxQuoteSubmitGate,
  requestId: number,
): boolean {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || gate.activeRequestId !== null)
    return false;
  gate.activeRequestId = requestId;
  return true;
}

export function settleFxQuoteSubmit(
  gate: FxQuoteSubmitGate,
  requestId: number,
): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}

export function fxQuoteFailureRetainsVerifiedQuote(status: unknown): boolean {
  return (
    typeof status === "number" &&
    Number.isInteger(status) &&
    (status === 0 || status === 408 || status === 429 || status >= 500)
  );
}
