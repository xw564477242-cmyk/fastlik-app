import type { CardRecord } from "./cardList";

export type CardReplacementEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";
export type CardReplacementReason = "LOST" | "STOLEN" | "DAMAGED" | "OTHER";
export type CardReplacementInput = { reason: CardReplacementReason };

export type CardReplacementDecision = {
  allowed: boolean;
  reason: string | null;
};

export type CardReplacementRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  oldCardId: string;
};

export const CARD_REPLACEMENT_REASONS = ["LOST", "STOLEN", "DAMAGED", "OTHER"] as const;

const minSigned64 = -(2n ** 63n);
const maxSigned64 = 2n ** 63n - 1n;
const rfc3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const opaqueCardId = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error(`Invalid Card replacement ${name}`);
  return value;
};

const ordinaryJsonObject = (value: unknown, name: string): object => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid Card replacement ${name}`);
  return value;
};

const ownDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value"))
    throw new Error(`Invalid Card replacement ${name}`);
  return descriptor.value;
};

const optionalOwnDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value"))
    throw new Error(`Invalid Card replacement ${name}`);
  return descriptor.value;
};

const nullableInteger = (value: unknown, name: string, minimum: number, maximum: number): number | null => {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid Card replacement ${name}`);
  return value as number;
};

const strictRfc3339 = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid Card replacement createdAt");
  const match = rfc3339.exec(value);
  if (!match) throw new Error("Invalid Card replacement createdAt");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error("Invalid Card replacement createdAt");
  return value;
};

const signed64Minor = (value: unknown): string => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,18})$/.test(value))
    throw new Error("Invalid Card replacement balance");
  const amount = BigInt(value);
  if (amount < minSigned64 || amount > maxSigned64)
    throw new Error("Invalid Card replacement balance");
  return value;
};

export function cardReplacementDecision(
  card: CardRecord,
  sessionEnvironment: CardReplacementEnvironment | null,
  runtimeEnvironment: CardReplacementEnvironment,
  expectedScopeKey: string | null,
  currentScopeKey: string | null,
  currentCardId: string | null,
): CardReplacementDecision {
  if (sessionEnvironment === null || sessionEnvironment !== runtimeEnvironment)
    return { allowed: false, reason: "Card replacement requires a matching session and runtime environment." };
  if (sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST")
    return { allowed: false, reason: "Card replacement is available only in SANDBOX or TEST." };
  if (expectedScopeKey === null || expectedScopeKey !== currentScopeKey || card.id !== currentCardId)
    return { allowed: false, reason: "Card scope or selection changed. Refresh before replacing." };
  if (!card.capabilities.replace)
    return { allowed: false, reason: "Replacement is not permitted by the current Card capabilities." };
  return { allowed: true, reason: null };
}

export function parseCardReplacementInput(value: unknown): CardReplacementInput {
  const input = ordinaryJsonObject(value, "input");
  const reason = ownDataProperty(input, "reason", "reason");
  if (typeof reason !== "string" || !(CARD_REPLACEMENT_REASONS as readonly string[]).includes(reason))
    throw new Error("Invalid Card replacement reason");
  return { reason: reason as CardReplacementReason };
}

export function validateCardReplacementIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(value))
    throw new Error("Invalid Card replacement idempotency key");
  return value;
}

export function cardReplacementPath(oldCardId: string): string {
  return `/v1/cards/${encodeURIComponent(opaqueCardId(oldCardId, "old Card ID"))}/replace`;
}

export function parseCardReplacementResponse(value: unknown, oldCardId: string): CardRecord {
  const expectedOldCardId = opaqueCardId(oldCardId, "old Card ID");
  const response = ordinaryJsonObject(value, "response");
  const id = opaqueCardId(ownDataProperty(response, "id", "new Card ID"), "new Card ID");
  const type = ownDataProperty(response, "type", "type");
  const status = ownDataProperty(response, "status", "status");
  const last4 = ownDataProperty(response, "last4", "last4");
  const expiryMonth = ownDataProperty(response, "expiryMonth", "expiryMonth");
  const expiryYear = ownDataProperty(response, "expiryYear", "expiryYear");
  const currency = ownDataProperty(response, "currency", "currency");
  const alias = ownDataProperty(response, "alias", "alias");
  const createdAt = ownDataProperty(response, "createdAt", "createdAt");
  const capabilitiesValue = ownDataProperty(response, "capabilities", "capabilities");
  const availableBalanceMinor = optionalOwnDataProperty(response, "availableBalanceMinor", "balance");

  if (id === expectedOldCardId) throw new Error("Card replacement did not return a distinct Card identity");
  if (type !== "VIRTUAL" && type !== "PHYSICAL") throw new Error("Invalid Card replacement type");
  if (!(status === "PENDING" || status === "ACTIVE" || status === "FROZEN" || status === "CLOSED" || status === "FAILED"))
    throw new Error("Invalid Card replacement status");
  if (last4 !== null && (typeof last4 !== "string" || !/^\d{4}$/.test(last4)))
    throw new Error("Invalid Card replacement last4");
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
    throw new Error("Invalid Card replacement currency");
  if (alias !== null && typeof alias !== "string") throw new Error("Invalid Card replacement alias");

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
    if (typeof capability !== "boolean") throw new Error(`Invalid Card replacement capability ${name}`);

  const parsedBalance = availableBalanceMinor === undefined ? undefined : signed64Minor(availableBalanceMinor);
  return {
    id,
    type,
    status,
    last4: last4 as string | null,
    expiryMonth: nullableInteger(expiryMonth, "expiryMonth", 1, 12),
    expiryYear: nullableInteger(expiryYear, "expiryYear", 2000, 9999),
    currency,
    alias: alias as string | null,
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
}

export function cardReplacementRequestIsCurrent(
  request: CardReplacementRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentOldCardId: string | null,
): boolean {
  return request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.oldCardId === currentOldCardId;
}
