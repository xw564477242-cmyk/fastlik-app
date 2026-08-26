import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseBalanceTriples,
  parseDepositAddress,
  parseOnchainNetworks,
  parseOnchainTransfer,
  parseTotalAssets,
  parseWithdrawalPreview,
} from '../src/gateway/contracts.ts'

const fees = {grossAmount: '101.1', platformFee: '1', networkFee: '0.1', fxFee: '0', netAmount: '100'}
const transfer = {
  transferId: 'transfer_001', direction: 'WITHDRAWAL', state: 'PENDING_COMPLIANCE', networkId: 'eip155:1',
  assetId: 'flp_asset_usdt', assetCode: 'USDT', fees, confirmations: 0, confirmationTarget: 12,
  transactionHash: null, approvalRequired: true, complianceStatus: 'PENDING', reversalRequired: false,
  manualReviewReason: null, externalProviderCalled: false, createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z',
}

test('parses ledger, pending and available balances without deriving values', () => {
  const source = {items: [{assetCode: 'USDT', ledgerBalance: '1250.000000000000000001', pendingBalance: '250.000000000000000001', availableBalance: '0', updatedAt: '2026-08-21T00:00:00.000Z'}]}
  assert.deepEqual(parseBalanceTriples(source), source.items)
})

test('keeps frozen value visible through Backend total-assets response', () => {
  const result = parseTotalAssets({
    valuationAssetId: 'flp_asset_usd', valuationAssetCode: 'USD', totalLedgerValue: '1250', totalAvailableValue: '0',
    valuationMode: 'SANDBOX_REFERENCE', externalProviderCalled: false,
    items: [{assetId: 'flp_asset_usdt', assetCode: 'USDT', assetClass: 'DIGITAL', ledgerBalance: '1250', availableBalance: '0', valuationRate: '1', ledgerValue: '1250', availableValue: '0', updatedAt: '2026-08-21T00:00:00.000Z'}],
  })
  assert.equal(result.totalLedgerValue, '1250')
  assert.equal(result.totalAvailableValue, '0')
  assert.equal(result.items[0].ledgerBalance, '1250')
  assert.equal(result.items[0].availableBalance, '0')
})

test('accepts only provider-neutral CAIP-2 network DTOs with no provider call', () => {
  const result = parseOnchainNetworks({items: [{caip2Id: 'eip155:1', displayName: 'Ethereum', confirmationTarget: 12, executionMode: 'EXTERNAL_CUSTODY_CONTRACT_ONLY', externalProviderCalled: false}]})
  assert.equal(result[0].caip2Id, 'eip155:1')
  assert.throws(() => parseOnchainNetworks({items: [{...result[0], externalProviderCalled: true}]}), /remain false/)
})

test('validates permanent address rotation fields and CAIP-10 identity', () => {
  const result = parseDepositAddress({addressId: 'addr_1', networkId: 'eip155:56', assetId: 'flp_asset_usdt', assetCode: 'USDT', address: '0x1111111111111111111111111111111111111111', caip10AccountId: 'eip155:56:0x1111111111111111111111111111111111111111', rotationIndex: 2, status: 'ACTIVE', allocatedAt: '2026-08-21T00:00:00.000Z', retiredAt: null, externalProviderCalled: false})
  assert.equal(result.rotationIndex, 2)
  assert.equal(result.status, 'ACTIVE')
})

test('renders Backend withdrawal threshold, cooling and compliance facts without client calculation', () => {
  const result = parseWithdrawalPreview({fees, approvalThreshold: '1000', approvalRequired: true, addressCoolingPeriodSeconds: 600, addressEligibleAt: '2026-08-21T00:10:00.000Z', complianceGateEnabled: true, externalProviderCalled: false})
  assert.equal(result.approvalThreshold, '1000')
  assert.equal(result.addressCoolingPeriodSeconds, 600)
  assert.equal(result.complianceGateEnabled, true)
})

test('surfaces reorg freeze and manual-review state with exact fee split', () => {
  const result = parseOnchainTransfer({...transfer, state: 'REORGED', reversalRequired: true, manualReviewReason: 'CHAIN_REORG'})
  assert.equal(result.state, 'REORGED')
  assert.equal(result.reversalRequired, true)
  assert.equal(result.manualReviewReason, 'CHAIN_REORG')
  assert.deepEqual(result.fees, fees)
})

test('fails closed for unknown transfer states and hidden provider activity', () => {
  assert.throws(() => parseOnchainTransfer({...transfer, state: 'UNKNOWN'}), /state is invalid/)
  assert.throws(() => parseOnchainTransfer({...transfer, externalProviderCalled: true}), /remain false/)
})
