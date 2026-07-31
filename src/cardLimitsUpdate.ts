import type { CardLimitsRecord } from "./cardLimits.ts";
import { cardLimitsPath, parseCardLimits } from "./cardLimits.ts";
import type { CardRecord } from "./cardList.ts";

export type CardLimitsUpdateEnvironment = "LOCAL" | "SANDBOX" | "TEST" | "UAT" | "PRODUCTION";

export const CARD_LIMIT_UPDATE_MAX_MINOR = 9_000_000_000_000;
export const CARD_LIMIT_UPDATE_FIELDS = [
  "singleTransactionMinor",
  "dailySpendMinor",
  "monthlySpendMinor",
  "dailyAtmMinor",
] as const;

export type CardLimitUpdateField = (typeof CARD_LIMIT_UPDATE_FIELDS)[number];
export type CardLimitsUpdateInput = Partial<Record<CardLimitUpdateField, number>>;
export type CardLimitsUpdateDraft = Record<CardLimitUpdateField, string>;

export type CardLimitsUpdateTransportRequest = Readonly<{
  path: string;
  method: "POST";
  body: CardLimitsUpdateInput;
  idempotencyKey: string;
}>;

export type CardLimitsUpdateTransport = (
  request: CardLimitsUpdateTransportRequest,
) => Promise<unknown>;

export type CardLimitsUpdateSubmitGate = { activeRequestId: number | null };

export type CardLimitsUpdateRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  sessionEnvironment: "SANDBOX" | "TEST";
  cardKey: string;
  limitsKey: string;
  inputKey: string;
  idempotencyKey: string;
}>;

export type CardLimitsUpdateDecision = Readonly<{
  allowed: boolean;
  reason: string | null;
}>;

const ordinaryObject = (value: unknown, name: string): object => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error(`Invalid Card limits update ${name}`);
  return value;
};

function cardKey(card: CardRecord): string {
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

function limitsKey(limits: CardLimitsRecord): string {
  return JSON.stringify([
    limits.cardId,
    limits.singleTransactionMinor,
    limits.dailySpendMinor,
    limits.monthlySpendMinor,
    limits.dailyAtmMinor,
    limits.updatedAt,
  ]);
}

function inputKey(input: CardLimitsUpdateInput): string {
  return JSON.stringify(CARD_LIMIT_UPDATE_FIELDS.map(field => input[field] ?? null));
}

export function cardLimitsUpdateDraft(limits: CardLimitsRecord): CardLimitsUpdateDraft {
  return {
    singleTransactionMinor: limits.singleTransactionMinor ?? "",
    dailySpendMinor: limits.dailySpendMinor ?? "",
    monthlySpendMinor: limits.monthlySpendMinor ?? "",
    dailyAtmMinor: limits.dailyAtmMinor ?? "",
  };
}

export function normalizeCardLimitsUpdateInput(
  value: unknown,
  current: CardLimitsRecord,
): CardLimitsUpdateInput {
  const input = ordinaryObject(value, "input");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const allowed = new Set<string>(CARD_LIMIT_UPDATE_FIELDS);
  if (Object.keys(descriptors).some(field => !allowed.has(field)))
    throw new Error("Invalid Card limits update field");
  const normalized: CardLimitsUpdateInput = {};
  for (const field of CARD_LIMIT_UPDATE_FIELDS) {
    const descriptor = descriptors[field];
    if (!descriptor) continue;
    if (
      !("value" in descriptor) ||
      typeof descriptor.value !== "number" ||
      !Number.isSafeInteger(descriptor.value) ||
      descriptor.value < 0 ||
      descriptor.value > CARD_LIMIT_UPDATE_MAX_MINOR
    )
      throw new Error(`Invalid Card limits update ${field}`);
    normalized[field] = descriptor.value;
  }
  if (Object.keys(normalized).length === 0)
    throw new Error("At least one Card limit is required");

  const merged = Object.fromEntries(CARD_LIMIT_UPDATE_FIELDS.map(field => [
    field,
    normalized[field] === undefined ? current[field] : String(normalized[field]),
  ])) as Record<CardLimitUpdateField, string | null>;
  if (
    merged.singleTransactionMinor !== null &&
    merged.dailySpendMinor !== null &&
    BigInt(merged.singleTransactionMinor) > BigInt(merged.dailySpendMinor)
  )
    throw new Error("Single transaction limit cannot exceed daily spend limit");
  if (
    merged.dailySpendMinor !== null &&
    merged.monthlySpendMinor !== null &&
    BigInt(merged.dailySpendMinor) > BigInt(merged.monthlySpendMinor)
  )
    throw new Error("Daily spend limit cannot exceed monthly spend limit");
  return normalized;
}

export function cardLimitsUpdateInputFromDraft(
  draft: CardLimitsUpdateDraft,
  current: CardLimitsRecord,
): CardLimitsUpdateInput {
  const input = Object.fromEntries(CARD_LIMIT_UPDATE_FIELDS.filter(field => draft[field] !== "").map(field => {
    const value = draft[field];
    return [field, /^(?:0|[1-9][0-9]*)$/.test(value) ? Number(value) : value];
  }));
  return normalizeCardLimitsUpdateInput(input, current);
}

export function validateCardLimitsUpdateIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    throw new Error("Invalid Card limits update idempotency key");
  return value;
}

export function cardLimitsUpdateDecision(
  card: CardRecord,
  current: CardLimitsRecord | null,
  sessionEnvironment: CardLimitsUpdateEnvironment | null,
  runtimeEnvironment: CardLimitsUpdateEnvironment,
  expectedScopeKey: string | null,
  currentScopeKey: string | null,
  currentCardId: string | null,
): CardLimitsUpdateDecision {
  if (sessionEnvironment === null || sessionEnvironment !== runtimeEnvironment)
    return { allowed: false, reason: "Card limits update requires a matching session and runtime environment." };
  if (sessionEnvironment !== "SANDBOX" && sessionEnvironment !== "TEST")
    return { allowed: false, reason: "Card limits update is available only in SANDBOX or TEST." };
  if (
    expectedScopeKey === null ||
    expectedScopeKey !== currentScopeKey ||
    card.id !== currentCardId ||
    current === null ||
    current.cardId !== card.id
  )
    return { allowed: false, reason: "Card limits scope, selection or current limits changed." };
  if (!["PENDING", "ACTIVE", "FROZEN"].includes(card.status) || !card.capabilities.updateLimits)
    return { allowed: false, reason: "Card limits update is not permitted by the current Card." };
  return { allowed: true, reason: null };
}

export function beginCardLimitsUpdate(
  gate: CardLimitsUpdateSubmitGate,
  requestId: number,
): boolean {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || gate.activeRequestId !== null)
    return false;
  gate.activeRequestId = requestId;
  return true;
}

export function settleCardLimitsUpdate(
  gate: CardLimitsUpdateSubmitGate,
  requestId: number,
): boolean {
  if (gate.activeRequestId !== requestId) return false;
  gate.activeRequestId = null;
  return true;
}

export function createCardLimitsUpdateRequestIdentity(
  requestId: number,
  scopeKey: string,
  sessionEnvironment: "SANDBOX" | "TEST",
  card: CardRecord,
  current: CardLimitsRecord,
  input: CardLimitsUpdateInput,
  idempotencyKey: string,
): CardLimitsUpdateRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length < 1 || scopeKey.length > 1024)
    throw new Error("Invalid Card limits update request identity");
  const normalized = normalizeCardLimitsUpdateInput(input, current);
  return {
    requestId,
    scopeKey,
    sessionEnvironment,
    cardKey: cardKey(card),
    limitsKey: limitsKey(current),
    inputKey: inputKey(normalized),
    idempotencyKey: validateCardLimitsUpdateIdempotencyKey(idempotencyKey),
  };
}

export function cardLimitsUpdateRequestIsCurrent(
  request: CardLimitsUpdateRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentSessionEnvironment: CardLimitsUpdateEnvironment | null,
  runtimeEnvironment: CardLimitsUpdateEnvironment,
  currentCard: CardRecord | null,
  currentLimits: CardLimitsRecord | null,
  currentInput: unknown,
): boolean {
  if (
    request.requestId !== currentRequestId ||
    request.scopeKey !== currentScopeKey ||
    request.sessionEnvironment !== currentSessionEnvironment ||
    request.sessionEnvironment !== runtimeEnvironment ||
    currentCard === null ||
    currentLimits === null ||
    cardKey(currentCard) !== request.cardKey ||
    limitsKey(currentLimits) !== request.limitsKey
  ) return false;
  try {
    return inputKey(normalizeCardLimitsUpdateInput(currentInput, currentLimits)) === request.inputKey;
  } catch {
    return false;
  }
}

export function parseCardLimitsUpdateResponse(
  value: unknown,
  card: CardRecord,
  current: CardLimitsRecord,
  input: CardLimitsUpdateInput,
): CardLimitsRecord {
  const normalized = normalizeCardLimitsUpdateInput(input, current);
  const result = parseCardLimits(value, card.id);
  for (const field of CARD_LIMIT_UPDATE_FIELDS) {
    const expected = normalized[field] === undefined ? current[field] : String(normalized[field]);
    if (result[field] !== expected) throw new Error("Card limits update returned unexpected values");
  }
  if (result.updatedAt === null) throw new Error("Card limits update timestamp is required");
  return result;
}

export async function submitCardLimitsUpdate(
  transport: CardLimitsUpdateTransport,
  card: CardRecord,
  current: CardLimitsRecord,
  input: unknown,
  idempotencyKey: string,
  sessionEnvironment: CardLimitsUpdateEnvironment,
  runtimeEnvironment: CardLimitsUpdateEnvironment,
  expectedScopeKey: string,
  currentScopeKey: string | null,
  currentCardId: string | null,
): Promise<CardLimitsRecord> {
  const decision = cardLimitsUpdateDecision(
    card,
    current,
    sessionEnvironment,
    runtimeEnvironment,
    expectedScopeKey,
    currentScopeKey,
    currentCardId,
  );
  if (!decision.allowed) throw new Error(decision.reason ?? "Card limits update unavailable");
  const normalized = normalizeCardLimitsUpdateInput(input, current);
  const response = await transport({
    path: cardLimitsPath(card.id),
    method: "POST",
    body: normalized,
    idempotencyKey: validateCardLimitsUpdateIdempotencyKey(idempotencyKey),
  });
  return parseCardLimitsUpdateResponse(response, card, current, normalized);
}
