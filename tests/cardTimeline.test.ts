import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TIMELINE_MAX_PAGES,
  CARD_TIMELINE_PAGE_SIZE,
  cardTimelinePath,
  cardTimelineRequestIsCurrent,
  commitCardTimelinePage,
  createCardTimelineRequestIdentity,
  parseCardTimelinePage,
  readCardTimelinePage,
} from "../src/cardTimeline.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";

const cursor = (value: number): string =>
  `${Buffer.from(JSON.stringify({ value })).toString("base64url")}.${Buffer.from(`signature-${value}`).toString("base64url")}`;

const event = (overrides: Record<string, unknown> = {}) => ({
  id: "timeline_event_01",
  type: "CREATED",
  fromStatus: null,
  toStatus: "PENDING",
  occurredAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const page = (overrides: Record<string, unknown> = {}) => ({
  events: [event()],
  nextCursor: null,
  ...overrides,
});

const session = (overrides: Record<string, unknown> = {}) => ({
  actorId: "actor-timeline",
  tenantId: "tenant-timeline",
  customerId: "customer-timeline",
  environment: "SANDBOX" as const,
  expiresAt: "2026-08-01T01:00:00.000Z",
  ...overrides,
});

test("accepts only the exact five-field public event and two-field page", () => {
  const parsed = parseCardTimelinePage(page());
  assert.deepEqual(Object.keys(parsed), ["events", "nextCursor"]);
  assert.deepEqual(Object.keys(parsed.events[0]), ["id", "type", "fromStatus", "toStatus", "occurredAt"]);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.events), true);
  assert.equal(Object.isFrozen(parsed.events[0]), true);
  assert.throws(() => parseCardTimelinePage({ ...page(), internalScope: "private" }), /exactly two/);
  assert.throws(() => parseCardTimelinePage({ ...page(), events: [{ ...event(), providerPayload: "private" }] }), /exactly five/);
});

test("never executes hostile accessors or accepts exotic prototypes", () => {
  let reads = 0;
  const hostile = event();
  Object.defineProperty(hostile, "providerSecret", { enumerable: true, get() { reads += 1; throw new Error("private"); } });
  assert.throws(() => parseCardTimelinePage(page({ events: [hostile] })), /exactly five/);
  assert.equal(reads, 0);
  assert.throws(() => parseCardTimelinePage(Object.create({ events: [], nextCursor: null })), /exactly two/);
});

test("enforces the closed public type/status enums and strict timestamps", () => {
  for (const [field, value] of [
    ["type", "PROVIDER_PRIVATE"],
    ["fromStatus", "SUSPENDED"],
    ["toStatus", "UNKNOWN"],
    ["occurredAt", "2026-08-01"],
  ] as const) assert.throws(() => parseCardTimelinePage(page({ events: [event({ [field]: value })] })));
});

test("requires bounded reverse-chronological unique pages", () => {
  assert.throws(() => parseCardTimelinePage(page({ events: Array.from({ length: CARD_TIMELINE_PAGE_SIZE + 1 }, (_, id) => event({ id: `event_${id + 10}` })) })), /limit/);
  assert.throws(() => parseCardTimelinePage(page({ events: [event(), event()] })), /Duplicate/);
  assert.throws(() => parseCardTimelinePage(page({ events: [event(), event({ id: "timeline_event_02", occurredAt: "2026-08-01T00:00:01.000Z" })] })), /reverse chronological/);
  assert.throws(() => parseCardTimelinePage(page({ events: [], nextCursor: cursor(1) })), /cannot continue/);
});

test("builds only the exact Backend GET path with a canonical signed opaque cursor", () => {
  assert.equal(cardTimelinePath("card_timeline"), "/v1/cards/card_timeline/timeline?limit=25");
  assert.equal(cardTimelinePath("card_timeline", cursor(1)), `/v1/cards/card_timeline/timeline?limit=25&cursor=${encodeURIComponent(cursor(1))}`);
  assert.throws(() => cardTimelinePath("card:wrong"));
  assert.throws(() => cardTimelinePath("card_timeline", "not-signed"));
  assert.throws(() => cardTimelinePath("card_timeline", "Zh.c2ln"), /cursor/);
});

test("rejects stale request identity and unsafe pagination transitions", () => {
  const firstRequest = createCardTimelineRequestIdentity(1, "scope-a", "card_timeline", null);
  assert.equal(cardTimelineRequestIsCurrent(firstRequest, 1, "scope-a", "card_timeline", null, true), true);
  assert.equal(cardTimelineRequestIsCurrent(firstRequest, 2, "scope-a", "card_timeline", null, true), false);
  assert.equal(cardTimelineRequestIsCurrent(firstRequest, 1, "scope-b", "card_timeline", null, true), false);
  assert.equal(cardTimelineRequestIsCurrent(firstRequest, 1, "scope-a", "card_other", null, true), false);
  assert.equal(cardTimelineRequestIsCurrent(firstRequest, 1, "scope-a", "card_timeline", null, false), false);

  const first = commitCardTimelinePage(null, firstRequest, page({ nextCursor: cursor(1) }));
  const nextRequest = createCardTimelineRequestIdentity(2, "scope-a", "card_timeline", cursor(1));
  assert.throws(() => commitCardTimelinePage(first, nextRequest, page({ nextCursor: cursor(2) })), /Duplicate/);
  assert.throws(() => commitCardTimelinePage(first, nextRequest, page({ events: [event({ id: "timeline_event_02", occurredAt: "2026-08-01T00:00:01.000Z" })] })), /reverse chronological/);
  assert.throws(() => commitCardTimelinePage(first, nextRequest, page({ events: [event({ id: "timeline_event_02" })], nextCursor: cursor(1) })), /Repeated/);
});

test("stops exposing continuation after the tenth bounded page", () => {
  let history = commitCardTimelinePage(
    null,
    createCardTimelineRequestIdentity(1, "scope-a", "card_timeline", null),
    page({ events: [event({ id: "timeline_event_01" })], nextCursor: cursor(1) }),
  );
  for (let pageIndex = 2; pageIndex <= CARD_TIMELINE_MAX_PAGES; pageIndex += 1) {
    history = commitCardTimelinePage(
      history,
      createCardTimelineRequestIdentity(pageIndex, "scope-a", "card_timeline", cursor(pageIndex - 1)),
      page({
        events: [event({ id: `timeline_event_${String(pageIndex).padStart(2, "0")}`, occurredAt: `2026-07-${String(32 - pageIndex).padStart(2, "0")}T00:00:00.000Z` })],
        nextCursor: cursor(pageIndex),
      }),
    );
  }
  assert.equal(history.pageCount, CARD_TIMELINE_MAX_PAGES);
  assert.equal(history.nextCursor, null);
  assert.equal(history.events.length, CARD_TIMELINE_MAX_PAGES);
});

test("binds transport to an unexpired matching session before and after one GET", async () => {
  const active = session();
  const scope = walletTransferSessionScope(active, "SANDBOX", Date.parse("2026-08-01T00:00:00.000Z"))!;
  const controller = new AbortController();
  let calls = 0;
  const result = await readCardTimelinePage(async request => {
    calls += 1;
    assert.deepEqual({ path: request.path, method: request.method, signal: request.signal }, {
      path: "/v1/cards/card_timeline/timeline?limit=25",
      method: "GET",
      signal: controller.signal,
    });
    return page();
  }, active, "SANDBOX", scope, "card_timeline", null, controller.signal, () => Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(calls, 1);
  assert.equal(result.events.length, 1);

  await assert.rejects(() => readCardTimelinePage(async () => { calls += 1; return page(); }, active, "TEST", scope, "card_timeline", null, controller.signal));
  assert.equal(calls, 1, "environment mismatch must fail before transport");
});
