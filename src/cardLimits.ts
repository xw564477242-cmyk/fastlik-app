export type CardLimitsRecord = {
  cardId: string;
  singleTransactionMinor: string | null;
  dailySpendMinor: string | null;
  monthlySpendMinor: string | null;
  dailyAtmMinor: string | null;
  updatedAt: string | null;
};

export type CardLimitsRequestIdentity = {
  requestId: number;
  scopeKey: string | null;
  cardId: string;
};

const MAX_SIGNED_64 = 2n ** 63n - 1n;
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function cardId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(value))
    throw new Error("Invalid card limits cardId");
  return value;
}

function nullableMinorAmount(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,18})$/.test(value))
    throw new Error(`Invalid card limits ${name}`);
  if (BigInt(value) > MAX_SIGNED_64) throw new Error(`Invalid card limits ${name}`);
  return value;
}

function nullableRfc3339(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("Invalid card limits updatedAt");
  const match = RFC3339.exec(value);
  if (!match) throw new Error("Invalid card limits updatedAt");
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
    throw new Error("Invalid card limits updatedAt");
  if (zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 14 || zoneMinute > 59 || (zoneHour === 14 && zoneMinute !== 0))
      throw new Error("Invalid card limits updatedAt");
  }
  return value;
}

export function parseCardLimits(value: unknown, expectedCardId: string): CardLimitsRecord {
  if (!isObject(value)) throw new Error("Invalid card limits record");
  const parsedCardId = cardId(value.cardId);
  if (parsedCardId !== cardId(expectedCardId))
    throw new Error("Card limits cardId does not match the selected card");
  return {
    cardId: parsedCardId,
    singleTransactionMinor: nullableMinorAmount(value.singleTransactionMinor, "singleTransactionMinor"),
    dailySpendMinor: nullableMinorAmount(value.dailySpendMinor, "dailySpendMinor"),
    monthlySpendMinor: nullableMinorAmount(value.monthlySpendMinor, "monthlySpendMinor"),
    dailyAtmMinor: nullableMinorAmount(value.dailyAtmMinor, "dailyAtmMinor"),
    updatedAt: nullableRfc3339(value.updatedAt),
  };
}

export function cardLimitsPath(selectedCardId: string): string {
  return `/v1/cards/${encodeURIComponent(cardId(selectedCardId))}/limits`;
}

export function cardLimitsRequestIsCurrent(
  request: CardLimitsRequestIdentity,
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
