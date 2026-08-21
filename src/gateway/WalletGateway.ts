import type {
  CardOpeningQuote,
  CardProduct,
  CardTopupReceipt,
  OnchainDepositAddress,
  OnchainFxQuote,
  OnchainNetwork,
  OnchainTransfer,
  OnchainWithdrawalPreview,
  TotalAssets,
  WalletBalanceTriple,
  WithdrawalAddress,
} from './contracts'
import type {GatewayRequest} from './httpTransport'

export const API_V1 = '/v1' as const
export const ONCHAIN_V2 = '/v2/wallet/onchain' as const

export type AddressSelection = {networkId: string; assetId: string}
export type DepositIntentInput = AddressSelection & {depositAddressId: string; grossAmount: string; fxQuoteId?: string}
export type WithdrawalInput = AddressSelection & {withdrawalAddressId: string; netAmount: string; fxQuoteId?: string}
export type FxQuoteInputV2 = {sourceAssetId: string; targetAssetId: string; sourceAmount: string}

export interface WalletGateway {
  readonly source: 'backend' | 'mock'
  request<T>(input: GatewayRequest): Promise<T>
  totalAssets(signal?: AbortSignal): Promise<TotalAssets>
  balanceTriples(signal?: AbortSignal): Promise<WalletBalanceTriple[]>
  onchainNetworks(signal?: AbortSignal): Promise<OnchainNetwork[]>
  depositAddresses(selection: AddressSelection, signal?: AbortSignal): Promise<OnchainDepositAddress[]>
  allocateDepositAddress(selection: AddressSelection, signal?: AbortSignal): Promise<OnchainDepositAddress>
  rotateDepositAddress(addressId: string, signal?: AbortSignal): Promise<OnchainDepositAddress>
  createOnchainQuote(input: FxQuoteInputV2, signal?: AbortSignal): Promise<OnchainFxQuote>
  createDepositIntent(input: DepositIntentInput, idempotencyKey: string, signal?: AbortSignal): Promise<OnchainTransfer>
  depositStatus(transferId: string, signal?: AbortSignal): Promise<OnchainTransfer>
  withdrawalAddresses(signal?: AbortSignal): Promise<WithdrawalAddress[]>
  previewWithdrawal(input: WithdrawalInput, signal?: AbortSignal): Promise<OnchainWithdrawalPreview>
  submitWithdrawal(input: WithdrawalInput, idempotencyKey: string, signal?: AbortSignal): Promise<OnchainTransfer>
  withdrawalStatus(transferId: string, signal?: AbortSignal): Promise<OnchainTransfer>
  cardProducts(signal?: AbortSignal): Promise<CardProduct[]>
  cardOpeningQuote(productTemplateId: string, signal?: AbortSignal): Promise<CardOpeningQuote>
  createPhysicalCard(input: {currency: string; alias?: string}, idempotencyKey: string, signal?: AbortSignal): Promise<unknown>
  reportCardLost(cardId: string, idempotencyKey: string, signal?: AbortSignal): Promise<unknown>
  topupCard(cardId: string, input: {sourceWalletAccountId: string; amount: string}, idempotencyKey: string, signal?: AbortSignal): Promise<CardTopupReceipt>
}
