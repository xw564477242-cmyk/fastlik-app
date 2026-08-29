import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import React from 'react'
import TestRenderer, {act} from 'react-test-renderer'
import {
  AuthenticatedBusinessWriteBoundary,
  ReadOnlyUatCapabilityMarker,
} from '../src/AuthenticatedBusinessWriteBoundary.ts'
import {
  parseInteractionMode,
  readOnlyUatRequestAllowed,
  validateInteractionMode,
} from '../src/interactionMode.ts'
import {ReadOnlyUatAuthenticatedView} from '../src/ReadOnlyUatAuthenticatedView.ts'

const boundaryProps = {
  runtimeEnvironment: 'TEST',
  sessionEnvironment: 'TEST',
} as const

function HostileMaximumCapabilityBusinessTree() {
  return React.createElement(
    'div',
    {'data-hostile-capabilities': 'all'},
    React.createElement(
      'form',
      null,
      React.createElement('input', {name: 'virtual-card-currency-id'}),
      React.createElement('input', {name: 'virtual-card-alias'}),
      React.createElement('select', {name: 'replacement-reason'}, React.createElement('option', null, 'LOST')),
      React.createElement('button', {type: 'submit'}, 'Create virtual card'),
      React.createElement('button', {type: 'button'}, 'Transfer once'),
      React.createElement('button', {type: 'button'}, 'Preview synthetic quote'),
      React.createElement('button', {type: 'button'}, 'Activate Freeze Unfreeze Replace Renew Apply limits'),
    ),
  )
}

test('READ_ONLY_UAT mounts the exact capability marker and never mounts a maximal business-write subtree', () => {
  const renderer = TestRenderer.create(React.createElement(
    React.Fragment,
    null,
    React.createElement(ReadOnlyUatCapabilityMarker, {...boundaryProps, interactionMode: 'READ_ONLY_UAT'}),
    React.createElement(
      AuthenticatedBusinessWriteBoundary,
      {...boundaryProps, interactionMode: 'READ_ONLY_UAT'},
      React.createElement(HostileMaximumCapabilityBusinessTree),
    ),
  ))

  const capability = renderer.root.findByProps({'data-fastlink-capability': 'CARD_PRODUCTS_READ_ONLY'})
  assert.equal(capability.props['data-business-write-surface'], 'disabled')
  assert.equal(capability.findAllByType('button').length, 0)
  assert.equal(capability.findAllByType('form').length, 0)
  assert.equal(capability.findAllByType('select').length, 0)
  assert.equal(capability.findAllByType('input').length, 0)
  assert.equal(renderer.root.findAllByProps({'data-hostile-capabilities': 'all'}).length, 0)
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Create virtual card|Transfer once|synthetic quote|Apply limits/)
  renderer.unmount()
})

test('FULL keeps the existing TEST business-write subtree unchanged', () => {
  const renderer = TestRenderer.create(React.createElement(
    AuthenticatedBusinessWriteBoundary,
    {...boundaryProps, interactionMode: 'FULL'},
    React.createElement(HostileMaximumCapabilityBusinessTree),
  ))
  assert.equal(renderer.root.findAllByProps({'data-hostile-capabilities': 'all'}).length, 1)
  assert.equal(renderer.root.findAllByType('form').length, 1)
  assert.equal(renderer.root.findAllByType('input').length, 2)
  assert.equal(renderer.root.findAllByType('select').length, 1)
  assert.equal(renderer.root.findAllByType('button').length, 4)
  assert.match(JSON.stringify(renderer.toJSON()), /Create virtual card/)
  renderer.unmount()
})

test('the real READ_ONLY_UAT authenticated view mounts the real catalogue panel with zero controls under maximal data and capabilities', async () => {
  let catalogueGets = 0
  const session = {
    actorId: 'actor-readonly',
    tenantId: 'tenant-readonly',
    customerId: 'customer-readonly',
    environment: 'TEST' as const,
    expiresAt: '2099-08-29T00:00:00.000Z',
  }
  const account = (id: string, assetCode: string) => ({
    id,
    accountCode: `ACCOUNT:${id}`,
    name: `${assetCode} Wallet`,
    assetCode,
    status: 'ACTIVE' as const,
    currentBalance: '100.00',
    postedBalance: '100.00',
    pendingBalance: '0',
    availableBalance: '100.00',
    updatedAt: '2026-08-29T00:00:00.000Z',
  })
  const card = {
    id: 'card-max-capabilities',
    type: 'VIRTUAL' as const,
    status: 'ACTIVE' as const,
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2032,
    currency: 'USD',
    alias: 'Maximum capability card',
    createdAt: '2026-08-29T00:00:00.000Z',
    capabilities: {freeze: true, unfreeze: true, replace: true, renew: true, updateLimits: true},
  }
  const operations = {
    items: [1, 2, 3, 4].map((index) => ({
      id: `operation-${index}`,
      type: 'INTERNAL_TRANSFER' as const,
      status: 'COMPLETED' as const,
      assetCode: 'USD',
      amount: `${index}.00`,
      direction: 'OUTGOING' as const,
      createdAt: `2026-08-29T00:00:0${index}.000Z`,
      completedAt: `2026-08-29T00:00:0${index}.000Z`,
      updatedAt: `2026-08-29T00:00:0${index}.000Z`,
    })),
    nextCursor: 'opaque-next',
    filterKey: 'ALL:ALL',
    cursorTrail: [] as const,
  }
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(ReadOnlyUatAuthenticatedView, {
      interactionMode: 'READ_ONLY_UAT',
      runtimeEnvironment: 'TEST',
      session,
      summary: {
        items: [
          {assetCode: 'USD', availableBalance: '100.00', ledgerBalance: '100.00', pendingBalance: '0', updatedAt: '2026-08-29T00:00:00.000Z'},
          {assetCode: 'EUR', availableBalance: '80.00', ledgerBalance: '80.00', pendingBalance: '0', updatedAt: '2026-08-29T00:00:00.000Z'},
        ],
      },
      summaryLoading: false,
      summaryUnavailable: false,
      accounts: [account('account-usd', 'USD'), account('account-eur', 'EUR')],
      accountsUnavailable: false,
      cards: [card],
      cardsUnavailable: false,
      operations,
      operationsLoading: false,
      operationsUnavailable: false,
      catalogReadEnabled: true,
      cardProductsGateway: {
        async cardProducts() {
          catalogueGets += 1
          return [{
            templateId: 'template-local-usd',
            assetId: 'flp_asset_usd',
            cardType: 'VIRTUAL',
            currency: 'USD',
            openingFee: '5',
            monthlyFee: '1',
          }]
        },
      },
    }))
    await Promise.resolve()
  })

  assert.equal(catalogueGets, 1)
  assert.equal(renderer.root.findAllByType('button').length, 0)
  assert.equal(renderer.root.findAllByType('form').length, 0)
  assert.equal(renderer.root.findAllByType('select').length, 0)
  assert.equal(renderer.root.findAllByType('input').length, 0)
  const rendered = JSON.stringify(renderer.toJSON())
  assert.match(rendered, /CARD_PRODUCTS_READ_ONLY/)
  assert.match(rendered, /B_DEFERRED/)
  assert.match(rendered, /Card products · read only/)
  assert.match(rendered, /VIRTUAL · USD/)
  assert.match(rendered, /Maximum capability card|Card •••• 4242/)
  assert.doesNotMatch(rendered, /Create virtual card|Refresh session|Sign out|Transfer once|synthetic quote|Activate|Freeze|Unfreeze|Replace selected|Renew selected|Apply limits|KYC/)
  act(() => renderer.unmount())
})

test('the client policy is fail-closed with only the exact authentication lifecycle POST allowlist', () => {
  assert.equal(parseInteractionMode(undefined), 'FULL')
  assert.equal(parseInteractionMode('read_only_uat'), 'READ_ONLY_UAT')
  assert.equal(validateInteractionMode('TEST', 'READ_ONLY_UAT'), 'READ_ONLY_UAT')
  assert.throws(() => validateInteractionMode('SANDBOX', 'READ_ONLY_UAT'), /only in TEST/)
  assert.throws(() => parseInteractionMode('unsafe'), /Invalid FastLink interaction mode/)

  for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
    assert.equal(readOnlyUatRequestAllowed('/v1/cards/products', method), true)
  }
  for (const path of ['/v1/auth/login', '/v1/auth/refresh', '/v1/auth/logout']) {
    assert.equal(readOnlyUatRequestAllowed(path, 'POST'), true)
  }
  for (const [path, method] of [
    ['/v1/auth/register', 'POST'],
    ['/v1/auth/login?next=write', 'POST'],
    ['/v1/cards/virtual', 'POST'],
    ['/v1/wallet/transfers', 'POST'],
    ['/v1/wallet/fx/quotes', 'POST'],
    ['/v1/cards/card-a/freeze', 'POST'],
    ['/v1/cards/card-a/replace', 'POST'],
    ['/v1/cards/card-a/renew', 'POST'],
    ['/v1/cards/card-a/limits', 'POST'],
    ['/v1/cards/card-a/limits', 'PATCH'],
    ['/v2/onchain/deposits', 'POST'],
  ]) {
    assert.equal(readOnlyUatRequestAllowed(path, method), false, `${method} ${path}`)
  }
})

test('the production App wires every known business-write surface through the read-only boundary', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /readOnlyUatAuthenticated=Boolean\(session&&isReadOnlyUatSession\(walletRuntime\.environment,session\.environment,walletRuntime\.interactionMode\)\)/)
  assert.match(app, /session&&!readOnlyUatAuthenticated&&<div className="session-actions"/)
  assert.match(app, /session&&readOnlyUatAuthenticated&&<WalletRenderBoundary[^]*<ReadOnlyUatAuthenticatedView/)
  assert.match(app, /readOnlyUatAuthenticated&&<WalletRenderBoundary[^>]*retryEnabled=\{false\}/)
  assert.match(app, /session&&!readOnlyUatAuthenticated&&<WalletRenderBoundary[^]*<div className="wallet-grid">/)
  const restrictedBranch = app.indexOf('session&&readOnlyUatAuthenticated&&<WalletRenderBoundary')
  const fullBranch = app.indexOf('session&&!readOnlyUatAuthenticated&&<WalletRenderBoundary')
  assert.ok(restrictedBranch >= 0 && fullBranch > restrictedBranch)
  assert.equal(app.slice(restrictedBranch, fullBranch).includes('KycStatusPanel'), false)
  assert.equal(app.slice(restrictedBranch, fullBranch).includes('session-actions'), false)
  assert.match(app, /<ReadOnlyUatCapabilityMarker \{\.\.\.authenticatedBoundaryProps!\}\/\>/)
  assert.match(app, /AuthenticatedBusinessWriteBoundary[^]*FxQuotePreview[^]*AuthenticatedBusinessWriteBoundary>/)
  assert.match(app, /AuthenticatedBusinessWriteBoundary[^]*ConsumerTransferFlow[^]*AuthenticatedBusinessWriteBoundary>/)
  assert.match(app, /AuthenticatedBusinessWriteBoundary[^]*Create virtual card[^]*AuthenticatedBusinessWriteBoundary>/)
  assert.match(app, /AuthenticatedBusinessWriteBoundary[^]*onClick=\{toggle\}[^]*replaceSelectedCard[^]*renewSelectedCard[^]*AuthenticatedBusinessWriteBoundary>/)
  assert.match(app, /AuthenticatedBusinessWriteBoundary[^]*submitSelectedCardLimits[^]*AuthenticatedBusinessWriteBoundary>/)
  assert.match(app, /interactionMode==='READ_ONLY_UAT'\?await walletApi\.login\(credentials\):await walletApi\.register/)
  assert.match(app, /interactionMode==='FULL'&&<button className="mode-switch"/)

  const initializationStart = app.indexOf('const acceptSession=async')
  const initializationReads = app.indexOf('await runBoundedWalletInitialization', initializationStart)
  const selectedCardReads = app.indexOf('if(card)await loadCard', initializationReads)
  const catalogReady = app.indexOf('setSessionInitializationReady(true)', selectedCardReads)
  const catalogProp = app.indexOf('catalogReadEnabled={sessionInitializationReady}', catalogReady)
  assert.ok(initializationStart >= 0)
  assert.ok(initializationReads > initializationStart)
  assert.ok(selectedCardReads > initializationReads)
  assert.ok(catalogReady > selectedCardReads)
  assert.ok(catalogProp > catalogReady)
})

test('walletHttpRequest blocks a business POST before fetch while preserving GET and auth lifecycle transport', async () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  let fetchCalls = 0

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __FASTLINK_RUNTIME__: {
        environment: 'TEST',
        apiUrl: '/api',
        buildSha: 'a'.repeat(40),
        interactionMode: 'READ_ONLY_UAT',
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      dispatchEvent: () => true,
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {cookie: ''},
  })
  globalThis.fetch = async () => {
    fetchCalls += 1
    return Response.json([])
  }

  try {
    const {walletHttpRequest, WalletGatewayError} = await import('../src/gateway/httpTransport.ts?read-only-uat-test')
    for (const [path, method] of [
      ['/v1/auth/register', 'POST'],
      ['/v1/auth/login?next=write', 'POST'],
      ['/v1/cards/virtual', 'POST'],
      ['/v1/wallet/transfers', 'POST'],
      ['/v1/wallet/fx/quotes', 'POST'],
      ['/v1/cards/card-a/freeze', 'POST'],
      ['/v1/cards/card-a/replace', 'POST'],
      ['/v1/cards/card-a/renew', 'POST'],
      ['/v1/cards/card-a/limits', 'POST'],
      ['/v1/cards/card-a/limits', 'PATCH'],
      ['/v2/onchain/deposits', 'POST'],
    ]) {
      await assert.rejects(
        walletHttpRequest({path, method, body: {unsafe: true}}),
        (value: unknown) => value instanceof WalletGatewayError && value.status === 403,
      )
    }
    assert.equal(fetchCalls, 0)

    await walletHttpRequest({path: '/v1/cards/products', method: 'GET'})
    assert.equal(fetchCalls, 1)
    await walletHttpRequest({path: '/v1/auth/refresh', method: 'POST'})
    assert.equal(fetchCalls, 2)
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', {configurable: true, value: originalWindow})
    Object.defineProperty(globalThis, 'document', {configurable: true, value: originalDocument})
  }
})
