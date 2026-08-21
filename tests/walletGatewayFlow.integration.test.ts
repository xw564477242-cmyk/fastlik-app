import assert from 'node:assert/strict'
import test from 'node:test'
import {MockWalletGateway} from '../src/gateway/MockWalletGateway.ts'

test('runs the preview deposit, withdrawal and Card flow through the shared Gateway contract', async () => {
  const gateway = new MockWalletGateway()
  const selection = {networkId: 'eip155:1', assetId: 'flp_asset_usdt'}

  const networks = await gateway.onchainNetworks()
  assert.deepEqual(networks.map((item) => [item.caip2Id, item.confirmationTarget]), [['eip155:1', 12], ['eip155:56', 15]])

  const first = await gateway.allocateDepositAddress(selection)
  const rotated = await gateway.rotateDepositAddress(first.addressId)
  const history = await gateway.depositAddresses(selection)
  assert.equal(rotated.status, 'ACTIVE')
  assert.deepEqual(history.map((item) => item.status), ['RETIRED', 'ACTIVE'])

  const deposit = await gateway.createDepositIntent({...selection, depositAddressId: rotated.addressId, grossAmount: '100'}, 'deposit:00000000-0000-4000-8000-000000000001')
  assert.equal(deposit.state, 'AWAITING_DETECTION')
  assert.equal((await gateway.depositStatus(deposit.transferId)).state, 'CONFIRMING')

  const addressBook = await gateway.withdrawalAddresses()
  const preview = await gateway.previewWithdrawal({...selection, withdrawalAddressId: addressBook[0].id, netAmount: '100'})
  assert.equal(preview.approvalThreshold, '1000')
  assert.equal(preview.addressCoolingPeriodSeconds, 600)
  assert.equal(preview.complianceGateEnabled, true)
  const withdrawal = await gateway.submitWithdrawal({...selection, withdrawalAddressId: addressBook[0].id, netAmount: '100'}, 'withdrawal:00000000-0000-4000-8000-000000000002')
  assert.equal(withdrawal.state, 'PENDING_COMPLIANCE')

  const products = await gateway.cardProducts()
  const quote = await gateway.cardOpeningQuote(products[0].templateId)
  assert.equal(quote.assetId, products[0].assetId)
  const issued = await gateway.createPhysicalCard({currency: products[0].currency, alias: 'Travel'}, 'physical-card:00000000-0000-4000-8000-000000000003') as {status: string}
  assert.equal(issued.status, 'PENDING')
  const topup = await gateway.topupCard('card_mock_physical', {sourceWalletAccountId: 'wallet_mock_usd', amount: '25'}, 'card-topup:00000000-0000-4000-8000-000000000004')
  assert.equal(topup.status, 'COMPLETED')
  assert.equal(topup.amount, '25')
})
