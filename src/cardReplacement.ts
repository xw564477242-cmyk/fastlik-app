import type { CardRecord } from "./cardList";

export type CardReplacementEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";
export type CardReplacementReason = "LOST" | "STOLEN" | "DAMAGED" | "OTHER";
export type CardReplacementInput = { reason: CardReplacementReason };

export type CardReplacementSession = Readonly<{
  actorId: string;
  tenantId: string;
  customerId: string;
  environment: CardReplacementEnvironment;
  expiresAt?: string;
}>;

export type CardReplacementDecision = {
  allowed: boolean;
  reason: string | null;
  scopeKey: string | null;
};

export type CardReplacementTransportRequest = Readonly<{
  path: string;
  method: "POST";
  body: CardReplacementInput;
  idempotencyKey: string;
  signal?: AbortSignal;
}>;

export type CardReplacementTransport = (request: CardReplacementTransportRequest) => Promise<unknown>;
export type CardReplacementSubmitGate = { activeRequestId: number | null };

export type CardReplacementVersion = {
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

export type CardReplacementRequestIdentity = {
  requestId: number;
  scopeKey: string;
  reason: CardReplacementReason;
  oldCardVersion: CardReplacementVersion;
  idempotencyKey: string;
};

export type CardReplacementCommit = Readonly<{
  cards: CardRecord[];
  selectedCard: CardRecord;
}>;

export const CARD_REPLACEMENT_REASONS = ["LOST", "STOLEN", "DAMAGED", "OTHER"] as const;

const minSigned64 = -(2n ** 63n);
const maxSigned64 = 2n ** 63n - 1n;
const rfc3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const opaqueCardId = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error(`Invalid Card replacement ${name}`);
  return value;
};

const boundedScopeText = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`Invalid Card replacement ${name}`);
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
  if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable)
    throw new Error(`Invalid Card replacement ${name}`);
  return descriptor.value;
};

const optionalOwnDataProperty = (value: object, key: string, name: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable)
    throw new Error(`Invalid Card replacement ${name}`);
  return descriptor.value;
};

const nullableText = (value: unknown, name: string, maximum: number): string | null => {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error(`Invalid Card replacement ${name}`);
  return value;
};

const nullableInteger = (value: unknown, name: string, minimum: number, maximum: number): number | null => {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid Card replacement ${name}`);
  return value as number;
};

const strictRfc3339 = (value: unknown, name = "createdAt"): string => {
  if (typeof value !== "string") throw new Error(`Invalid Card replacement ${name}`);
  const match = rfc3339.exec(value);
  if (!match) throw new Error(`Invalid Card replacement ${name}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || Number.isNaN(Date.parse(value)))
    throw new Error(`Invalid Card replacement ${name}`);
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
  session: CardReplacementSession | null,
  runtimeEnvironment: CardReplacementEnvironment,
  currentScopeKey: string | null,
  currentCardId: string | null,
  now = Date.now(),
): CardReplacementDecision {
  const scopeKey = cardReplacementSessionScope(session, runtimeEnvironment, now);
  if (scopeKey === null)
    return { allowed: false, reason: "Card replacement requires an unexpired matching SANDBOX or TEST session.", scopeKey };
  if (scopeKey !== currentScopeKey || card.id !== currentCardId)
    return { allowed: false, reason: "Card scope or selection changed. Refresh before replacing.", scopeKey };
  if (!card.capabilities.replace)
    return { allowed: false, reason: "Replacement is not permitted by the current Card capabilities.", scopeKey };
  return { allowed: true, reason: null, scopeKey };
}

export function cardReplacementSessionScope(
  session: CardReplacementSession | null,
  runtimeEnvironment: CardReplacementEnvironment,
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

export function parseCardReplacementInput(value: unknown): CardReplacementInput {
  const input = ordinaryJsonObject(value, "input");
  const reason = ownDataProperty(input, "reason", "reason");
  if (typeof reason !== "string" || !(CARD_REPLACEMENT_REASONS as readonly string[]).includes(reason))
    throw new Error("Invalid Card replacement reason");
  return { reason: reason as CardReplacementReason };
}

export function validateCardReplacementIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new Error("Invalid Card replacement idempotency key");
  return value;
}

export function beginCardReplacement(gate: CardReplacementSubmitGate, requestId: number): boolean {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || gate.activeRequestId !== null) return false;
  gate.activeRequestId = requestId;
  return true;
}

export function settleCardReplacement(gate: CardReplacementSubmitGate, requestId: number): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}

export function createCardReplacementRequestIdentity(
  requestId: number,
  scopeKey: string,
  reason: CardReplacementReason,
  oldCard: CardRecord,
  idempotencyKey: string,
): CardReplacementRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length < 1 || scopeKey.length > 2048)
    throw new Error("Invalid Card replacement request identity");
  return {
    requestId,
    scopeKey,
    reason: parseCardReplacementInput({ reason }).reason,
    oldCardVersion: captureCardReplacementVersion(oldCard),
    idempotencyKey: validateCardReplacementIdempotencyKey(idempotencyKey),
  };
}

export function cardReplacementPath(oldCardId: string): string {
  return `/v1/cards/${encodeURIComponent(opaqueCardId(oldCardId, "old Card ID"))}/replace`;
}

export function captureCardReplacementVersion(card: CardRecord): CardReplacementVersion {
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

export function cardReplacementVersionMatches(
  expected: CardReplacementVersion,
  current: CardRecord | null,
): boolean {
  if (current === null) return false;
  const actual = captureCardReplacementVersion(current);
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

export function replaceCardInCollection(
  current: CardRecord[],
  oldCardId: string,
  replacement: CardRecord,
): CardRecord[] {
  const oldId = opaqueCardId(oldCardId, "old Card ID");
  if (replacement.id === oldId)
    throw new Error("Card replacement did not return a distinct Card identity");
  if (current.some((card) => card.id === replacement.id))
    throw new Error("Card replacement identity collides with an existing Card");
  if (current.filter((card) => card.id === oldId).length !== 1)
    throw new Error("Selected old Card is unavailable or duplicated");
  return current.map((card) => card.id === oldId ? replacement : card);
}

export function createCardReplacementCommit(
  currentCards: CardRecord[],
  currentSelectedCard: CardRecord | null,
  expectedOldCardVersion: CardReplacementVersion,
  replacement: CardRecord,
): CardReplacementCommit {
  if (!cardReplacementVersionMatches(expectedOldCardVersion, currentSelectedCard))
    throw new Error("Selected old Card version changed before replacement commit");
  const cards = replaceCardInCollection(currentCards, expectedOldCardVersion.id, replacement);
  return { cards, selectedCard: replacement };
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
}

export function cardReplacementRequestIsCurrent(
  request: CardReplacementRequestIdentity,
  currentRequestId: number,
  currentSession: CardReplacementSession | null,
  runtimeEnvironment: CardReplacementEnvironment,
  currentScopeKey: string | null,
  currentReason: CardReplacementReason,
  currentOldCard: CardRecord | null,
  now = Date.now(),
): boolean {
  if (
    request.requestId !== currentRequestId ||
    request.scopeKey !== currentScopeKey ||
    cardReplacementSessionScope(currentSession, runtimeEnvironment, now) !== request.scopeKey ||
    request.reason !== currentReason ||
    !cardReplacementVersionMatches(request.oldCardVersion, currentOldCard) ||
    currentOldCard === null
  ) return false;
  return cardReplacementDecision(
    currentOldCard,
    currentSession,
    runtimeEnvironment,
    currentScopeKey,
    currentOldCard.id,
    now,
  ).allowed;
}

export async function submitCardReplacement(
  transport: CardReplacementTransport,
  session: CardReplacementSession,
  runtimeEnvironment: CardReplacementEnvironment,
  currentScopeKey: string | null,
  currentCardId: string | null,
  oldCard: CardRecord,
  input: CardReplacementInput,
  idempotencyKey: string,
  now = Date.now(),
  signal?: AbortSignal,
): Promise<CardRecord> {
  const decision = cardReplacementDecision(oldCard, session, runtimeEnvironment, currentScopeKey, currentCardId, now);
  if (!decision.allowed || decision.scopeKey === null)
    throw new Error(decision.reason ?? "Card replacement unavailable");
  const normalized = parseCardReplacementInput(input);
  const response = await transport({
    path: cardReplacementPath(oldCard.id),
    method: "POST",
    body: normalized,
    idempotencyKey: validateCardReplacementIdempotencyKey(idempotencyKey),
    ...(signal ? { signal } : {}),
  });
  return parseCardReplacementResponse(response, oldCard.id);
}
