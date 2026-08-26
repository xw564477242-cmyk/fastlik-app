import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canManuallyRetryPhase2Read,
  cardIssueInputFromLocalProduct,
  phase2EmptyStateMessage,
  phase2FxUnavailableMessage,
  phase2ReadFailureMessage,
} from '../src/phase2WalletUat.ts'

test('times out safely with a manual-only read retry and no synthetic fallback', () => {
  const timeout = {status: 408, traceId: '6e38dfe5-9fd2-4398-a379-def035b20f9e'}
  assert.equal(canManuallyRetryPhase2Read(timeout), true)
  assert.match(phase2ReadFailureMessage('deposit-addresses', timeout), /HTTP 408/)
  assert.match(phase2ReadFailureMessage('deposit-addresses', timeout), /retry this read once manually/)
  assert.match(phase2ReadFailureMessage('deposit-addresses', timeout), /6e38dfe5-9fd2-4398-a379-def035b20f9e/)
  assert.match(phase2EmptyStateMessage['deposit-addresses'], /will not automatically allocate or invent an address/)
})

test('session and contract failures are fail-closed and are never automatically retried', () => {
  assert.equal(canManuallyRetryPhase2Read({status: 401}), false)
  assert.equal(canManuallyRetryPhase2Read({status: 422}), false)
  assert.match(phase2ReadFailureMessage('onchain-transactions', {status: 401}), /Sign in again/)
  assert.match(phase2EmptyStateMessage['withdrawal-addresses'], /Direct destination entry remains disabled/)
  assert.match(phase2EmptyStateMessage['card-products'], /remain disabled/)
})

test('Card issue converts a local product identity into currencyId and never accepts a display ISO code', () => {
  assert.deepEqual(cardIssueInputFromLocalProduct('flp_asset_usd', 'Sandbox'), {currencyId: 'flp_asset_usd', alias: 'Sandbox'})
  assert.throws(() => cardIssueInputFromLocalProduct('USD'), /currencyId/)
  assert.throws(() => cardIssueInputFromLocalProduct('flp_asset_usd', 'x'.repeat(31)), /alias/)
})

test('FX timeout and session failures keep the no-conversion fail-closed placeholder', () => {
  assert.match(phase2FxUnavailableMessage({status: 408}), /timed out safely/)
  assert.match(phase2FxUnavailableMessage({status: 408}), /No conversion was performed/)
  assert.match(phase2FxUnavailableMessage({status: 401}), /session/)
})
