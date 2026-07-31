import assert from "node:assert/strict";
import test from "node:test";
import {
  cardLimitsPath,
  cardLimitsRequestIsCurrent,
  parseCardLimits,
} from "../src/cardLimits.ts";

const rawLimits = (): Record<string, unknown> => ({
  cardId: "card-1",
  singleTransactionMinor: "10000",
  dailySpendMinor: "50000",
  monthlySpendMinor: "500000",
  dailyAtmMinor: "20000",
  updatedAt: "2026-07-31T01:02:03.000Z",
  tenantId: "tenant-private",
  customerId: "customer-private",
  environment: "TEST",
  providerOperationRef: "provider-private",
  updatedBy: "actor-private",
  version: 7,
});

test("reconstructs Card limits from the six-field public allowlist only", () => {
  const limits = parseCardLimits(rawLimits(), "card-1");

  assert.deepEqual(Object.keys(limits).sort(), [
    "cardId",
    "dailyAtmMinor",
    "dailySpendMinor",
    "monthlySpendMinor",
    "singleTransactionMinor",
    "updatedAt",
  ]);
  for (const forbidden of [
    "tenantId",
    "customerId",
    "environment",
    "providerOperationRef",
    "updatedBy",
    "version",
  ])
    assert.equal(forbidden in limits, false);
});

test("accepts the all-null public limits state", () => {
  assert.deepEqual(
    parseCardLimits({
      ...rawLimits(),
      singleTransactionMinor: null,
      dailySpendMinor: null,
      monthlySpendMinor: null,
      dailyAtmMinor: null,
      updatedAt: null,
    }, "card-1"),
    {
      cardId: "card-1",
      singleTransactionMinor: null,
      dailySpendMinor: null,
      monthlySpendMinor: null,
      dailyAtmMinor: null,
      updatedAt: null,
    },
  );
});

test("requires returned limits to match the selected opaque Card ID", () => {
  assert.throws(() => parseCardLimits(rawLimits(), "card-2"), /selected card/);
  assert.equal(parseCardLimits({ ...rawLimits(), cardId: "card:1" }, "card:1").cardId, "card:1");
  assert.equal(parseCardLimits({ ...rawLimits(), cardId: "card.1" }, "card.1").cardId, "card.1");
});

test("builds only a validated Card limits read path", () => {
  assert.equal(cardLimitsPath("card:1"), "/v1/cards/card%3A1/limits");
  assert.equal(cardLimitsPath("card.1"), "/v1/cards/card.1/limits");
  for (const cardId of ["x", "bad/id", "bad id", "bad$id"])
    assert.throws(() => cardLimitsPath(cardId), /cardId/);
});

test("accepts only nullable canonical non-negative signed-64-bit limit amounts", () => {
  for (const dailySpendMinor of [null, "0", "1", "9223372036854775807"])
    assert.equal(parseCardLimits({ ...rawLimits(), dailySpendMinor }, "card-1").dailySpendMinor, dailySpendMinor);

  for (const dailySpendMinor of [1, "", "00", "01", "-1", "+1", "1.0", "9223372036854775808"])
    assert.throws(
      () => parseCardLimits({ ...rawLimits(), dailySpendMinor }, "card-1"),
      /dailySpendMinor/,
    );
  assert.throws(
    () => parseCardLimits({ ...rawLimits(), singleTransactionMinor: undefined }, "card-1"),
    /singleTransactionMinor/,
  );
  assert.throws(
    () => parseCardLimits({ ...rawLimits(), monthlySpendMinor: "-1" }, "card-1"),
    /monthlySpendMinor/,
  );
  assert.throws(
    () => parseCardLimits({ ...rawLimits(), dailyAtmMinor: "01" }, "card-1"),
    /dailyAtmMinor/,
  );
});

test("accepts nullable strict RFC3339 updatedAt and rejects pseudo-dates", () => {
  assert.equal(parseCardLimits({ ...rawLimits(), updatedAt: null }, "card-1").updatedAt, null);
  assert.equal(
    parseCardLimits({ ...rawLimits(), updatedAt: "2024-02-29T23:59:59.123456789+14:00" }, "card-1").updatedAt,
    "2024-02-29T23:59:59.123456789+14:00",
  );
  for (const updatedAt of [
    "0",
    "2026-02-30T00:00:00Z",
    "2026-01-01 00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:00:00",
    "2026-01-01T00:00:00+14:01",
  ])
    assert.throws(() => parseCardLimits({ ...rawLimits(), updatedAt }, "card-1"), /updatedAt/);
});

test("rejects stale Card limits success, error and finally work", () => {
  const request = {
    requestId: 12,
    scopeKey: "actor-a|tenant-a|customer-a|TEST",
    cardId: "card-1",
  };

  assert.equal(cardLimitsRequestIsCurrent(request, 12, request.scopeKey, "card-1"), true);
  assert.equal(cardLimitsRequestIsCurrent(request, 13, request.scopeKey, "card-1"), false);
  assert.equal(cardLimitsRequestIsCurrent(request, 12, "scope-b", "card-1"), false);
  assert.equal(cardLimitsRequestIsCurrent(request, 12, request.scopeKey, "card-2"), false);
  assert.equal(cardLimitsRequestIsCurrent(request, 12, null, null), false);
});
