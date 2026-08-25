import type {
  CardOpeningQuote,
  CardTopupQuote,
  CardProduct,
  CardTopupReceipt,
  OnchainDepositAddress,
  OnchainDepositPreview,
  OnchainFxQuote,
  OnchainNetwork,
  OnchainTransfer,
  OnchainTransferPage,
  OnchainWithdrawalPreview,
  TotalAssets,
  WalletBalanceTriple,
  WithdrawalAddress,
} from './contracts'
import type {GatewayRequest} from './httpTransport'

export const API_V1 = '/v1' as const
export const ONCHAIN_V2 = '/v2/wallet/onchain' as const

export type AddressSelection = {networkId: string; assetId: string}
export type DepositPreviewInput = AddressSelection & {depositAddressId: string; grossAmount: string; fxQuoteId?: string}
export type DepositIntentInput = DepositPreviewInput & {previewId: string}
export type WithdrawalInput = AddressSelection & {withdrawalAddressId: string; netAmount: string; fxQuoteId?: string}
export type FxQuoteInputV2 = {sourceAssetId: string; targetAssetId: string; sourceAmount: string}
export type OnchainTransferListInput = {
  direction?: OnchainTransfer['direction']
  networkId?: string
  assetId?: string
  state?: OnchainTransfer['state']
  cursor?: string
  limit?: number
}
export type CardIssueInput = {currencyId: string; alias?: string}
export type CardTopupQuoteInput = {sourceWalletAccountId: string; amount: string}
export type CardTopupInput = {sourceWalletAccountId: string; quoteId: string}

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
  previewDeposit(input: DepositPreviewInput, signal?: AbortSignal): Promise<OnchainDepositPreview>
  createDepositIntent(input: DepositIntentInput, idempotencyKey: string, signal?: AbortSignal): Promise<OnchainTransfer>
  depositStatus(transferId: string, signal?: AbortSignal): Promise<OnchainTransfer>
  onchainTransfers(input?: OnchainTransferListInput, signal?: AbortSignal): Promise<OnchainTransferPage>
  withdrawalAddresses(signal?: AbortSignal): Promise<WithdrawalAddress[]>
  previewWithdrawal(input: WithdrawalInput, signal?: AbortSignal): Promise<OnchainWithdrawalPreview>
  submitWithdrawal(input: WithdrawalInput, idempotencyKey: string, signal?: AbortSignal): Promise<OnchainTransfer>
  withdrawalStatus(transferId: string, signal?: AbortSignal): Promise<OnchainTransfer>
  cardProducts(signal?: AbortSignal): Promise<CardProduct[]>
  cardOpeningQuote(productTemplateId: string, signal?: AbortSignal): Promise<CardOpeningQuote>
  createPhysicalCard(input: CardIssueInput, idempotencyKey: string, signal?: AbortSignal): Promise<unknown>
  reportCardLost(cardId: string, idempotencyKey: string, signal?: AbortSignal): Promise<unknown>
  previewCardTopup(cardId: string, input: CardTopupQuoteInput, signal?: AbortSignal): Promise<CardTopupQuote>
  topupCard(cardId: string, input: CardTopupInput, idempotencyKey: string, signal?: AbortSignal): Promise<CardTopupReceipt>
}
