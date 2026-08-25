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
} from './contracts'
import type {GatewayRequest} from './httpTransport'
import {walletHttpRequest} from './httpTransport'
import {API_V1, ONCHAIN_V2} from './WalletGateway'
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
} from './WalletGateway'

const query = (values: Record<string, string>) => new URLSearchParams(values).toString()
const encoded = (value: string) => encodeURIComponent(value)
const decimalInput = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,35})(?:\.\d{1,18})?$/.test(value))
    throw new Error(`${name} must be a canonical decimal string`)
  return value
}
const localCurrencyId = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{2,128}$/.test(value) || /^[A-Z]{3}$/.test(value)) throw new Error('currencyId is invalid')
  return value
}

const onchainTransferQuery = (input: OnchainTransferListInput = {}): string => {
  const limit = input.limit ?? 25
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Onchain transfer list limit must be between 1 and 100')
  if (input.cursor !== undefined && (input.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(input.cursor))) throw new Error('Onchain transfer list cursor is invalid')
  const values: Record<string, string> = {limit: String(limit)}
  if (input.direction !== undefined) values.direction = input.direction
  if (input.networkId !== undefined) values.networkId = input.networkId
  if (input.assetId !== undefined) values.assetId = input.assetId
  if (input.state !== undefined) values.state = input.state
  if (input.cursor !== undefined) values.cursor = input.cursor
  return query(values)
}

export class HttpWalletGateway implements WalletGateway {
  readonly source = 'backend' as const

  request<T>(input: GatewayRequest): Promise<T> {
    return walletHttpRequest<T>(input)
  }

  async totalAssets(signal?: AbortSignal) {
    return parseTotalAssets(await this.request({path: `${API_V1}/wallet/total-assets?valuationAssetId=flp_asset_usd`, signal}))
  }

  async balanceTriples(signal?: AbortSignal) {
    return parseBalanceTriples(await this.request({path: `${API_V1}/wallet/balances`, signal}))
  }

  async onchainNetworks(signal?: AbortSignal) {
    return parseOnchainNetworks(await this.request({path: `${ONCHAIN_V2}/networks`, signal}))
  }

  async depositAddresses(selection: AddressSelection, signal?: AbortSignal) {
    return parseDepositAddresses(await this.request({
      path: `${ONCHAIN_V2}/deposit-addresses?${query(selection)}`,
      signal,
    }))
  }

  async allocateDepositAddress(selection: AddressSelection, signal?: AbortSignal) {
    return parseDepositAddress(await this.request({path: `${ONCHAIN_V2}/deposit-addresses`, method: 'POST', body: selection, signal}))
  }

  async rotateDepositAddress(addressId: string, signal?: AbortSignal) {
    return parseDepositAddress(await this.request({path: `${ONCHAIN_V2}/deposit-addresses/${encoded(addressId)}/rotate`, method: 'POST', signal}))
  }

  async createOnchainQuote(input: FxQuoteInputV2, signal?: AbortSignal) {
    return parseOnchainFxQuote(await this.request({path: `${ONCHAIN_V2}/fx/quotes`, method: 'POST', body: input, signal}))
  }

  async previewDeposit(input: DepositPreviewInput, signal?: AbortSignal) {
    const body = {...input, grossAmount: decimalInput(input.grossAmount, 'deposit grossAmount')}
    return parseDepositPreview(await this.request({path: `${ONCHAIN_V2}/deposits/preview`, method: 'POST', body, signal}))
  }

  async createDepositIntent(input: DepositIntentInput, idempotencyKey: string, signal?: AbortSignal) {
    const body = {...input, grossAmount: decimalInput(input.grossAmount, 'deposit grossAmount')}
    return parseOnchainTransfer(await this.request({path: `${ONCHAIN_V2}/deposits`, method: 'POST', body, idempotencyKey, signal}))
  }

  async depositStatus(transferId: string, signal?: AbortSignal) {
    return parseOnchainTransfer(await this.request({path: `${ONCHAIN_V2}/deposits/${encoded(transferId)}`, signal}))
  }

  async onchainTransfers(input: OnchainTransferListInput = {}, signal?: AbortSignal) {
    return parseOnchainTransferPage(await this.request({path: `${ONCHAIN_V2}/transactions?${onchainTransferQuery(input)}`, signal}))
  }

  async withdrawalAddresses(signal?: AbortSignal) {
    return parseWithdrawalAddresses(await this.request({path: `${API_V1}/wallet/withdrawal-addresses`, signal}))
  }

  async previewWithdrawal(input: WithdrawalInput, signal?: AbortSignal) {
    return parseWithdrawalPreview(await this.request({path: `${ONCHAIN_V2}/withdrawals/preview`, method: 'POST', body: input, signal}))
  }

  async submitWithdrawal(input: WithdrawalInput, idempotencyKey: string, signal?: AbortSignal) {
    return parseOnchainTransfer(await this.request({path: `${ONCHAIN_V2}/withdrawals`, method: 'POST', body: input, idempotencyKey, signal}))
  }

  async withdrawalStatus(transferId: string, signal?: AbortSignal) {
    return parseOnchainTransfer(await this.request({path: `${ONCHAIN_V2}/withdrawals/${encoded(transferId)}`, signal}))
  }

  async cardProducts(signal?: AbortSignal) {
    return parseCardProducts(await this.request({path: `${API_V1}/cards/products`, signal}))
  }

  async cardOpeningQuote(productTemplateId: string, signal?: AbortSignal) {
    return parseCardOpeningQuote(await this.request({path: `${API_V1}/cards/opening-quotes`, method: 'POST', body: {productTemplateId}, signal}))
  }

  createPhysicalCard(input: CardIssueInput, idempotencyKey: string, signal?: AbortSignal) {
    return this.request({path: `${API_V1}/cards/physical`, method: 'POST', body: {...input, currencyId: localCurrencyId(input.currencyId)}, idempotencyKey, signal})
  }

  reportCardLost(cardId: string, idempotencyKey: string, signal?: AbortSignal) {
    return this.request({path: `${API_V1}/cards/${encoded(cardId)}/report-lost`, method: 'POST', idempotencyKey, signal})
  }

  async previewCardTopup(cardId: string, input: CardTopupQuoteInput, signal?: AbortSignal) {
    const body = {...input, amount: decimalInput(input.amount, 'Card top-up amount')}
    return parseCardTopupQuote(await this.request({path: `${API_V1}/cards/${encoded(cardId)}/topup-quotes`, method: 'POST', body, signal}))
  }

  async topupCard(cardId: string, input: CardTopupInput, idempotencyKey: string, signal?: AbortSignal) {
    return parseCardTopup(await this.request({path: `${API_V1}/cards/${encoded(cardId)}/topups`, method: 'POST', body: input, idempotencyKey, signal}))
  }
}
