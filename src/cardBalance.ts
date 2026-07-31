export type CardBalanceRecord = {
  cardId: string;
  currency: string;
  availableBalanceMinor: string;
  currentBalanceMinor: string;
  pendingAmountMinor: string;
  updatedAt: string;
};

export type CardBalanceRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  cardId: string;
};

const MIN_SIGNED_64 = -(2n ** 63n);
const MAX_SIGNED_64 = 2n ** 63n - 1n;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function cardId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid card balance cardId");
  return value;
}

function currency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw new Error("Invalid card balance currency");
  return value;
}

function minorAmount(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^(?:0|-?[1-9][0-9]{0,18})$/.test(value))
    throw new Error(`Invalid card balance ${name}`);
  const amount = BigInt(value);
  if (amount < MIN_SIGNED_64 || amount > MAX_SIGNED_64)
    throw new Error(`Invalid card balance ${name}`);
  return value;
}

function rfc3339(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid card balance updatedAt");
  const match = RFC3339.exec(value);
  if (!match) throw new Error("Invalid card balance updatedAt");
  const [, year, month, day, hour, minute, second, zone] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const daysInMonth = new Date(Date.UTC(Number(year), monthNumber, 0)).getUTCDate();
  if (
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > daysInMonth ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    throw new Error("Invalid card balance updatedAt");
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0))
      throw new Error("Invalid card balance updatedAt");
  }
  return value;
}

export function parseCardBalance(value: unknown, expectedCardId: string): CardBalanceRecord {
  if (!isObject(value)) throw new Error("Invalid card balance record");
  const parsedCardId = cardId(value.cardId);
  if (parsedCardId !== cardId(expectedCardId))
    throw new Error("Card balance cardId does not match the selected card");
  return {
    cardId: parsedCardId,
    currency: currency(value.currency),
    availableBalanceMinor: minorAmount(value.availableBalanceMinor, "availableBalanceMinor"),
    currentBalanceMinor: minorAmount(value.currentBalanceMinor, "currentBalanceMinor"),
    pendingAmountMinor: minorAmount(value.pendingAmountMinor, "pendingAmountMinor"),
    updatedAt: rfc3339(value.updatedAt),
  };
}

export function cardBalancePath(selectedCardId: string): string {
  return `/v1/cards/${encodeURIComponent(cardId(selectedCardId))}/balance`;
}

export function cardBalanceRequestIsCurrent(
  request: CardBalanceRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
): boolean {
  return (
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.cardId === currentCardId
  );
}
