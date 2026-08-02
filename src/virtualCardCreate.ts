import type { CardRecord } from "./cardList";

export type VirtualCardCreateEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";

export type VirtualCardCreateInput = {
  currency: string;
  alias?: string;
};

export type VirtualCardCreateSession = Readonly<{
  actorId: string;
  tenantId: string;
  customerId: string;
  environment: VirtualCardCreateEnvironment;
  expiresAt?: string;
}>;

export type VirtualCardCreateTransportRequest = Readonly<{
  path: string;
  method: "POST";
  body: VirtualCardCreateInput;
  idempotencyKey: string;
  signal?: AbortSignal;
}>;

export type VirtualCardCreateTransport = (request: VirtualCardCreateTransportRequest) => Promise<unknown>;
export type VirtualCardCreateSubmitGate = { activeRequestId: number | null };

export type VirtualCardCreateRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  inputVersion: string;
  cardGeneration: string;
  idempotencyKey: string;
}>;

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
const minSigned64 = -(2n ** 63n);
const maxSigned64 = 2n ** 63n - 1n;

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
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    throw new Error("Invalid virtual card idempotency key");
  return value;
};

const boundedScopeText = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`Invalid virtual card ${name}`);
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

const ordinaryJsonObject = (value: unknown, name: string): object => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid virtual card ${name}`);
  return value;
};

const ownDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value"))
    throw new Error(`Invalid virtual card ${name}`);
  return descriptor.value;
};

const optionalOwnDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value"))
    throw new Error(`Invalid virtual card ${name}`);
  return descriptor.value;
};

const signed64Minor = (value: unknown): string => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,18})$/.test(value))
    throw new Error("Invalid virtual card balance");
  const amount = BigInt(value);
  if (amount < minSigned64 || amount > maxSigned64)
    throw new Error("Invalid virtual card balance");
  return value;
};

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

export function virtualCardCreateSessionScope(
  session: VirtualCardCreateSession | null,
  runtimeEnvironment: VirtualCardCreateEnvironment,
  now = Date.now(),
): string | null {
  if (
    !session ||
    session.environment !== runtimeEnvironment ||
    (runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST") ||
    typeof session.expiresAt !== "string"
  ) return null;
  try {
    const expiresAt = strictRfc3339(session.expiresAt);
    if (Date.parse(expiresAt) <= now) return null;
    return JSON.stringify([
      boundedScopeText(session.actorId, "actor"),
      boundedScopeText(session.tenantId, "tenant"),
      boundedScopeText(session.customerId, "customer"),
      session.environment,
      expiresAt,
    ]);
  } catch {
    return null;
  }
}

function publicCardVersion(card: CardRecord): readonly unknown[] {
  return [
    card.id,
    card.type,
    card.status,
    card.last4,
    card.expiryMonth,
    card.expiryYear,
    card.currency,
    card.alias,
    Object.prototype.hasOwnProperty.call(card, "availableBalanceMinor"),
    card.availableBalanceMinor,
    card.createdAt,
    card.capabilities.freeze,
    card.capabilities.unfreeze,
    card.capabilities.replace,
    card.capabilities.renew,
    card.capabilities.updateLimits,
  ];
}

export function captureVirtualCardGeneration(
  cards: readonly CardRecord[],
  nextCursor: string | null,
  selectedCard: CardRecord | null,
): string {
  if (nextCursor !== null && (typeof nextCursor !== "string" || nextCursor.length < 1 || nextCursor.length > 4096))
    throw new Error("Invalid virtual card list cursor generation");
  return JSON.stringify([
    cards.map(publicCardVersion),
    nextCursor,
    selectedCard === null ? null : publicCardVersion(selectedCard),
  ]);
}

function virtualCardInputVersion(input: VirtualCardCreateInput): string {
  const normalized = parseVirtualCardCreateInput(input);
  return JSON.stringify([normalized.currency, normalized.alias ?? null]);
}

export function beginVirtualCardCreate(gate: VirtualCardCreateSubmitGate, requestId: number): boolean {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || gate.activeRequestId !== null) return false;
  gate.activeRequestId = requestId;
  return true;
}

export function settleVirtualCardCreate(gate: VirtualCardCreateSubmitGate, requestId: number): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}

export function createVirtualCardCreateRequestIdentity(
  requestId: number,
  scopeKey: string,
  input: VirtualCardCreateInput,
  cards: readonly CardRecord[],
  nextCursor: string | null,
  selectedCard: CardRecord | null,
  requestIdempotencyKey: string,
): VirtualCardCreateRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length < 1 || scopeKey.length > 4096)
    throw new Error("Invalid virtual card create request identity");
  return Object.freeze({
    requestId,
    scopeKey,
    inputVersion: virtualCardInputVersion(input),
    cardGeneration: captureVirtualCardGeneration(cards, nextCursor, selectedCard),
    idempotencyKey: validateVirtualCardIdempotencyKey(requestIdempotencyKey),
  });
}

export function parseVirtualCardCreateResponse(
  value: unknown,
  expected: VirtualCardCreateInput,
): VirtualCardCreatedRecord {
  const response = ordinaryJsonObject(value, "response");
  const id = ownDataProperty(response, "id", "id");
  const type = ownDataProperty(response, "type", "type");
  const status = ownDataProperty(response, "status", "status");
  const last4 = ownDataProperty(response, "last4", "last4");
  const expiryMonth = ownDataProperty(response, "expiryMonth", "expiryMonth");
  const expiryYear = ownDataProperty(response, "expiryYear", "expiryYear");
  const responseCurrency = ownDataProperty(response, "currency", "currency");
  const responseAlias = ownDataProperty(response, "alias", "alias");
  const createdAt = ownDataProperty(response, "createdAt", "createdAt");
  const capabilitiesValue = ownDataProperty(response, "capabilities", "capabilities");
  const availableBalanceMinor = optionalOwnDataProperty(
    response,
    "availableBalanceMinor",
    "balance",
  );

  if (typeof id !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(id))
    throw new Error("Invalid virtual card id");
  if (type !== "VIRTUAL") throw new Error("Created card is not virtual");
  if (!(["PENDING", "ACTIVE", "FROZEN", "CLOSED", "FAILED"] as unknown[]).includes(status))
    throw new Error("Invalid virtual card status");
  if (last4 !== null && (typeof last4 !== "string" || !/^\d{4}$/.test(last4)))
    throw new Error("Invalid virtual card last4");
  if (typeof responseCurrency !== "string" || responseCurrency !== currency(expected.currency))
    throw new Error("Created card currency does not match the request");
  const expectedAlias = alias(expected.alias) ?? null;
  if (responseAlias !== expectedAlias) throw new Error("Created card alias does not match the request");

  const capabilitiesObject = ordinaryJsonObject(capabilitiesValue, "capabilities");
  const freeze = ownDataProperty(capabilitiesObject, "freeze", "capability freeze");
  const unfreeze = ownDataProperty(capabilitiesObject, "unfreeze", "capability unfreeze");
  const replace = ownDataProperty(capabilitiesObject, "replace", "capability replace");
  const renew = ownDataProperty(capabilitiesObject, "renew", "capability renew");
  const updateLimits = ownDataProperty(capabilitiesObject, "updateLimits", "capability updateLimits");
  for (const [name, capability] of [
    ["freeze", freeze],
    ["unfreeze", unfreeze],
    ["replace", replace],
    ["renew", renew],
    ["updateLimits", updateLimits],
  ] as const)
    if (typeof capability !== "boolean") throw new Error(`Invalid virtual card capability ${name}`);

  const parsedBalance = availableBalanceMinor === undefined ? undefined : signed64Minor(availableBalanceMinor);
  if (typeof createdAt !== "string") throw new Error("Invalid virtual card createdAt");
  const card: VirtualCardCreatedRecord = {
    id,
    type: "VIRTUAL",
    status: status as VirtualCardCreatedRecord["status"],
    last4: last4 as string | null,
    expiryMonth: nullableInteger(expiryMonth, "expiryMonth", 1, 12),
    expiryYear: nullableInteger(expiryYear, "expiryYear", 2000, 9999),
    currency: responseCurrency,
    alias: responseAlias as string | null,
    ...(parsedBalance === undefined ? {} : { availableBalanceMinor: parsedBalance }),
    createdAt: strictRfc3339(createdAt),
    capabilities: {
      freeze: freeze as boolean,
      unfreeze: unfreeze as boolean,
      replace: replace as boolean,
      renew: renew as boolean,
      updateLimits: updateLimits as boolean,
    },
  };
  return card;
}

export function virtualCardCreateRequestIsCurrent(
  request: VirtualCardCreateRequestIdentity,
  currentRequestId: number,
  currentSession: VirtualCardCreateSession | null,
  runtimeEnvironment: VirtualCardCreateEnvironment,
  currentScopeKey: string | null,
  currentInput: VirtualCardCreateInput,
  currentCards: readonly CardRecord[],
  currentNextCursor: string | null,
  currentSelectedCard: CardRecord | null,
  mounted: boolean,
  now = Date.now(),
): boolean {
  if (!mounted || request.requestId !== currentRequestId || request.scopeKey !== currentScopeKey) return false;
  try {
    return (
      virtualCardCreateSessionScope(currentSession, runtimeEnvironment, now) === request.scopeKey &&
      virtualCardInputVersion(currentInput) === request.inputVersion &&
      captureVirtualCardGeneration(currentCards, currentNextCursor, currentSelectedCard) === request.cardGeneration
    );
  } catch {
    return false;
  }
}

export async function submitVirtualCardCreate(
  transport: VirtualCardCreateTransport,
  session: VirtualCardCreateSession,
  runtimeEnvironment: VirtualCardCreateEnvironment,
  currentScopeKey: string | null,
  input: VirtualCardCreateInput,
  requestIdempotencyKey: string,
  now = Date.now(),
  signal?: AbortSignal,
): Promise<VirtualCardCreatedRecord> {
  const scopeKey = virtualCardCreateSessionScope(session, runtimeEnvironment, now);
  if (scopeKey === null || scopeKey !== currentScopeKey)
    throw new Error("Virtual card creation requires an unexpired matching SANDBOX or TEST session");
  const normalized = parseVirtualCardCreateInput(input);
  const response = await transport({
    path: virtualCardCreatePath(),
    method: "POST",
    body: normalized,
    idempotencyKey: validateVirtualCardIdempotencyKey(requestIdempotencyKey),
    ...(signal ? { signal } : {}),
  });
  return parseVirtualCardCreateResponse(response, normalized);
}
