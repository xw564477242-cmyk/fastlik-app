import assert from "node:assert/strict";
import test from "node:test";
import { runSessionInitializationModule } from "../src/sessionLifecycle.ts";
import { walletTransferSessionScope } from "../src/walletTransfer.ts";
import {
  beginWalletAssetCatalogSessionInitialization,
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
    { assetId: "flp_asset_eur", assetCode: "EUR", assetClass: "FIAT" },
    { assetId: "flp_asset_myr", assetCode: "MYR", assetClass: "FIAT" },
    { assetId: "flp_asset_sgd", assetCode: "SGD", assetClass: "FIAT" },
    { assetId: "flp_asset_usd", assetCode: "USD", assetClass: "FIAT" },
    { assetId: "flp_asset_usdt", assetCode: "USDT", assetClass: "DIGITAL" },
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

integration("acceptSession initializes a current asset request only after clearing the previous session", async () => {
  const session = activeSession();
  const scope = walletTransferSessionScope(session, environment!, NOW)!;
  const previous = new AbortController();
  const activeController = { current: previous as AbortController | null };
  const requestSequence = { current: 4 };
  const events: string[] = [];
  let committed: Awaited<ReturnType<typeof readWalletAssetCatalog>> | null = null;

  const initialization = beginWalletAssetCatalogSessionInitialization({
    scopeKey: scope,
    requestSequence,
    activeController,
    invalidateAndClear: () => {
      events.push("invalidate-and-clear");
      activeController.current?.abort();
      activeController.current = null;
      requestSequence.current += 1;
    },
  });
  const isCurrent = () => activeController.current === initialization.controller &&
    walletAssetCatalogRequestIsCurrent(
      initialization.request,
      requestSequence.current,
      scope,
      true,
    );

  await runSessionInitializationModule({
    load: () => readWalletAssetCatalog(async request => {
      events.push("load");
      assert.equal(request.signal, initialization.controller.signal);
      assert.equal(request.signal?.aborted, false);
      return payload();
    }, session, environment!, scope, initialization.controller.signal, () => NOW),
    isCurrent,
    commit: value => {
      events.push("commit");
      committed = value;
    },
    moduleError: value => assert.fail(`current initialization failed: ${String(value)}`),
    sessionInvalid: () => assert.fail("valid initialization cannot clear the session"),
  });

  assert.equal(previous.signal.aborted, true);
  assert.equal(initialization.controller.signal.aborted, false);
  assert.equal(activeController.current, initialization.controller);
  assert.equal(initialization.request.requestId, 6);
  assert.equal(isCurrent(), true);
  assert.deepEqual(events, ["invalidate-and-clear", "load", "commit"]);
  assert.equal(committed?.environment, environment);
  assert.equal(committed?.items.length, 5);
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
