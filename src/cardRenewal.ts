import type { CardRecord } from "./cardList";

export type CardRenewalEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";

export type CardRenewalDecision = {
  allowed: boolean;
  reason: string | null;
};

export type CardRenewalRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  cardId: string;
};

const minSigned64 = -(2n ** 63n);
const maxSigned64 = 2n ** 63n - 1n;
const rfc3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const opaqueCardId = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error(`Invalid Card renewal ${name}`);
  return value;
};

const ordinaryJsonObject = (value: unknown, name: string): object => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid Card renewal ${name}`);
  return value;
};

const ownDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value"))
    throw new Error(`Invalid Card renewal ${name}`);
  return descriptor.value;
};

const optionalOwnDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value"))
    throw new Error(`Invalid Card renewal ${name}`);
  return descriptor.value;
};

const requiredInteger = (value: unknown, name: string, minimum: number, maximum: number): number => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid Card renewal ${name}`);
  return value as number;
};

const strictRfc3339 = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("Invalid Card renewal createdAt");
  const match = rfc3339.exec(value);
  if (!match) throw new Error("Invalid Card renewal createdAt");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error("Invalid Card renewal createdAt");
  return value;
};

const signed64Minor = (value: unknown): string => {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,18})$/.test(value))
    throw new Error("Invalid Card renewal balance");
  const amount = BigInt(value);
  if (amount < minSigned64 || amount > maxSigned64)
    throw new Error("Invalid Card renewal balance");
  return value;
};

export function cardRenewalDecision(
  card: CardRecord,
  sessionEnvironment: CardRenewalEnvironment | null,
  runtimeEnvironment: CardRenewalEnvironment,
  expectedScopeKey: string | null,
  currentScopeKey: string | null,
  currentCardId: string | null,
): CardRenewalDecision {
  if (sessionEnvironment === null || sessionEnvironment !== runtimeEnvironment)
    return { allowed: false, reason: "Card renewal requires a matching session and runtime environment." };
  if (sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST")
    return { allowed: false, reason: "Card renewal is available only in SANDBOX or TEST." };
  if (expectedScopeKey === null || expectedScopeKey !== currentScopeKey || card.id !== currentCardId)
    return { allowed: false, reason: "Card scope or selection changed. Refresh before renewing." };
  if (!card.capabilities.renew)
    return { allowed: false, reason: "Renewal is not permitted by the current Card capabilities." };
  if (card.expiryMonth === null || card.expiryYear === null)
    return { allowed: false, reason: "Card renewal requires a current expiry." };
  return { allowed: true, reason: null };
}

export function validateCardRenewalIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new Error("Invalid Card renewal idempotency key");
  return value;
}

export function cardRenewalPath(cardId: string): string {
  return `/v1/cards/${encodeURIComponent(opaqueCardId(cardId, "Card ID"))}/renew`;
}

export function parseCardRenewalResponse(value: unknown, currentCard: CardRecord): CardRecord {
  const expectedCardId = opaqueCardId(currentCard.id, "selected Card ID");
  if (currentCard.expiryMonth === null || currentCard.expiryYear === null)
    throw new Error("Card renewal requires a current expiry");

  const response = ordinaryJsonObject(value, "response");
  const id = opaqueCardId(ownDataProperty(response, "id", "Card ID"), "Card ID");
  const type = ownDataProperty(response, "type", "type");
  const status = ownDataProperty(response, "status", "status");
  const last4 = ownDataProperty(response, "last4", "last4");
  const expiryMonth = requiredInteger(ownDataProperty(response, "expiryMonth", "expiryMonth"), "expiryMonth", 1, 12);
  const expiryYear = requiredInteger(ownDataProperty(response, "expiryYear", "expiryYear"), "expiryYear", 2000, 9999);
  const currency = ownDataProperty(response, "currency", "currency");
  const alias = ownDataProperty(response, "alias", "alias");
  const createdAt = ownDataProperty(response, "createdAt", "createdAt");
  const capabilitiesValue = ownDataProperty(response, "capabilities", "capabilities");
  const availableBalanceMinor = optionalOwnDataProperty(response, "availableBalanceMinor", "balance");

  if (id !== expectedCardId) throw new Error("Card renewal identity does not match the selected Card");
  const currentExpiry = currentCard.expiryYear * 12 + currentCard.expiryMonth;
  const renewedExpiry = expiryYear * 12 + expiryMonth;
  if (renewedExpiry <= currentExpiry) throw new Error("Card renewal expiry did not advance");
  if (type !== "VIRTUAL" && type !== "PHYSICAL") throw new Error("Invalid Card renewal type");
  if (!(status === "PENDING" || status === "ACTIVE" || status === "FROZEN" || status === "CLOSED" || status === "FAILED"))
    throw new Error("Invalid Card renewal status");
  if (last4 !== null && (typeof last4 !== "string" || !/^\d{4}$/.test(last4)))
    throw new Error("Invalid Card renewal last4");
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
    throw new Error("Invalid Card renewal currency");
  if (alias !== null && typeof alias !== "string") throw new Error("Invalid Card renewal alias");

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
    if (typeof capability !== "boolean") throw new Error(`Invalid Card renewal capability ${name}`);

  const parsedBalance = availableBalanceMinor === undefined ? undefined : signed64Minor(availableBalanceMinor);
  return {
    id,
    type,
    status,
    last4: last4 as string | null,
    expiryMonth,
    expiryYear,
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

export function cardRenewalRequestIsCurrent(
  request: CardRenewalRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
): boolean {
  return request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.cardId === currentCardId;
}
