import {
  parseBalanceTriples,
  parseCardOpeningQuote,
  parseCardProducts,
  parseCardTopup,
  parseDepositAddress,
  parseDepositAddresses,
  parseOnchainFxQuote,
  parseOnchainNetworks,
  parseOnchainTransfer,
  parseTotalAssets,
  parseWithdrawalAddresses,
  parseWithdrawalPreview,
} from './contracts.ts'
import type {GatewayRequest} from './httpTransport.ts'
import type {AddressSelection, DepositIntentInput, FxQuoteInputV2, WalletGateway, WithdrawalInput} from './WalletGateway.ts'

const now = '2026-08-21T08:00:00.000Z'
const activeAddress = {
  addressId: 'addr_mock_eth_1', networkId: 'eip155:1', assetId: 'flp_asset_usdt', assetCode: 'USDT',
  address: '0x1111111111111111111111111111111111111111', caip10AccountId: 'eip155:1:0x1111111111111111111111111111111111111111',
  rotationIndex: 1, status: 'ACTIVE', allocatedAt: now, retiredAt: null, externalProviderCalled: false,
}
const fees = {grossAmount: '101.1', platformFee: '1', networkFee: '0.1', fxFee: '0', netAmount: '100'}
const transfer = (direction: 'DEPOSIT' | 'WITHDRAWAL', state = direction === 'DEPOSIT' ? 'AWAITING_DETECTION' : 'PENDING_COMPLIANCE') => ({
  transferId: `transfer_mock_${direction.toLowerCase()}`, direction, state, networkId: 'eip155:1', assetId: 'flp_asset_usdt', assetCode: 'USDT',
  fees, confirmations: 0, confirmationTarget: 12, transactionHash: null, approvalRequired: direction === 'WITHDRAWAL',
  complianceStatus: 'PENDING', reversalRequired: false, manualReviewReason: null, externalProviderCalled: false,
  createdAt: now, updatedAt: now,
})

export class MockWalletGateway implements WalletGateway {
  readonly source = 'mock' as const
  private addressHistory: Array<Record<string, unknown>> = [{...activeAddress}]

  async request<T>(input: GatewayRequest): Promise<T> {
    if (input.path === '/v1/auth/logout') return undefined as T
    if (['/v1/auth/login', '/v1/auth/register', '/v1/auth/refresh', '/v1/session'].includes(input.path)) {
      return {actorId: 'actor_mock', tenantId: 'tenant-a', customerId: 'customer_mock', environment: 'SANDBOX', expiresAt: '2026-08-22T08:00:00.000Z'} as T
    }
    throw new Error(`MockWalletGateway has no raw fixture for ${input.method ?? 'GET'} ${input.path}`)
  }

  async totalAssets() {
    return parseTotalAssets({
      valuationAssetId: 'flp_asset_usd', valuationAssetCode: 'USD', totalLedgerValue: '1250', totalAvailableValue: '1000',
      valuationMode: 'SANDBOX_REFERENCE', externalProviderCalled: false,
      items: [{assetId: 'flp_asset_usdt', assetCode: 'USDT', assetClass: 'DIGITAL', ledgerBalance: '1250', availableBalance: '1000', valuationRate: '1', ledgerValue: '1250', availableValue: '1000', updatedAt: now}],
    })
  }

  async balanceTriples() {
    return parseBalanceTriples({items: [{assetCode: 'USDT', ledgerBalance: '1250', pendingBalance: '250', availableBalance: '1000', updatedAt: now}]})
  }

  async onchainNetworks() {
    return parseOnchainNetworks({environment: 'SANDBOX', items: [
      {caip2Id: 'eip155:1', displayName: 'Ethereum', confirmationTarget: 12, executionMode: 'EXTERNAL_CUSTODY_CONTRACT_ONLY', externalProviderCalled: false},
      {caip2Id: 'eip155:56', displayName: 'BNB Smart Chain', confirmationTarget: 15, executionMode: 'EXTERNAL_CUSTODY_CONTRACT_ONLY', externalProviderCalled: false},
    ]})
  }

  async depositAddresses(selection: AddressSelection) {
    return parseDepositAddresses({items: this.addressHistory.filter((item) => item.networkId === selection.networkId && item.assetId === selection.assetId)})
  }

  async allocateDepositAddress(selection: AddressSelection) {
    const active = this.addressHistory.find((item) => item.networkId === selection.networkId && item.assetId === selection.assetId && item.status === 'ACTIVE')
    if (active) return parseDepositAddress(active)
    const allocated = {...activeAddress, networkId: selection.networkId, assetId: selection.assetId}
    this.addressHistory.push(allocated)
    return parseDepositAddress(allocated)
  }

  async rotateDepositAddress(addressId: string) {
    const current = this.addressHistory.find((item) => item.addressId === addressId && item.status === 'ACTIVE')
    if (!current) throw new Error('Mock deposit address is not active')
    current.status = 'RETIRED'
    current.retiredAt = now
    const rotated = {...activeAddress, addressId: 'addr_mock_eth_2', address: '0x2222222222222222222222222222222222222222', caip10AccountId: 'eip155:1:0x2222222222222222222222222222222222222222', rotationIndex: 2}
    this.addressHistory.push(rotated)
    return parseDepositAddress(rotated)
  }

  async createOnchainQuote(input: FxQuoteInputV2) {
    return parseOnchainFxQuote({quoteId: 'quote_mock_1', ...input, targetAmount: input.sourceAmount, rate: '1', fxFee: '0', expiresAt: '2026-08-21T08:05:00.000Z', externalProviderCalled: false})
  }

  async createDepositIntent(_input: DepositIntentInput, _idempotencyKey: string) { return parseOnchainTransfer(transfer('DEPOSIT')) }
  async depositStatus(_transferId: string) { return parseOnchainTransfer({...transfer('DEPOSIT'), state: 'CONFIRMING', confirmations: 6}) }

  async withdrawalAddresses() {
    return parseWithdrawalAddresses({items: [{id: 'book_mock_1', assetId: 'flp_asset_usdt', assetCode: 'USDT', networkId: 'eip155:1', address: '0x3333333333333333333333333333333333333333', label: 'Primary', isDefault: true, createdAt: '2026-08-21T07:40:00.000Z'}]})
  }

  async previewWithdrawal(_input: WithdrawalInput) {
    return parseWithdrawalPreview({fees, approvalThreshold: '1000', approvalRequired: true, addressCoolingPeriodSeconds: 600, addressEligibleAt: '2026-08-21T07:50:00.000Z', complianceGateEnabled: true, externalProviderCalled: false})
  }

  async submitWithdrawal(_input: WithdrawalInput, _idempotencyKey: string) { return parseOnchainTransfer(transfer('WITHDRAWAL')) }
  async withdrawalStatus(_transferId: string) { return parseOnchainTransfer(transfer('WITHDRAWAL')) }

  async cardProducts() {
    return parseCardProducts({products: [{templateId: 'product_physical_usd', assetId: 'flp_asset_usd', cardType: 'PHYSICAL', currency: 'USD', openingFee: '6', monthlyFee: '1.5'}]})
  }

  async cardOpeningQuote(productTemplateId: string) {
    return parseCardOpeningQuote({productTemplateId, assetId: 'flp_asset_usd', cardType: 'PHYSICAL', currency: 'USD', openingFee: '6', effectiveFees: {}, externalProviderCalled: false})
  }

  async createPhysicalCard(input: {currency: string; alias?: string}) {
    return {id: 'card_mock_physical', type: 'PHYSICAL', status: 'PENDING', currency: input.currency, alias: input.alias ?? null}
  }

  async reportCardLost(cardId: string) {
    return {id: `${cardId}_replacement`, type: 'PHYSICAL', status: 'PENDING'}
  }

  async topupCard(cardId: string, input: {sourceWalletAccountId: string; amount: string}) {
    return parseCardTopup({operationId: 'operation_mock_topup', cardId, assetId: 'flp_asset_usd', currency: 'USD', amount: input.amount, availableBalanceMinor: '2500', status: 'COMPLETED', externalProviderCalled: false})
  }
}
