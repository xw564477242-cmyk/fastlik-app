import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const CARD_TIMELINE_PAGE_SIZE = 25;
export const CARD_TIMELINE_MAX_PAGES = 10;
export const CARD_TIMELINE_MAX_EVENTS = CARD_TIMELINE_PAGE_SIZE * CARD_TIMELINE_MAX_PAGES;
export const CARD_TIMELINE_CURSOR_MAX_BYTES = 2_048;

export const CARD_TIMELINE_TYPES = [
  "CREATED",
  "ACTIVATED",
  "FROZEN",
  "UNFROZEN",
  "REPLACED",
  "RENEWED",
  "LIMITS_UPDATED",
  "PIN_UPDATED",
  "VIEWED",
  "STATUS_CHANGED",
  "UPDATED",
] as const;

export const CARD_TIMELINE_STATUSES = ["PENDING", "ACTIVE", "FROZEN", "CLOSED", "FAILED"] as const;

export type CardTimelineType = (typeof CARD_TIMELINE_TYPES)[number];
export type CardTimelineStatus = (typeof CARD_TIMELINE_STATUSES)[number];

export type CardTimelineEvent = Readonly<{
  id: string;
  type: CardTimelineType;
  fromStatus: CardTimelineStatus | null;
  toStatus: CardTimelineStatus | null;
  occurredAt: string;
}>;

export type CardTimelinePage = Readonly<{
  events: readonly CardTimelineEvent[];
  nextCursor: string | null;
}>;

export type CardTimelineHistory = Readonly<{
  scopeKey: string;
  cardId: string;
  events: readonly CardTimelineEvent[];
  nextCursor: string | null;
  seenCursors: readonly string[];
  pageCount: number;
}>;

export type CardTimelineRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cardId: string;
  cursor: string | null;
}>;

export type CardTimelineTransportRequest = Readonly<{
  path: string;
  method: "GET";
  signal: AbortSignal;
}>;

export type CardTimelineTransport = (request: CardTimelineTransportRequest) => Promise<unknown>;

type OwnData = Readonly<Record<string, PropertyDescriptor>>;
const EVENT_FIELDS = ["id", "type", "fromStatus", "toStatus", "occurredAt"] as const;
const PAGE_FIELDS = ["events", "nextCursor"] as const;
const CARD_ID = /^[A-Za-z0-9_-]{2,128}$/;

function ownExact(value: unknown, fields: readonly string[], message: string): OwnData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(message);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== "string" || !fields.includes(key))
  ) throw new Error(message);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (fields.some((field) => !descriptors[field] || !("value" in descriptors[field]))) throw new Error(message);
  return descriptors;
}

const ownValue = (source: OwnData, key: string): unknown => source[key]?.value;

function identifier(value: unknown): string {
  if (typeof value !== "string" || !CARD_ID.test(value)) throw new Error("Invalid Card timeline event id");
  return value;
}

function timelineType(value: unknown): CardTimelineType {
  if (typeof value !== "string" || !(CARD_TIMELINE_TYPES as readonly string[]).includes(value))
    throw new Error("Invalid Card timeline event type");
  return value as CardTimelineType;
}

function timelineStatus(value: unknown, field: string): CardTimelineStatus | null {
  if (value === null) return null;
  if (typeof value !== "string" || !(CARD_TIMELINE_STATUSES as readonly string[]).includes(value))
    throw new Error(`Invalid Card timeline ${field}`);
  return value as CardTimelineStatus;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || value.length > 32) throw new Error("Invalid Card timeline occurredAt");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value)
    throw new Error("Invalid Card timeline occurredAt");
  return value;
}

function signedCursor(value: unknown): string {
  if (
    typeof value !== "string" ||
    new TextEncoder().encode(value).byteLength > CARD_TIMELINE_CURSOR_MAX_BYTES ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
  ) throw new Error("Invalid Card timeline cursor");
  for (const part of value.split(".")) {
    const bytes = Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")), character => character.charCodeAt(0));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const canonical = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (canonical !== part) throw new Error("Invalid Card timeline cursor");
  }
  return value;
}

export function parseCardTimelineEvent(value: unknown): CardTimelineEvent {
  const source = ownExact(value, EVENT_FIELDS, "Card timeline event must contain exactly five public fields");
  return Object.freeze({
    id: identifier(ownValue(source, "id")),
    type: timelineType(ownValue(source, "type")),
    fromStatus: timelineStatus(ownValue(source, "fromStatus"), "fromStatus"),
    toStatus: timelineStatus(ownValue(source, "toStatus"), "toStatus"),
    occurredAt: timestamp(ownValue(source, "occurredAt")),
  });
}

export function parseCardTimelinePage(value: unknown): CardTimelinePage {
  const source = ownExact(value, PAGE_FIELDS, "Card timeline page must contain exactly two public fields");
  const rawEvents = ownValue(source, "events");
  if (!Array.isArray(rawEvents) || rawEvents.length > CARD_TIMELINE_PAGE_SIZE)
    throw new Error("Card timeline page exceeds the consumer limit");
  const events = rawEvents.map(parseCardTimelineEvent);
  if (new Set(events.map((event) => event.id)).size !== events.length)
    throw new Error("Duplicate Card timeline event ids");
  for (let index = 1; index < events.length; index += 1) {
    if (events[index - 1].occurredAt < events[index].occurredAt)
      throw new Error("Card timeline page is not reverse chronological");
  }
  const rawCursor = ownValue(source, "nextCursor");
  const nextCursor = rawCursor === null ? null : signedCursor(rawCursor);
  if (events.length === 0 && nextCursor !== null)
    throw new Error("Empty Card timeline page cannot continue");
  return Object.freeze({ events: Object.freeze(events), nextCursor });
}

export function cardTimelinePath(cardId: string, cursor: string | null = null): string {
  if (!CARD_ID.test(cardId)) throw new Error("Invalid Card timeline Card ID");
  const params = new URLSearchParams({ limit: String(CARD_TIMELINE_PAGE_SIZE) });
  if (cursor !== null) params.set("cursor", signedCursor(cursor));
  return `/v1/cards/${encodeURIComponent(cardId)}/timeline?${params.toString()}`;
}

export function createCardTimelineRequestIdentity(
  requestId: number,
  scopeKey: string,
  cardId: string,
  cursor: string | null,
): CardTimelineRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1) throw new Error("Invalid Card timeline request");
  if (scopeKey.length === 0 || scopeKey.length > 4096) throw new Error("Invalid Card timeline scope");
  cardTimelinePath(cardId, cursor);
  return Object.freeze({ requestId, scopeKey, cardId, cursor });
}

export function cardTimelineRequestIsCurrent(
  request: CardTimelineRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
  currentCursor: string | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cardId === currentCardId &&
      request.cursor === currentCursor,
  );
}

export function commitCardTimelinePage(
  current: CardTimelineHistory | null,
  request: CardTimelineRequestIdentity,
  rawPage: unknown,
): CardTimelineHistory {
  const page = parseCardTimelinePage(rawPage);
  if (request.cursor === null) {
    return Object.freeze({
      scopeKey: request.scopeKey,
      cardId: request.cardId,
      events: page.events,
      nextCursor: page.nextCursor,
      seenCursors: Object.freeze(page.nextCursor === null ? [] : [page.nextCursor]),
      pageCount: 1,
    });
  }
  if (
    !current ||
    current.scopeKey !== request.scopeKey ||
    current.cardId !== request.cardId ||
    current.nextCursor !== request.cursor ||
    current.pageCount >= CARD_TIMELINE_MAX_PAGES
  ) throw new Error("Stale or exhausted Card timeline page");
  const currentIds = new Set(current.events.map((event) => event.id));
  if (page.events.some((event) => currentIds.has(event.id))) throw new Error("Duplicate Card timeline history page");
  const last = current.events.at(-1);
  const first = page.events[0];
  if (last && first && last.occurredAt < first.occurredAt)
    throw new Error("Card timeline continuation is not reverse chronological");
  if (page.nextCursor !== null && (page.nextCursor === request.cursor || current.seenCursors.includes(page.nextCursor)))
    throw new Error("Repeated Card timeline cursor");
  const events = Object.freeze([...current.events, ...page.events]);
  if (events.length > CARD_TIMELINE_MAX_EVENTS) throw new Error("Card timeline history exceeds the consumer limit");
  const pageCount = current.pageCount + 1;
  return Object.freeze({
    ...current,
    events,
    nextCursor: pageCount >= CARD_TIMELINE_MAX_PAGES ? null : page.nextCursor,
    seenCursors: Object.freeze(page.nextCursor === null ? [...current.seenCursors] : [...current.seenCursors, page.nextCursor]),
    pageCount,
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Card timeline request cancelled", "AbortError");
}

export function cardTimelineRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function cardTimelineFailureStatus(value: unknown, visited = new Set<object>()): number | null {
  if (!value || typeof value !== "object" || visited.has(value)) return null;
  visited.add(value);
  try {
    const status = Object.getOwnPropertyDescriptor(value, "status");
    if (status && "value" in status && typeof status.value === "number") return status.value;
    const cause = Object.getOwnPropertyDescriptor(value, "cause");
    return cause && "value" in cause
      ? cardTimelineFailureStatus(cause.value, visited)
      : null;
  } catch {
    return null;
  }
}

export function cardTimelineFailureClearsSnapshot(
  value: unknown,
  isCurrent: boolean,
  signal: AbortSignal,
): boolean {
  if (!isCurrent || signal.aborted) return false;
  const status = cardTimelineFailureStatus(value);
  return status === 401 || status === 403 || status === 404;
}

export function cardTimelineFailureCanInvalidateSession(
  value: unknown,
  isCurrent: boolean,
  signal: AbortSignal,
): boolean {
  return isCurrent && !signal.aborted && cardTimelineFailureStatus(value) === 401;
}

export async function readCardTimelinePage(
  transport: CardTimelineTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  cardId: string,
  cursor: string | null,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<CardTimelinePage> {
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Card timeline is unavailable for this session");
  throwIfAborted(signal);
  const raw = await transport({ path: cardTimelinePath(cardId, cursor), method: "GET", signal });
  throwIfAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new Error("Card timeline session expired");
  return parseCardTimelinePage(raw);
}
