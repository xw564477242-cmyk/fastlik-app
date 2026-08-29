import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import React from 'react'
import TestRenderer, {act} from 'react-test-renderer'
import {Phase2TestCardProductsPanel} from '../src/Phase2TestCardProductsPanel.ts'
import {PHASE2_DEFERRED_CODE, phase2Availability} from '../src/phase2Availability.ts'

test('enables the local P1/Phase2 request bundle only in DEV SANDBOX', () => {
  assert.deepEqual(phase2Availability('SANDBOX', 'SANDBOX'), {
    mode: 'ACTIVE',
    environment: 'SANDBOX',
    sessionEnvironment: 'SANDBOX',
    code: null,
  })
  assert.deepEqual(phase2Availability('TEST', 'TEST'), {
    mode: 'CARD_PRODUCTS_READ_ONLY',
    environment: 'TEST',
    sessionEnvironment: 'TEST',
    code: PHASE2_DEFERRED_CODE,
    message: 'Phase2 onchain networks and actions are enabled only in DEV SANDBOX. TEST performs one local Card product read and sends no Phase2 onchain or write request.',
  })
  for (const environment of ['LOCAL', 'UAT', 'PRODUCTION'] as const) {
    const availability = phase2Availability(environment, environment)
    assert.equal(availability.mode, 'DEFERRED')
    assert.equal(availability.code, PHASE2_DEFERRED_CODE)
    assert.equal(availability.environment, environment)
    assert.equal(availability.sessionEnvironment, environment)
    assert.match(availability.message, /No Phase2 catalogue, address, transaction, quote, or write request was sent/)
  }
})

test('fails closed before mount when runtime and Session environments differ', () => {
  const availability = phase2Availability('SANDBOX', 'TEST')
  assert.equal(availability.mode, 'DEFERRED')
  assert.equal(availability.code, PHASE2_DEFERRED_CODE)
  assert.match(availability.message, /runtime and authenticated Session environments do not match/)
  assert.match(availability.message, /No Phase2 catalogue/)
})

test('defers TEST before the request-owning Sandbox component can mount', () => {
  const panel = readFileSync(new URL('../src/Phase2WalletPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /phase2Availability\(walletRuntime\.environment, props\.sessionEnvironment\)/)
  assert.match(panel, /availability\.mode === 'ACTIVE'\) return <SandboxPhase2WalletPanel/)
  assert.match(panel, /availability\.mode === 'CARD_PRODUCTS_READ_ONLY'/)
  assert.match(panel, /<Phase2TestCardProductsPanel availability=\{availability\} sessionKey=\{props\.sessionKey\} gateway=\{walletGateway\} readEnabled=\{props\.catalogReadEnabled\}/)
  assert.match(panel, /return <Phase2DeferredPanel availability=\{availability\}/)
  assert.match(panel, /data-phase2-state=\{availability\.code\}/)
})

test('the mounted TEST panel performs exactly one Card catalogue GET and renders no controls', async () => {
  const availability = phase2Availability('TEST', 'TEST')
  assert.equal(availability.mode, 'CARD_PRODUCTS_READ_ONLY')
  let calls = 0
  let requestSignal: AbortSignal | undefined
  const gateway = {
    async cardProducts(signal?: AbortSignal) {
      calls += 1
      requestSignal = signal
      return []
    },
  }
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Phase2TestCardProductsPanel, {
      availability,
      sessionKey: 'test-session-a',
      gateway,
      readEnabled: true,
    }))
    await Promise.resolve()
  })
  assert.equal(calls, 1)
  assert.equal(renderer.root.findAllByType('button').length, 0)
  assert.equal(renderer.root.findAllByType('form').length, 0)
  assert.equal(renderer.root.findAllByType('select').length, 0)
  const rendered = JSON.stringify(renderer.toJSON())
  assert.match(rendered, /B_DEFERRED/)
  assert.match(rendered, /CARD_PRODUCTS_READ_ONLY/)
  assert.match(rendered, /No tenant-enabled local Card product was returned/)
  assert.match(rendered, /No Card quote, issue, funding, address, transfer, FX, or Provider action/)
  act(() => renderer.unmount())
  assert.equal(requestSignal?.aborted, true)
})

test('a TEST Card catalogue failure is fail-closed and is never retried automatically', async () => {
  const availability = phase2Availability('TEST', 'TEST')
  assert.equal(availability.mode, 'CARD_PRODUCTS_READ_ONLY')
  let calls = 0
  const gateway = {
    async cardProducts() {
      calls += 1
      throw {status: 503, traceId: 'catalog-safe-trace-0001'}
    },
  }
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Phase2TestCardProductsPanel, {
      availability,
      sessionKey: 'test-session-b',
      gateway,
      readEnabled: true,
    }))
    await Promise.resolve()
  })
  assert.equal(calls, 1)
  assert.equal(renderer.root.findAllByType('button').length, 0)
  const rendered = JSON.stringify(renderer.toJSON())
  assert.match(rendered, /card products is temporarily unavailable/)
  assert.match(rendered, /catalog-safe-trace-0001/)
  assert.doesNotMatch(rendered, /password|cookie|token/i)
  act(() => renderer.unmount())
})

test('the TEST catalogue waits for completed authenticated initialization before its one GET', async () => {
  const availability = phase2Availability('TEST', 'TEST')
  assert.equal(availability.mode, 'CARD_PRODUCTS_READ_ONLY')
  let calls = 0
  const gateway = {
    async cardProducts() {
      calls += 1
      return []
    },
  }
  let renderer!: TestRenderer.ReactTestRenderer
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Phase2TestCardProductsPanel, {
      availability,
      sessionKey: 'test-session-c',
      gateway,
      readEnabled: false,
    }))
  })
  assert.equal(calls, 0)
  assert.match(JSON.stringify(renderer.toJSON()), /Waiting for authenticated Wallet initialization/)
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /No tenant-enabled local Card product was returned/)
  await act(async () => {
    renderer.update(React.createElement(Phase2TestCardProductsPanel, {
      availability,
      sessionKey: 'test-session-c',
      gateway,
      readEnabled: true,
    }))
    await Promise.resolve()
  })
  assert.equal(calls, 1)
  await act(async () => {
    renderer.update(React.createElement(Phase2TestCardProductsPanel, {
      availability,
      sessionKey: 'test-session-c',
      gateway,
      readEnabled: true,
    }))
    await Promise.resolve()
  })
  assert.equal(calls, 1)
  act(() => renderer.unmount())
})
