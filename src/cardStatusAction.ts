import type { CardRecord } from "./cardList.ts";

export type CardStatusEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";
export type CardStatusOperation = "activate" | "freeze" | "unfreeze";

export type CardStatusSession = Readonly<{
  actorId: string;
  tenantId: string;
  customerId: string;
  environment: CardStatusEnvironment;
  expiresAt?: string;
}>;

export type CardStatusDecision = Readonly<{
  operation: CardStatusOperation | null;
  label: string;
  allowed: boolean;
  reason: string | null;
  scopeKey: string | null;
}>;

export type CardStatusTransportRequest = Readonly<{
  path: string;
  method: "POST";
  idempotencyKey: string;
  signal?: AbortSignal;
}>;

export type CardStatusTransport = (request: CardStatusTransportRequest) => Promise<unknown>;
export type CardStatusSubmitGate = { activeRequestId: number | null };

export type CardStatusRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  operation: CardStatusOperation;
  session: CardStatusSession;
  card: CardRecord;
  cardKey: string;
  idempotencyKey: string;
  retry: boolean;
}>;

export type CardStatusFailureKind = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "AMBIGUOUS" | "TERMINAL";

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const MIN_SIGNED_64 = -(2n ** 63n);
const MAX_SIGNED_64 = 2n ** 63n - 1n;

function ordinaryObject(value: unknown, name: string): object {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid Card status ${name}`);
  return value;
}

function ownData(value: object, field: string, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
    throw new Error(`Invalid Card status ${name}`);
  return descriptor.value;
}

function optionalOwnData(value: object, field: string, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor) return undefined;
  if (!("value" in descriptor) || !descriptor.enumerable)
    throw new Error(`Invalid Card status ${name}`);
  return descriptor.value;
}

function opaqueId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid Card status Card ID");
  return value;
}

function boundedScopeText(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(`Invalid Card status ${name}`);
  return value;
}

function strictRfc3339(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`Invalid Card status ${name}`);
  const match = RFC3339.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) throw new Error(`Invalid Card status ${name}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1])
    throw new Error(`Invalid Card status ${name}`);
  return value;
}

function nullableInteger(value: unknown, name: string, minimum: number, maximum: number): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`Invalid Card status ${name}`);
  return value as number;
}

function nullableText(value: unknown, name: string, maximum: number): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(`Invalid Card status ${name}`);
  return value;
}

function optionalSigned64(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,18})$/.test(value))
    throw new Error("Invalid Card status available balance");
  const amount = BigInt(value);
  if (amount < MIN_SIGNED_64 || amount > MAX_SIGNED_64)
    throw new Error("Invalid Card status available balance");
  return value;
}

function cardVersionKey(card: CardRecord): string {
  return JSON.stringify([
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
  ]);
}

export function cardStatusSessionScope(
  session: CardStatusSession | null,
  runtimeEnvironment: CardStatusEnvironment,
  now = Date.now(),
): string | null {
  if (
    !session ||
    session.environment !== runtimeEnvironment ||
    (runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST")
  ) return null;
  let expiresAt: string;
  try {
    expiresAt = strictRfc3339(session.expiresAt, "session expiry");
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

export function cardStatusDecision(
  card: CardRecord,
  session: CardStatusSession | null,
  runtimeEnvironment: CardStatusEnvironment,
  currentScopeKey: string | null,
  currentCardId: string | null,
  now = Date.now(),
): CardStatusDecision {
  const scopeKey = cardStatusSessionScope(session, runtimeEnvironment, now);
  if (scopeKey === null)
    return { operation: null, label: "Card action unavailable", allowed: false, reason: "Card status action requires an unexpired matching SANDBOX or TEST session.", scopeKey };
  if (scopeKey !== currentScopeKey || card.id !== currentCardId)
    return { operation: null, label: "Card action unavailable", allowed: false, reason: "Card scope or selection changed.", scopeKey };
  if (card.status === "ACTIVE")
    return card.capabilities.freeze
      ? { operation: "freeze", label: "Freeze", allowed: true, reason: null, scopeKey }
      : { operation: "freeze", label: "Freeze unavailable", allowed: false, reason: "Freeze is not permitted by the current Card capabilities.", scopeKey };
  if (card.status === "FROZEN")
    return card.capabilities.unfreeze
      ? { operation: "unfreeze", label: "Unfreeze", allowed: true, reason: null, scopeKey }
      : { operation: "unfreeze", label: "Unfreeze unavailable", allowed: false, reason: "Unfreeze is not permitted by the current Card capabilities.", scopeKey };
  if (card.status === "PENDING")
    return { operation: "activate", label: "Activate", allowed: true, reason: null, scopeKey };
  return { operation: null, label: "Card action unavailable", allowed: false, reason: `Card status ${card.status} does not permit freeze or unfreeze.`, scopeKey };
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createCardStatusIdempotencyKey(operation: CardStatusOperation, randomUuid: unknown): string {
  if (typeof randomUuid !== "string" || !UUID_V4.test(randomUuid))
    throw new Error("Invalid Card status random idempotency input");
  return operation === "activate" ? `activate:${randomUuid}` : randomUuid;
}

export function validateCardStatusIdempotencyKey(value: unknown, operation?: CardStatusOperation): string {
  if (
    typeof value !== "string" ||
    !(operation === "activate" ? /^activate:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value) : UUID_V4.test(value))
  ) throw new Error("Invalid Card status idempotency key");
  return value;
}

export function beginCardStatusAction(gate: CardStatusSubmitGate, requestId: number): boolean {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || gate.activeRequestId !== null) return false;
  gate.activeRequestId = requestId;
  return true;
}

export function settleCardStatusAction(gate: CardStatusSubmitGate, requestId: number): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}

export function createCardStatusRequestIdentity(
  requestId: number,
  scopeKey: string,
  operation: CardStatusOperation,
  session: CardStatusSession,
  card: CardRecord,
  idempotencyKey: string,
  retry = false,
): CardStatusRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length < 1 || scopeKey.length > 2048)
    throw new Error("Invalid Card status request identity");
  return {
    requestId,
    scopeKey,
    operation,
    session,
    card,
    cardKey: cardVersionKey(card),
    idempotencyKey: validateCardStatusIdempotencyKey(idempotencyKey, operation),
    retry,
  };
}

export function cardStatusRequestIsCurrent(
  request: CardStatusRequestIdentity,
  currentRequestId: number,
  currentSession: CardStatusSession | null,
  runtimeEnvironment: CardStatusEnvironment,
  currentScopeKey: string | null,
  currentCard: CardRecord | null,
  now = Date.now(),
): boolean {
  if (
    request.requestId !== currentRequestId ||
    request.scopeKey !== currentScopeKey ||
    request.session !== currentSession ||
    currentCard === null ||
    request.card !== currentCard ||
    cardVersionKey(currentCard) !== request.cardKey ||
    cardStatusSessionScope(currentSession, runtimeEnvironment, now) !== request.scopeKey
  ) return false;
  const decision = cardStatusDecision(currentCard, currentSession, runtimeEnvironment, currentScopeKey, currentCard.id, now);
  return decision.allowed && decision.operation === request.operation;
}

function ownNumericStatus(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "status");
    return descriptor && "value" in descriptor && typeof descriptor.value === "number"
      ? descriptor.value
      : null;
  } catch {
    return null;
  }
}

export function cardStatusFailureIsAmbiguous(value: unknown): boolean {
  if (value instanceof TypeError) return true;
  const status = ownNumericStatus(value);
  return status === 0 || status === 408 || status === 409 || (status !== null && status >= 500 && status <= 599);
}

export function cardStatusFailureKind(value: unknown): CardStatusFailureKind {
  const status = ownNumericStatus(value);
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (value instanceof TypeError || status === 0 || status === 408 || (status !== null && status >= 500 && status <= 599))
    return "AMBIGUOUS";
  return "TERMINAL";
}

export function cardStatusFailureIsExplicit401(value: unknown): boolean {
  return ownNumericStatus(value) === 401;
}

export function cardStatusRetryKey(
  request: CardStatusRequestIdentity | null,
  currentSession: CardStatusSession | null,
  currentScopeKey: string | null,
  currentCard: CardRecord | null,
  currentOperation: CardStatusOperation | null,
): string | null {
  if (
    !request ||
    request.retry ||
    request.session !== currentSession ||
    request.scopeKey !== currentScopeKey ||
    request.card !== currentCard ||
    request.operation !== currentOperation
  ) return null;
  return request.idempotencyKey;
}

export function cardStatusConflictIsCurrent(
  request: CardStatusRequestIdentity | null,
  currentSession: CardStatusSession | null,
  currentScopeKey: string | null,
  currentCard: CardRecord | null,
  currentOperation: CardStatusOperation | null,
): boolean {
  return Boolean(
    request?.retry &&
      request.session === currentSession &&
      request.scopeKey === currentScopeKey &&
      request.card === currentCard &&
      request.operation === currentOperation,
  );
}

function parseCardStatusResponse(
  value: unknown,
  selected: CardRecord,
  operation: CardStatusOperation,
): CardRecord {
  const response = ordinaryObject(value, "response");
  const capabilitiesValue = ordinaryObject(ownData(response, "capabilities", "capabilities"), "capabilities");
  const capabilities = {
    freeze: ownData(capabilitiesValue, "freeze", "capability freeze"),
    unfreeze: ownData(capabilitiesValue, "unfreeze", "capability unfreeze"),
    replace: ownData(capabilitiesValue, "replace", "capability replace"),
    renew: ownData(capabilitiesValue, "renew", "capability renew"),
    updateLimits: ownData(capabilitiesValue, "updateLimits", "capability updateLimits"),
  };
  for (const [name, capability] of Object.entries(capabilities))
    if (typeof capability !== "boolean") throw new Error(`Invalid Card status capability ${name}`);
  const status = ownData(response, "status", "status");
  if (status !== (operation === "freeze" ? "FROZEN" : "ACTIVE"))
    throw new Error("Card status response did not complete the requested transition");
  const parsed: CardRecord = {
    id: opaqueId(ownData(response, "id", "Card ID")),
    type: ownData(response, "type", "type") as CardRecord["type"],
    status: status as CardRecord["status"],
    last4: nullableText(ownData(response, "last4", "last4"), "last4", 4),
    expiryMonth: nullableInteger(ownData(response, "expiryMonth", "expiryMonth"), "expiryMonth", 1, 12),
    expiryYear: nullableInteger(ownData(response, "expiryYear", "expiryYear"), "expiryYear", 2000, 9999),
    currency: ownData(response, "currency", "currency") as string,
    alias: nullableText(ownData(response, "alias", "alias"), "alias", 120),
    ...(() => {
      const balance = optionalSigned64(optionalOwnData(response, "availableBalanceMinor", "available balance"));
      return balance === undefined ? {} : { availableBalanceMinor: balance };
    })(),
    createdAt: strictRfc3339(ownData(response, "createdAt", "createdAt"), "createdAt"),
    capabilities: capabilities as CardRecord["capabilities"],
  };
  if (parsed.type !== "VIRTUAL" && parsed.type !== "PHYSICAL") throw new Error("Invalid Card status type");
  if (parsed.last4 !== null && !/^\d{4}$/.test(parsed.last4)) throw new Error("Invalid Card status last4");
  if (!/^[A-Z]{3}$/.test(parsed.currency)) throw new Error("Invalid Card status currency");
  if (
    parsed.id !== selected.id ||
    parsed.type !== selected.type ||
    parsed.last4 !== selected.last4 ||
    parsed.expiryMonth !== selected.expiryMonth ||
    parsed.expiryYear !== selected.expiryYear ||
    parsed.currency !== selected.currency ||
    parsed.alias !== selected.alias ||
    parsed.createdAt !== selected.createdAt ||
    Object.prototype.hasOwnProperty.call(parsed, "availableBalanceMinor") !== Object.prototype.hasOwnProperty.call(selected, "availableBalanceMinor") ||
    parsed.availableBalanceMinor !== selected.availableBalanceMinor
  ) throw new Error("Card status response does not match the selected Card");
  return parsed;
}

export async function submitCardStatusAction(
  transport: CardStatusTransport,
  session: CardStatusSession,
  runtimeEnvironment: CardStatusEnvironment,
  currentScopeKey: string | null,
  currentCardId: string | null,
  card: CardRecord,
  operation: CardStatusOperation,
  idempotencyKey: string,
  now = Date.now(),
  signal?: AbortSignal,
): Promise<CardRecord> {
  const decision = cardStatusDecision(card, session, runtimeEnvironment, currentScopeKey, currentCardId, now);
  if (!decision.allowed || decision.operation !== operation || decision.scopeKey === null)
    throw new Error(decision.reason ?? "Card status action unavailable");
  const response = await transport({
    path: `/v1/cards/${encodeURIComponent(opaqueId(card.id))}/${operation}`,
    method: "POST",
    idempotencyKey: validateCardStatusIdempotencyKey(idempotencyKey, operation),
    ...(signal ? { signal } : {}),
  });
  return parseCardStatusResponse(response, card, operation);
}
