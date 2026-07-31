export type VirtualCardCreateEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";

export type VirtualCardCreateInput = {
  currency: string;
  alias?: string;
};

export type VirtualCardCreateRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
};

export type VirtualCardCreatedRecord = {
  id: string;
  type: "VIRTUAL";
  status: "PENDING" | "ACTIVE" | "FROZEN" | "CLOSED" | "FAILED";
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  currency: string;
  alias: string | null;
  availableBalanceMinor?: string;
  createdAt: string;
  capabilities: {
    freeze: boolean;
    unfreeze: boolean;
    replace: boolean;
    renew: boolean;
    updateLimits: boolean;
  };
};

export type VirtualCardCreateDecision = {
  allowed: boolean;
  reason: string | null;
};

const supportedValuesOf = (Intl as typeof Intl & {
  supportedValuesOf?: (key: "currency") => string[];
}).supportedValuesOf;
const iso4217Currencies = new Set(supportedValuesOf ? supportedValuesOf("currency") : ["USD"]);
const rfc3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const currency = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value) || !iso4217Currencies.has(value))
    throw new Error("Invalid virtual card currency");
  return value;
};

const alias = (value: unknown): string | undefined => {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length > 30 ||
    /[\u0000-\u001F\u007F]/.test(value)
  )
    throw new Error("Invalid virtual card alias");
  return value;
};

const idempotencyKey = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(value))
    throw new Error("Invalid virtual card idempotency key");
  return value;
};

const strictRfc3339 = (value: string): string => {
  const match = rfc3339.exec(value);
  if (!match) throw new Error("Invalid virtual card createdAt");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error("Invalid virtual card createdAt");
  return value;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nullableInteger = (value: unknown, name: string, minimum: number, maximum: number): number | null => {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid virtual card ${name}`);
  return value as number;
};

export function virtualCardCreateDecision(
  sessionEnvironment: VirtualCardCreateEnvironment | null,
  runtimeEnvironment: VirtualCardCreateEnvironment,
): VirtualCardCreateDecision {
  if (sessionEnvironment === null || sessionEnvironment !== runtimeEnvironment)
    return { allowed: false, reason: "Virtual card creation requires a matching session and runtime environment." };
  if (sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST")
    return { allowed: false, reason: "Virtual card creation is available only in SANDBOX or TEST." };
  return { allowed: true, reason: null };
}

export function parseVirtualCardCreateInput(value: {
  currency: unknown;
  alias?: unknown;
}): VirtualCardCreateInput {
  const normalizedAlias = alias(value.alias);
  return {
    currency: currency(value.currency),
    ...(normalizedAlias === undefined ? {} : { alias: normalizedAlias }),
  };
}

export function virtualCardCreatePath(): string {
  return "/v1/cards/virtual";
}

export function validateVirtualCardIdempotencyKey(value: unknown): string {
  return idempotencyKey(value);
}

export function parseVirtualCardCreateResponse(
  value: unknown,
  expected: VirtualCardCreateInput,
): VirtualCardCreatedRecord {
  if (!isObject(value)) throw new Error("Invalid virtual card response");
  if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{2,128}$/.test(value.id))
    throw new Error("Invalid virtual card id");
  if (value.type !== "VIRTUAL") throw new Error("Created card is not virtual");
  if (!(["PENDING", "ACTIVE", "FROZEN", "CLOSED", "FAILED"] as unknown[]).includes(value.status))
    throw new Error("Invalid virtual card status");
  if (value.last4 !== null && (typeof value.last4 !== "string" || !/^\d{4}$/.test(value.last4)))
    throw new Error("Invalid virtual card last4");
  if (typeof value.currency !== "string" || value.currency !== currency(expected.currency))
    throw new Error("Created card currency does not match the request");
  const expectedAlias = alias(expected.alias) ?? null;
  if (value.alias !== expectedAlias) throw new Error("Created card alias does not match the request");
  if (!isObject(value.capabilities)) throw new Error("Invalid virtual card capabilities");
  for (const key of ["freeze", "unfreeze", "replace", "renew", "updateLimits"] as const)
    if (typeof value.capabilities[key] !== "boolean") throw new Error(`Invalid virtual card capability ${key}`);
  if (
    value.availableBalanceMinor !== undefined &&
    (typeof value.availableBalanceMinor !== "string" || !/^-?\d+$/.test(value.availableBalanceMinor))
  )
    throw new Error("Invalid virtual card balance");
  if (typeof value.createdAt !== "string") throw new Error("Invalid virtual card createdAt");
  const card: VirtualCardCreatedRecord = {
    id: value.id,
    type: "VIRTUAL",
    status: value.status as VirtualCardCreatedRecord["status"],
    last4: value.last4 as string | null,
    expiryMonth: nullableInteger(value.expiryMonth, "expiryMonth", 1, 12),
    expiryYear: nullableInteger(value.expiryYear, "expiryYear", 2000, 9999),
    currency: value.currency,
    alias: value.alias as string | null,
    ...(value.availableBalanceMinor === undefined ? {} : { availableBalanceMinor: value.availableBalanceMinor as string }),
    createdAt: strictRfc3339(value.createdAt),
    capabilities: {
      freeze: value.capabilities.freeze as boolean,
      unfreeze: value.capabilities.unfreeze as boolean,
      replace: value.capabilities.replace as boolean,
      renew: value.capabilities.renew as boolean,
      updateLimits: value.capabilities.updateLimits as boolean,
    },
  };
  return card;
}

export function virtualCardCreateRequestIsCurrent(
  request: VirtualCardCreateRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
): boolean {
  return request.requestId === currentRequestId && request.scopeKey === currentScopeKey;
}
