import type { CardRecord } from "./cardList";

export type CardRenewalEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";

export type CardRenewalSession = Readonly<{
  actorId: string;
  tenantId: string;
  customerId: string;
  environment: CardRenewalEnvironment;
  expiresAt?: string;
}>;

export type CardRenewalDecision = {
  allowed: boolean;
  reason: string | null;
  scopeKey: string | null;
};

export type CardRenewalVersion = {
  id: string;
  type: CardRecord["type"];
  status: CardRecord["status"];
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  currency: string;
  alias: string | null;
  hasAvailableBalanceMinor: boolean;
  availableBalanceMinor: string | undefined;
  createdAt: string;
  freeze: boolean;
  unfreeze: boolean;
  replace: boolean;
  renew: boolean;
  updateLimits: boolean;
};

export type CardRenewalRequestIdentity = {
  requestId: number;
  scopeKey: string;
  oldCardVersion: CardRenewalVersion;
  idempotencyKey: string;
};

export type CardRenewalTransportRequest = Readonly<{
  path: string;
  method: "POST";
  idempotencyKey: string;
}>;

export type CardRenewalTransport = (request: CardRenewalTransportRequest) => Promise<unknown>;
export type CardRenewalSubmitGate = { activeRequestId: number | null };
export type CardRenewalCommit = Readonly<{ cards: CardRecord[]; selectedCard: CardRecord }>;

const minSigned64 = -(2n ** 63n);
const maxSigned64 = 2n ** 63n - 1n;
const rfc3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const opaqueCardId = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error(`Invalid Card renewal ${name}`);
  return value;
};

const boundedScopeText = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`Invalid Card renewal ${name}`);
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
  if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable)
    throw new Error(`Invalid Card renewal ${name}`);
  return descriptor.value;
};

const optionalOwnDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable)
    throw new Error(`Invalid Card renewal ${name}`);
  return descriptor.value;
};

const requiredInteger = (value: unknown, name: string, minimum: number, maximum: number): number => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid Card renewal ${name}`);
  return value as number;
};

const nullableText = (value: unknown, name: string, maximum: number): string | null => {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`Invalid Card renewal ${name}`);
  return value;
};

const strictRfc3339 = (value: unknown, name = "createdAt"): string => {
  if (typeof value !== "string") throw new Error(`Invalid Card renewal ${name}`);
  const match = rfc3339.exec(value);
  if (!match) throw new Error(`Invalid Card renewal ${name}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid Card renewal ${name}`);
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
  session: CardRenewalSession | null,
  runtimeEnvironment: CardRenewalEnvironment,
  currentScopeKey: string | null,
  currentCardId: string | null,
  now = Date.now(),
): CardRenewalDecision {
  const scopeKey = cardRenewalSessionScope(session, runtimeEnvironment, now);
  if (scopeKey === null)
    return { allowed: false, reason: "Card renewal requires an unexpired matching SANDBOX or TEST session.", scopeKey };
  if (scopeKey !== currentScopeKey || card.id !== currentCardId)
    return { allowed: false, reason: "Card scope or selection changed. Refresh before renewing.", scopeKey };
  if (!card.capabilities.renew)
    return { allowed: false, reason: "Renewal is not permitted by the current Card capabilities.", scopeKey };
  if (
    !Number.isInteger(card.expiryMonth) ||
    (card.expiryMonth as number) < 1 ||
    (card.expiryMonth as number) > 12 ||
    !Number.isInteger(card.expiryYear) ||
    (card.expiryYear as number) < 2000 ||
    (card.expiryYear as number) > 9999
  )
    return { allowed: false, reason: "Card renewal requires a current expiry.", scopeKey };
  return { allowed: true, reason: null, scopeKey };
}

export function cardRenewalSessionScope(
  session: CardRenewalSession | null,
  runtimeEnvironment: CardRenewalEnvironment,
  now = Date.now(),
): string | null {
  if (
    !session ||
    session.environment !== runtimeEnvironment ||
    (runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST")
  ) return null;
  try {
    const expiresAt = strictRfc3339(session.expiresAt, "session expiry");
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

export function validateCardRenewalIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new Error("Invalid Card renewal idempotency key");
  return value;
}

export function beginCardRenewal(gate: CardRenewalSubmitGate, requestId: number): boolean {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || gate.activeRequestId !== null) return false;
  gate.activeRequestId = requestId;
  return true;
}

export function settleCardRenewal(gate: CardRenewalSubmitGate, requestId: number): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}

export function captureCardRenewalVersion(card: CardRecord): CardRenewalVersion {
  return {
    id: card.id,
    type: card.type,
    status: card.status,
    last4: card.last4,
    expiryMonth: card.expiryMonth,
    expiryYear: card.expiryYear,
    currency: card.currency,
    alias: card.alias,
    hasAvailableBalanceMinor: Object.prototype.hasOwnProperty.call(card, "availableBalanceMinor"),
    availableBalanceMinor: card.availableBalanceMinor,
    createdAt: card.createdAt,
    freeze: card.capabilities.freeze,
    unfreeze: card.capabilities.unfreeze,
    replace: card.capabilities.replace,
    renew: card.capabilities.renew,
    updateLimits: card.capabilities.updateLimits,
  };
}

export function cardRenewalVersionMatches(expected: CardRenewalVersion, current: CardRecord | null): boolean {
  if (current === null) return false;
  const actual = captureCardRenewalVersion(current);
  return expected.id === actual.id &&
    expected.type === actual.type &&
    expected.status === actual.status &&
    expected.last4 === actual.last4 &&
    expected.expiryMonth === actual.expiryMonth &&
    expected.expiryYear === actual.expiryYear &&
    expected.currency === actual.currency &&
    expected.alias === actual.alias &&
    expected.hasAvailableBalanceMinor === actual.hasAvailableBalanceMinor &&
    expected.availableBalanceMinor === actual.availableBalanceMinor &&
    expected.createdAt === actual.createdAt &&
    expected.freeze === actual.freeze &&
    expected.unfreeze === actual.unfreeze &&
    expected.replace === actual.replace &&
    expected.renew === actual.renew &&
    expected.updateLimits === actual.updateLimits;
}

export function createCardRenewalRequestIdentity(
  requestId: number,
  scopeKey: string,
  oldCard: CardRecord,
  idempotencyKey: string,
): CardRenewalRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length < 1 || scopeKey.length > 2048)
    throw new Error("Invalid Card renewal request identity");
  return {
    requestId,
    scopeKey,
    oldCardVersion: captureCardRenewalVersion(oldCard),
    idempotencyKey: validateCardRenewalIdempotencyKey(idempotencyKey),
  };
}

export function cardRenewalPath(cardId: string): string {
  return `/v1/cards/${encodeURIComponent(opaqueCardId(cardId, "Card ID"))}/renew`;
}

export function createCardRenewalCommit(
  currentCards: CardRecord[],
  currentSelectedCard: CardRecord | null,
  expectedOldCardVersion: CardRenewalVersion,
  renewed: CardRecord,
): CardRenewalCommit {
  if (!cardRenewalVersionMatches(expectedOldCardVersion, currentSelectedCard))
    throw new Error("Selected Card version changed before renewal commit");
  if (renewed.id !== expectedOldCardVersion.id)
    throw new Error("Renewed Card identity does not match the selected Card");
  if (currentCards.filter(card => card.id === expectedOldCardVersion.id).length !== 1)
    throw new Error("Selected Card is unavailable or duplicated");
  return {
    cards: currentCards.map(card => card.id === renewed.id ? renewed : card),
    selectedCard: renewed,
  };
}

export function parseCardRenewalResponse(value: unknown, currentCard: CardRecord): CardRecord {
  const expectedCardId = opaqueCardId(currentCard.id, "selected Card ID");
  const currentExpiryMonth = requiredInteger(currentCard.expiryMonth, "current expiryMonth", 1, 12);
  const currentExpiryYear = requiredInteger(currentCard.expiryYear, "current expiryYear", 2000, 9999);

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
  const currentExpiry = currentExpiryYear * 12 + currentExpiryMonth;
  const renewedExpiry = expiryYear * 12 + expiryMonth;
  if (renewedExpiry <= currentExpiry) throw new Error("Card renewal expiry did not advance");
  if (type !== "VIRTUAL" && type !== "PHYSICAL") throw new Error("Invalid Card renewal type");
  if (!(status === "PENDING" || status === "ACTIVE" || status === "FROZEN" || status === "CLOSED" || status === "FAILED"))
    throw new Error("Invalid Card renewal status");
  if (last4 !== null && (typeof last4 !== "string" || !/^\d{4}$/.test(last4)))
    throw new Error("Invalid Card renewal last4");
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency))
    throw new Error("Invalid Card renewal currency");
  const parsedAlias = nullableText(alias, "alias", 120);

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
  const renewed: CardRecord = {
    id,
    type,
    status,
    last4: last4 as string | null,
    expiryMonth,
    expiryYear,
    currency,
    alias: parsedAlias,
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
  if (
    renewed.type !== currentCard.type ||
    renewed.last4 !== currentCard.last4 ||
    renewed.currency !== currentCard.currency ||
    renewed.alias !== currentCard.alias ||
    renewed.createdAt !== currentCard.createdAt
  ) throw new Error("Card renewal response changed immutable public Card fields");
  return renewed;
}

export function cardRenewalRequestIsCurrent(
  request: CardRenewalRequestIdentity,
  currentRequestId: number,
  currentSession: CardRenewalSession | null,
  runtimeEnvironment: CardRenewalEnvironment,
  currentScopeKey: string | null,
  currentCard: CardRecord | null,
  now = Date.now(),
): boolean {
  if (
    request.requestId !== currentRequestId ||
    request.scopeKey !== currentScopeKey ||
    cardRenewalSessionScope(currentSession, runtimeEnvironment, now) !== request.scopeKey ||
    !cardRenewalVersionMatches(request.oldCardVersion, currentCard) ||
    currentCard === null
  ) return false;
  return cardRenewalDecision(
    currentCard,
    currentSession,
    runtimeEnvironment,
    currentScopeKey,
    currentCard.id,
    now,
  ).allowed;
}

export async function submitCardRenewal(
  transport: CardRenewalTransport,
  session: CardRenewalSession,
  runtimeEnvironment: CardRenewalEnvironment,
  currentScopeKey: string | null,
  currentCardId: string | null,
  card: CardRecord,
  idempotencyKey: string,
  now = Date.now(),
): Promise<CardRecord> {
  const decision = cardRenewalDecision(card, session, runtimeEnvironment, currentScopeKey, currentCardId, now);
  if (!decision.allowed || decision.scopeKey === null)
    throw new Error(decision.reason ?? "Card renewal unavailable");
  const response = await transport({
    path: cardRenewalPath(card.id),
    method: "POST",
    idempotencyKey: validateCardRenewalIdempotencyKey(idempotencyKey),
  });
  return parseCardRenewalResponse(response, card);
}
