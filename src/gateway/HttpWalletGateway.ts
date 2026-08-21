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
} from './contracts'
import type {GatewayRequest} from './httpTransport'
import {walletHttpRequest} from './httpTransport'
import {API_V1, ONCHAIN_V2} from './WalletGateway'
import type {AddressSelection, DepositIntentInput, FxQuoteInputV2, WalletGateway, WithdrawalInput} from './WalletGateway'

const query = (values: Record<string, string>) => new URLSearchParams(values).toString()
const encoded = (value: string) => encodeURIComponent(value)

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

  async createDepositIntent(input: DepositIntentInput, idempotencyKey: string, signal?: AbortSignal) {
    return parseOnchainTransfer(await this.request({path: `${ONCHAIN_V2}/deposits`, method: 'POST', body: input, idempotencyKey, signal}))
  }

  async depositStatus(transferId: string, signal?: AbortSignal) {
    return parseOnchainTransfer(await this.request({path: `${ONCHAIN_V2}/deposits/${encoded(transferId)}`, signal}))
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

  createPhysicalCard(input: {currency: string; alias?: string}, idempotencyKey: string, signal?: AbortSignal) {
    return this.request({path: `${API_V1}/cards/physical`, method: 'POST', body: input, idempotencyKey, signal})
  }

  reportCardLost(cardId: string, idempotencyKey: string, signal?: AbortSignal) {
    return this.request({path: `${API_V1}/cards/${encoded(cardId)}/report-lost`, method: 'POST', idempotencyKey, signal})
  }

  async topupCard(cardId: string, input: {sourceWalletAccountId: string; amount: string}, idempotencyKey: string, signal?: AbortSignal) {
    return parseCardTopup(await this.request({path: `${API_V1}/cards/${encoded(cardId)}/topups`, method: 'POST', body: input, idempotencyKey, signal}))
  }
}
