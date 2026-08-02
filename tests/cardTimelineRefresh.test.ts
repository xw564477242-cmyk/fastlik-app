import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_TIMELINE_REFRESH_MAX_ATTEMPTS,
  cardTimelineRefreshAllowed,
  cardTimelineRefreshRequestIsCurrent,
  commitCardTimelineRefreshPage,
  createCardTimelineRefreshRequestIdentity,
} from "../src/cardTimelineRefresh.ts";

const rawPage = { events: [], nextCursor: null };
const initial = () => commitCardTimelineRefreshPage(
  createCardTimelineRefreshRequestIdentity(1, "scope-a", "card_timeline", 1, null),
  rawPage,
);

test("permits only matching SANDBOX/TEST scope, runtime, Card and snapshot", () => {
  const history = initial();
  assert.equal(cardTimelineRefreshAllowed("SANDBOX", "SANDBOX", "scope-a", "scope-a", "card_timeline", "card_timeline", history), true);
  assert.equal(cardTimelineRefreshAllowed("TEST", "TEST", "scope-a", "scope-a", "card_timeline", "card_timeline", history), true);
  assert.equal(cardTimelineRefreshAllowed("PRODUCTION", "PRODUCTION", "scope-a", "scope-a", "card_timeline", "card_timeline", history), false);
  assert.equal(cardTimelineRefreshAllowed("SANDBOX", "TEST", "scope-a", "scope-a", "card_timeline", "card_timeline", history), false);
  assert.equal(cardTimelineRefreshAllowed("SANDBOX", "SANDBOX", "scope-b", "scope-a", "card_timeline", "card_timeline", history), false);
  assert.equal(cardTimelineRefreshAllowed("SANDBOX", "SANDBOX", "scope-a", "scope-a", "card_other", "card_timeline", history), false);
});

test("binds manual refresh to generation, retained snapshot and mounted state", () => {
  const history = initial();
  const request = createCardTimelineRefreshRequestIdentity(2, "scope-a", "card_timeline", 1, history);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "scope-a", "card_timeline", 1, history, true), true);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 3, "scope-a", "card_timeline", 1, history, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "scope-b", "card_timeline", 1, history, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "scope-a", "card_other", 1, history, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "scope-a", "card_timeline", 2, history, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "scope-a", "card_timeline", 1, null, true), false);
  assert.equal(cardTimelineRefreshRequestIsCurrent(request, 2, "scope-a", "card_timeline", 1, history, false), false);
});

test("allows at most three explicit attempts and never an automatic attempt zero", () => {
  const history = initial();
  assert.equal(CARD_TIMELINE_REFRESH_MAX_ATTEMPTS, 3);
  assert.throws(() => createCardTimelineRefreshRequestIdentity(2, "scope-a", "card_timeline", 0, history), /attempt/);
  assert.throws(() => createCardTimelineRefreshRequestIdentity(2, "scope-a", "card_timeline", 4, history), /attempt/);
  assert.throws(() => createCardTimelineRefreshRequestIdentity(2, "scope-b", "card_timeline", 1, history), /snapshot/);
});
