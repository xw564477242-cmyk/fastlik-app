import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCardTopupQuote,
  parseDepositPreview,
  parseOnchainTransferPage,
} from '../src/gateway/contracts.ts'
import {MockWalletGateway} from '../src/gateway/MockWalletGateway.ts'

const fees = {grossAmount: '100', platformFee: '1', networkFee: '0', fxFee: '0', netAmount: '99'}
const transfer = {
  transferId: 'transfer_001', direction: 'DEPOSIT', state: 'CONFIRMING', networkId: 'eip155:1',
  assetId: 'flp_asset_usdt', assetCode: 'USDT', fees, confirmations: 6, confirmationTarget: 12,
  transactionHash: null, approvalRequired: false, complianceStatus: 'PENDING', reversalRequired: false,
  manualReviewReason: null, externalProviderCalled: false, createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:00:00.000Z',
}

test('fails closed when a deposit preview is malformed, external, or loses its string amount', () => {
  const preview = {
    previewId: 'deposit_preview_001', depositAddressId: 'address_001', networkId: 'eip155:1',
    assetId: 'flp_asset_usdt', assetCode: 'USDT', fees, confirmationTarget: 12,
    expiresAt: '2026-08-21T00:05:00.000Z', externalProviderCalled: false,
  }
  assert.equal(parseDepositPreview(preview).previewId, preview.previewId)
  assert.throws(() => parseDepositPreview({...preview, externalProviderCalled: true}), /remain false/)
  assert.throws(() => parseDepositPreview({...preview, fees: {...fees, grossAmount: 100}}), /grossAmount/)
  assert.throws(() => parseDepositPreview({...preview, previewId: ''}), /previewId/)
})

test('keeps a tenant-private onchain list fail-closed and never exposes tenant fields to the view model', () => {
  const page = parseOnchainTransferPage({items: [{...transfer, tenantId: 'tenant-private'}], nextCursor: null})
  assert.equal(page.items.length, 1)
  assert.equal('tenantId' in page.items[0], false)
  assert.throws(() => parseOnchainTransferPage({items: [transfer], nextCursor: 'not a cursor'}), /nextCursor/)
  assert.throws(() => parseOnchainTransferPage({items: Array.from({length: 101}, () => transfer), nextCursor: null}), /consumer limit/)
})

test('requires an immutable backend card top-up quote and string monetary fields', () => {
  const quote = {
    quoteId: 'topup_quote_001', cardId: 'card_001', sourceWalletAccountId: 'wallet_001',
    assetId: 'flp_asset_usd', currency: 'USD', amount: '25', fees: {grossAmount: '25', platformFee: '0', networkFee: '0', fxFee: '0', netAmount: '25'},
    totalDebitAmount: '25', expiresAt: '2026-08-21T00:05:00.000Z', externalProviderCalled: false,
  }
  assert.equal(parseCardTopupQuote(quote).quoteId, quote.quoteId)
  assert.throws(() => parseCardTopupQuote({...quote, totalDebitAmount: 25}), /totalDebitAmount/)
  assert.throws(() => parseCardTopupQuote({...quote, externalProviderCalled: true}), /remain false/)
})

test('rejects malformed monetary inputs before a preview or quote can create a local command', async () => {
  const gateway = new MockWalletGateway()
  await assert.rejects(() => gateway.previewDeposit({networkId: 'eip155:1', assetId: 'flp_asset_usdt', depositAddressId: 'address_001', grossAmount: '1e2'}), /canonical decimal/)
  await assert.rejects(() => gateway.previewCardTopup('card_001', {sourceWalletAccountId: 'wallet_001', amount: '01'}), /canonical decimal/)
})

test('mock flow requires preview IDs and a quote ID; it never infers a local settlement', async () => {
  const gateway = new MockWalletGateway()
  const selection = {networkId: 'eip155:1', assetId: 'flp_asset_usdt'}
  const preview = await gateway.previewDeposit({...selection, depositAddressId: 'addr_mock_eth_1', grossAmount: '100'})
  const transfer = await gateway.createDepositIntent({...selection, depositAddressId: 'addr_mock_eth_1', grossAmount: '100', previewId: preview.previewId}, 'deposit:00000000-0000-4000-8000-000000000001')
  assert.equal(transfer.state, 'AWAITING_DETECTION')
  await assert.rejects(() => gateway.createDepositIntent({...selection, depositAddressId: 'addr_mock_eth_1', grossAmount: '101', previewId: preview.previewId}, 'deposit:00000000-0000-4000-8000-000000000002'), /preview/)
  const quote = await gateway.previewCardTopup('card_mock_physical', {sourceWalletAccountId: 'wallet_mock_usd', amount: '25'})
  await assert.rejects(() => gateway.topupCard('card_mock_physical', {sourceWalletAccountId: 'wallet_mock_usd', quoteId: 'tampered_quote'}, 'card-topup:00000000-0000-4000-8000-000000000002'), /quote/)
  assert.equal((await gateway.topupCard('card_mock_physical', {sourceWalletAccountId: 'wallet_mock_usd', quoteId: quote.quoteId}, 'card-topup:00000000-0000-4000-8000-000000000003')).status, 'COMPLETED')
  await assert.rejects(() => gateway.topupCard('different_card', {sourceWalletAccountId: 'wallet_mock_usd', quoteId: quote.quoteId}, 'card-topup:00000000-0000-4000-8000-000000000004'), /quote/)
  await assert.rejects(() => gateway.createPhysicalCard({currencyId: 'unknown_currency'}, 'physical-card:00000000-0000-4000-8000-000000000004'), /currencyId/)
  await assert.rejects(() => gateway.createPhysicalCard({currencyId: 'USD'}, 'physical-card:00000000-0000-4000-8000-000000000005'), /currencyId/)
})
