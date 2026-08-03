import assert from "node:assert/strict";
import test from "node:test";
import { runSessionInitializationModule } from "../src/sessionLifecycle.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";
import {
  createWalletAssetCatalogRequestIdentity,
  readWalletAssetCatalog,
  walletAssetCatalogRequestIsCurrent,
  walletAssetCatalogRequestWasAborted,
} from "../src/walletAssets.ts";

const configuredEnvironment = process.env.FASTLINK_TEST_ENVIRONMENT;
const environment = configuredEnvironment === "SANDBOX" || configuredEnvironment === "TEST"
  ? configuredEnvironment
  : null;
const integration = environment ? test : test.skip;
const NOW = Date.parse("2026-08-03T08:00:00.000Z");

const payload = () => JSON.stringify({
  environment,
  items: [
    { assetCode: "EUR", assetClass: "FIAT" },
    { assetCode: "MYR", assetClass: "FIAT" },
    { assetCode: "SGD", assetClass: "FIAT" },
    { assetCode: "USD", assetClass: "FIAT" },
    { assetCode: "USDT", assetClass: "DIGITAL" },
  ],
});

const activeSession = () => ({
  actorId: "actor-assets-integration",
  tenantId: "tenant-assets-integration",
  customerId: "customer-assets-integration",
  environment: environment!,
  expiresAt: "2026-08-03T09:00:00.000Z",
});

integration(`reads one exact authenticated asset catalog (${environment ?? "ENVIRONMENT_REQUIRED"})`, async () => {
  const session = activeSession();
  const scope = walletTransferSessionScope(session, environment!, NOW)!;
  const calls: unknown[] = [];
  const catalog = await readWalletAssetCatalog(async request => {
    calls.push(request);
    return payload();
  }, session, environment!, scope, undefined, () => NOW);
  assert.deepEqual(calls, [{ path: "/v1/wallet/assets", method: "GET", signal: undefined }]);
  assert.deepEqual(catalog.items.map(item => [item.assetCode, item.assetClass]), [
    ["EUR", "FIAT"], ["MYR", "FIAT"], ["SGD", "FIAT"], ["USD", "FIAT"], ["USDT", "DIGITAL"],
  ]);
});

integration("isolates replacement generations and aborted late responses", async () => {
  const session = activeSession();
  const scope = walletTransferSessionScope(session, environment!, NOW)!;
  let generation = 1;
  let currentScope: string | null = scope;
  const request = createWalletAssetCatalogRequestIdentity(generation, scope);
  let committed = false;
  let release!: (raw: string) => void;
  const controller = new AbortController();
  const operation = runSessionInitializationModule({
    load: () => readWalletAssetCatalog(
      () => new Promise(resolve => { release = resolve; }),
      session,
      environment!,
      scope,
      controller.signal,
      () => NOW,
    ),
    isCurrent: () => walletAssetCatalogRequestIsCurrent(request, generation, currentScope, true),
    commit: () => { committed = true; },
    moduleError: value => {
      if (!walletAssetCatalogRequestWasAborted(value)) assert.fail("late abort must not become a visible error");
    },
    sessionInvalid: () => assert.fail("late response cannot clear the replacement session"),
  });
  await Promise.resolve();
  controller.abort();
  generation += 1;
  currentScope = `${scope}:replacement`;
  release(payload());
  await operation;
  assert.equal(committed, false);
});

integration("routes an exact 401 to session invalidation and commits no catalog", async () => {
  let committed = 0;
  let moduleErrors = 0;
  let invalidations = 0;
  await runSessionInitializationModule({
    load: async () => { throw { status: 401, message: "Session expired" }; },
    isCurrent: () => true,
    commit: () => { committed += 1; },
    moduleError: () => { moduleErrors += 1; },
    sessionInvalid: () => { invalidations += 1; },
  });
  assert.deepEqual({ committed, moduleErrors, invalidations }, {
    committed: 0,
    moduleErrors: 0,
    invalidations: 1,
  });
});
