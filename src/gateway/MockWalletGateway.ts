import {
  parseBalanceTriples,
  parseCardOpeningQuote,
  parseCardProducts,
  parseCardTopup,
  parseCardTopupQuote,
  parseDepositAddress,
  parseDepositAddresses,
  parseDepositPreview,
  parseOnchainFxQuote,
  parseOnchainNetworks,
  parseOnchainTransfer,
  parseOnchainTransferPage,
  parseTotalAssets,
  parseWithdrawalAddresses,
  parseWithdrawalPreview,
} from './contracts.ts'
import type {GatewayRequest} from './httpTransport.ts'
import type {
  AddressSelection,
  CardIssueInput,
  CardTopupInput,
  CardTopupQuoteInput,
  DepositIntentInput,
  DepositPreviewInput,
  FxQuoteInputV2,
  OnchainTransferListInput,
  WalletGateway,
  WithdrawalInput,
} from './WalletGateway.ts'

const now = '2026-08-21T08:00:00.000Z'
const activeAddress = {
  addressId: 'addr_mock_eth_1', networkId: 'eip155:1', assetId: 'flp_asset_usdt', assetCode: 'USDT',
  address: '0x1111111111111111111111111111111111111111', caip10AccountId: 'eip155:1:0x1111111111111111111111111111111111111111',
  rotationIndex: 1, status: 'ACTIVE', allocatedAt: now, retiredAt: null, externalProviderCalled: false,
}
const fees = {grossAmount: '101.1', platformFee: '1', networkFee: '0.1', fxFee: '0', netAmount: '100'}
const mockCurrency = (currencyId: string): string => {
  if (currencyId === 'flp_asset_usd') return 'USD'
  if (currencyId === 'flp_asset_usdt') return 'USDT'
  throw new Error('Mock currencyId is not a supported local asset')
}
const transfer = (direction: 'DEPOSIT' | 'WITHDRAWAL', state = direction === 'DEPOSIT' ? 'AWAITING_DETECTION' : 'PENDING_COMPLIANCE') => ({
  transferId: `transfer_mock_${direction.toLowerCase()}`, direction, state, networkId: 'eip155:1', assetId: 'flp_asset_usdt', assetCode: 'USDT',
  fees, confirmations: 0, confirmationTarget: 12, transactionHash: null, approvalRequired: direction === 'WITHDRAWAL',
  complianceStatus: 'PENDING', reversalRequired: false, manualReviewReason: null, externalProviderCalled: false,
  createdAt: now, updatedAt: now,
})

export class MockWalletGateway implements WalletGateway {
  readonly source = 'mock' as const
  private addressHistory: Array<Record<string, unknown>> = [{...activeAddress}]
  private readonly depositPreviews = new Map<string, DepositPreviewInput>()
  private readonly usedDepositPreviews = new Set<string>()
  private readonly depositIntents = new Map<string, {input: DepositIntentInput; transfer: ReturnType<typeof transfer>}>()
  private readonly topupQuotes = new Map<string, {cardId: string; input: CardTopupQuoteInput}>()
  private readonly usedTopupQuotes = new Set<string>()
  private readonly cardTopups = new Map<string, {cardId: string; input: CardTopupInput; receipt: Record<string, unknown>}>()
  private previewSequence = 0
  private topupQuoteSequence = 0

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

  async previewDeposit(input: DepositPreviewInput) {
    const previewId = `deposit_preview_mock_${++this.previewSequence}`
    const preview = parseDepositPreview({
      previewId, depositAddressId: input.depositAddressId,
      networkId: input.networkId, assetId: input.assetId, assetCode: 'USDT',
      fees: {grossAmount: input.grossAmount, platformFee: '0', networkFee: '0', fxFee: '0', netAmount: input.grossAmount},
      confirmationTarget: 12, expiresAt: '2026-08-21T08:05:00.000Z', externalProviderCalled: false,
    })
    this.depositPreviews.set(previewId, {...input})
    return preview
  }

  async createDepositIntent(input: DepositIntentInput, idempotencyKey: string) {
    const previous = this.depositIntents.get(idempotencyKey)
    if (previous) {
      if (JSON.stringify(previous.input) !== JSON.stringify(input)) throw new Error('Mock deposit idempotency conflict')
      return parseOnchainTransfer(previous.transfer)
    }
    const preview = this.depositPreviews.get(input.previewId)
    if (!preview || this.usedDepositPreviews.has(input.previewId) ||
      preview.networkId !== input.networkId || preview.assetId !== input.assetId ||
      preview.depositAddressId !== input.depositAddressId || preview.grossAmount !== input.grossAmount || preview.fxQuoteId !== input.fxQuoteId)
      throw new Error('Mock deposit preview is unavailable')
    this.usedDepositPreviews.add(input.previewId)
    const next = transfer('DEPOSIT')
    this.depositIntents.set(idempotencyKey, {input: {...input}, transfer: next})
    return parseOnchainTransfer(next)
  }
  async depositStatus(_transferId: string) { return parseOnchainTransfer({...transfer('DEPOSIT'), state: 'CONFIRMING', confirmations: 6}) }
  async onchainTransfers(input: OnchainTransferListInput = {}) {
    const items = [transfer('DEPOSIT'), transfer('WITHDRAWAL')]
      .filter((item) => input.direction === undefined || item.direction === input.direction)
      .filter((item) => input.networkId === undefined || item.networkId === input.networkId)
      .filter((item) => input.assetId === undefined || item.assetId === input.assetId)
      .filter((item) => input.state === undefined || item.state === input.state)
    return parseOnchainTransferPage({items, nextCursor: null})
  }

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

  async createPhysicalCard(input: CardIssueInput) {
    return {id: 'card_mock_physical', type: 'PHYSICAL', status: 'PENDING', currency: mockCurrency(input.currencyId), alias: input.alias ?? null}
  }

  async reportCardLost(cardId: string) {
    return {id: `${cardId}_replacement`, type: 'PHYSICAL', status: 'PENDING'}
  }

  async previewCardTopup(cardId: string, input: CardTopupQuoteInput) {
    const quoteId = `topup_quote_mock_${++this.topupQuoteSequence}`
    const quote = parseCardTopupQuote({
      quoteId, cardId, sourceWalletAccountId: input.sourceWalletAccountId,
      assetId: 'flp_asset_usd', currency: 'USD', amount: input.amount,
      fees: {grossAmount: input.amount, platformFee: '0', networkFee: '0', fxFee: '0', netAmount: input.amount},
      totalDebitAmount: input.amount, expiresAt: '2026-08-21T08:05:00.000Z', externalProviderCalled: false,
    })
    this.topupQuotes.set(quoteId, {cardId, input: {...input}})
    return quote
  }

  async topupCard(cardId: string, input: CardTopupInput, idempotencyKey: string) {
    const previous = this.cardTopups.get(idempotencyKey)
    if (previous) {
      if (previous.cardId !== cardId || JSON.stringify(previous.input) !== JSON.stringify(input)) throw new Error('Mock Card top-up idempotency conflict')
      return parseCardTopup(previous.receipt)
    }
    const quote = this.topupQuotes.get(input.quoteId)
    if (!quote || this.usedTopupQuotes.has(input.quoteId) || quote.cardId !== cardId || quote.input.sourceWalletAccountId !== input.sourceWalletAccountId)
      throw new Error('Mock card top-up quote is unavailable')
    this.usedTopupQuotes.add(input.quoteId)
    const receipt = {operationId: `operation_mock_topup_${input.quoteId}`, cardId, assetId: 'flp_asset_usd', currency: 'USD', amount: quote.input.amount, availableBalanceMinor: '2500', status: 'COMPLETED', externalProviderCalled: false}
    this.cardTopups.set(idempotencyKey, {cardId, input: {...input}, receipt})
    return parseCardTopup(receipt)
  }
}
