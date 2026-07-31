import assert from "node:assert/strict";
import test from "node:test";
import {
  cardBalancePath,
  cardBalanceRequestIsCurrent,
  parseCardBalance,
} from "../src/cardBalance.ts";

const rawBalance = (): Record<string, unknown> => ({
  cardId: "card-1",
  currency: "USD",
  availableBalanceMinor: "12345",
  currentBalanceMinor: "13000",
  pendingAmountMinor: "655",
  updatedAt: "2026-07-31T01:02:03.000Z",
  tenantId: "tenant-private",
  customerId: "customer-private",
  environment: "TEST",
  provider: "private-provider",
  providerPublicToken: "provider-token-private",
  providerUpdatedAt: "provider-internal",
  walletAccountId: "wallet-private",
  treasuryAccountId: "treasury-private",
  journalIds: ["journal-private"],
});

test("reconstructs Card balance from the six-field public allowlist only", () => {
  const balance = parseCardBalance(rawBalance(), "card-1");

  assert.deepEqual(Object.keys(balance).sort(), [
    "availableBalanceMinor",
    "cardId",
    "currency",
    "currentBalanceMinor",
    "pendingAmountMinor",
    "updatedAt",
  ]);
  for (const forbidden of [
    "tenantId",
    "customerId",
    "environment",
    "provider",
    "providerPublicToken",
    "providerUpdatedAt",
    "walletAccountId",
    "treasuryAccountId",
    "journalIds",
  ])
    assert.equal(forbidden in balance, false);
});

test("requires the returned cardId to match the selected card", () => {
  assert.throws(() => parseCardBalance(rawBalance(), "card-2"), /selected card/);
  assert.throws(() => parseCardBalance({ ...rawBalance(), cardId: "bad$id" }, "card-1"), /cardId/);
});

test("builds only a validated Card balance path", () => {
  assert.equal(cardBalancePath("card_1-test"), "/v1/cards/card_1-test/balance");
  assert.throws(() => cardBalancePath("x"), /cardId/);
  assert.throws(() => cardBalancePath("bad/id"), /cardId/);
});

test("accepts only canonical signed 64-bit integer minor amounts", () => {
  for (const availableBalanceMinor of [
    "0",
    "1",
    "-1",
    "9223372036854775807",
    "-9223372036854775808",
  ])
    assert.equal(
      parseCardBalance({ ...rawBalance(), availableBalanceMinor }, "card-1").availableBalanceMinor,
      availableBalanceMinor,
    );

  for (const availableBalanceMinor of [
    1,
    "01",
    "-0",
    "+1",
    "1.0",
    "9223372036854775808",
    "-9223372036854775809",
  ])
    assert.throws(
      () => parseCardBalance({ ...rawBalance(), availableBalanceMinor }, "card-1"),
      /availableBalanceMinor/,
    );
  assert.throws(
    () => parseCardBalance({ ...rawBalance(), currentBalanceMinor: null }, "card-1"),
    /currentBalanceMinor/,
  );
  assert.throws(
    () => parseCardBalance({ ...rawBalance(), pendingAmountMinor: "" }, "card-1"),
    /pendingAmountMinor/,
  );
});

test("accepts only a three-letter uppercase currency", () => {
  assert.equal(parseCardBalance(rawBalance(), "card-1").currency, "USD");
  for (const currency of ["usd", "USDT", "US1", null])
    assert.throws(() => parseCardBalance({ ...rawBalance(), currency }, "card-1"), /currency/);
});

test("accepts strict RFC3339 timestamps and rejects pseudo-dates", () => {
  assert.equal(
    parseCardBalance({ ...rawBalance(), updatedAt: "2024-02-29T23:59:59.123456789+14:00" }, "card-1").updatedAt,
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
    assert.throws(() => parseCardBalance({ ...rawBalance(), updatedAt }, "card-1"), /updatedAt/);
});

test("rejects stale Card balance success, error and finally work", () => {
  const request = {
    requestId: 7,
    scopeKey: "actor-a|tenant-a|customer-a|TEST",
    cardId: "card-1",
  };

  assert.equal(cardBalanceRequestIsCurrent(request, 7, request.scopeKey, "card-1"), true);
  assert.equal(cardBalanceRequestIsCurrent(request, 8, request.scopeKey, "card-1"), false);
  assert.equal(cardBalanceRequestIsCurrent(request, 7, "scope-b", "card-1"), false);
  assert.equal(cardBalanceRequestIsCurrent(request, 7, request.scopeKey, "card-2"), false);
  assert.equal(cardBalanceRequestIsCurrent(request, 7, null, null), false);
});
