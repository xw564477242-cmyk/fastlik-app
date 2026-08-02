import {
  commitCardTimelinePage,
  createCardTimelineRequestIdentity,
  type CardTimelineHistory,
  type CardTimelineRequestIdentity,
} from "./cardTimeline.ts";

export const CARD_TIMELINE_REFRESH_MAX_ATTEMPTS = 3;

export type CardTimelineRefreshRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  cardId: string;
  attempt: number;
  snapshot: CardTimelineHistory | null;
  pageRequest: CardTimelineRequestIdentity;
}>;

export function cardTimelineRefreshAllowed(
  sessionEnvironment: string,
  runtimeEnvironment: string,
  scopeKey: string | null,
  currentScopeKey: string | null,
  cardId: string | null,
  currentCardId: string | null,
  history: CardTimelineHistory | null,
): boolean {
  return Boolean(
    (sessionEnvironment === "SANDBOX" || sessionEnvironment === "TEST") &&
      runtimeEnvironment === sessionEnvironment &&
      scopeKey !== null &&
      scopeKey === currentScopeKey &&
      cardId !== null &&
      cardId === currentCardId &&
      (!history || (history.scopeKey === scopeKey && history.cardId === cardId)),
  );
}

export function createCardTimelineRefreshRequestIdentity(
  requestId: number,
  scopeKey: string,
  cardId: string,
  attempt: number,
  snapshot: CardTimelineHistory | null,
): CardTimelineRefreshRequestIdentity {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > CARD_TIMELINE_REFRESH_MAX_ATTEMPTS)
    throw new Error("Invalid Card timeline refresh attempt");
  if (snapshot && (snapshot.scopeKey !== scopeKey || snapshot.cardId !== cardId))
    throw new Error("Card timeline refresh snapshot does not match the request");
  return Object.freeze({
    requestId,
    scopeKey,
    cardId,
    attempt,
    snapshot,
    pageRequest: createCardTimelineRequestIdentity(requestId, scopeKey, cardId, null),
  });
}

export function cardTimelineRefreshRequestIsCurrent(
  request: CardTimelineRefreshRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentCardId: string | null,
  currentAttempt: number,
  currentHistory: CardTimelineHistory | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey &&
      request.cardId === currentCardId &&
      request.attempt === currentAttempt &&
      request.snapshot === currentHistory,
  );
}

export function commitCardTimelineRefreshPage(
  request: CardTimelineRefreshRequestIdentity,
  rawPage: unknown,
): CardTimelineHistory {
  return commitCardTimelinePage(null, request.pageRequest, rawPage);
}
