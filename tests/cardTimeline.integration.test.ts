import assert from "node:assert/strict";
import test from "node:test";
import {
  cardTimelineFailureCanInvalidateSession,
  cardTimelineFailureClearsSnapshot,
  cardTimelineRequestWasAborted,
  readCardTimelinePage,
  type CardTimelineHistory,
} from "../src/cardTimeline.ts";
import {
  cardTimelineRefreshRequestIsCurrent,
  commitCardTimelineRefreshPage,
  createCardTimelineRefreshRequestIdentity,
} from "../src/cardTimelineRefresh.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";

const environment = process.env.FASTLINK_TEST_ENVIRONMENT;
const mountedTest = environment === "SANDBOX" || environment === "TEST" ? test : test.skip;
const runtime = environment as "SANDBOX" | "TEST";
const baseNow = Date.parse("2026-08-01T00:00:00.000Z");
const session = { actorId: "actor", tenantId: "tenant", customerId: "customer", environment: runtime, expiresAt: "2026-08-01T01:00:00.000Z" };
const scope = () => walletTransferSessionScope(session, runtime, baseNow)!;
const page = (id = "timeline_event_01") => ({ events: [{ id, type: "CREATED", fromStatus: null, toStatus: "PENDING", occurredAt: "2026-08-01T00:00:00.000Z" }], nextCursor: null });

mountedTest(`manual timeline refresh keeps the verified page then replaces it atomically (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const originalRequest = createCardTimelineRefreshRequestIdentity(1, scope(), "card_timeline", 1, null);
  let displayed: CardTimelineHistory = commitCardTimelineRefreshPage(originalRequest, page("timeline_event_old"));
  const snapshot = displayed;
  const request = createCardTimelineRefreshRequestIdentity(2, scope(), "card_timeline", 1, snapshot);
  assert.equal(displayed, snapshot, "verified history remains visible while the GET is pending");
  const next = commitCardTimelineRefreshPage(request, page("timeline_event_new"));
  displayed = next;
  assert.equal(displayed.events[0].id, "timeline_event_new");
  assert.equal(displayed.events.some(event => event.id === "timeline_event_old"), false);
});

mountedTest(`Card, actor scope, logout and unmount changes make stale timeline completions write zero (${environment ?? "ENVIRONMENT_REQUIRED"})`, () => {
  const snapshot = commitCardTimelineRefreshPage(createCardTimelineRefreshRequestIdentity(1, scope(), "card_timeline", 1, null), page());
  const request = createCardTimelineRefreshRequestIdentity(2, scope(), "card_timeline", 1, snapshot);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, scope(), "card_timeline", 1, snapshot, true), true);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "changed-scope", "card_timeline", 1, snapshot, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, scope(), "card_other", 1, snapshot, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 3, scope(), "card_timeline", 1, snapshot, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, scope(), "card_timeline", 1, snapshot, false), false);
});

mountedTest(`natural session expiry makes late timeline success, error and finally write zero (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const controller = new AbortController();
  let clock = baseNow;
  const promise = readCardTimelinePage(async () => {
    clock = Date.parse(session.expiresAt) + 1;
    return page();
  }, session, runtime, scope(), "card_timeline", null, controller.signal, () => clock);
  await assert.rejects(promise, /expired/);
  assert.equal(cardTimelineRequestWasAborted(new DOMException("cancelled", "AbortError")), true);
});

mountedTest(`matching 401 invalidates once while stale 401 and current 403/404 only affect the timeline (${environment ?? "ENVIRONMENT_REQUIRED"})`, () => {
  const signal = new AbortController().signal;
  const snapshot = commitCardTimelineRefreshPage(createCardTimelineRefreshRequestIdentity(1, scope(), "card_timeline", 1, null), page());
  const request = createCardTimelineRefreshRequestIdentity(2, scope(), "card_timeline", 1, snapshot);
  const matching = cardTimelineRefreshRequestIsCurrent(request, 2, scope(), "card_timeline", 1, snapshot, true);
  const rotated = cardTimelineRefreshRequestIsCurrent(request, 3, scope(), "card_timeline", 1, snapshot, true);

  assert.equal(cardTimelineFailureCanInvalidateSession({ status: 401 }, matching, signal), true);
  assert.equal(cardTimelineFailureCanInvalidateSession({ status: 401 }, rotated, signal), false);
  assert.equal(cardTimelineFailureCanInvalidateSession({ status: 403 }, matching, signal), false);
  assert.equal(cardTimelineFailureCanInvalidateSession({ status: 404 }, matching, signal), false);
  assert.equal(cardTimelineFailureClearsSnapshot({ status: 403 }, matching, signal), true);
  assert.equal(cardTimelineFailureClearsSnapshot({ status: 404 }, matching, signal), true);
});
