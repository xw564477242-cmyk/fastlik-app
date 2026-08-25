export type DecimalString = string

export type WalletDataSource = 'backend' | 'mock'
export type WalletAssetClass = 'FIAT' | 'DIGITAL'
export type WalletAccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED'

export type WalletBalanceTriple = {
  assetCode: string
  ledgerBalance: DecimalString
  pendingBalance: DecimalString
  availableBalance: DecimalString
  status?: WalletAccountStatus
  updatedAt: string
}

export type TotalAssetItem = {
  assetId: string
  assetCode: string
  assetClass: WalletAssetClass
  ledgerBalance: DecimalString
  availableBalance: DecimalString
  valuationRate: DecimalString
  ledgerValue: DecimalString
  availableValue: DecimalString
  updatedAt: string
}

export type TotalAssets = {
  valuationAssetId: string
  valuationAssetCode: string
  totalLedgerValue: DecimalString
  totalAvailableValue: DecimalString
  valuationMode: 'SANDBOX_REFERENCE'
  externalProviderCalled: false
  items: TotalAssetItem[]
}

export type OnchainNetwork = {
  caip2Id: string
  displayName: string
  confirmationTarget: number
  executionMode: 'EXTERNAL_CUSTODY_CONTRACT_ONLY'
  externalProviderCalled: false
}

export type OnchainDepositAddress = {
  addressId: string
  networkId: string
  assetId: string
  assetCode: string
  address: string
  caip10AccountId: string
  rotationIndex: number
  status: 'ACTIVE' | 'RETIRED'
  allocatedAt: string
  retiredAt: string | null
  externalProviderCalled: false
}

export type OnchainFeeBreakdown = {
  grossAmount: DecimalString
  platformFee: DecimalString
  networkFee: DecimalString
  fxFee: DecimalString
  netAmount: DecimalString
}

export type OnchainTransferState =
  | 'AWAITING_DETECTION'
  | 'DETECTED'
  | 'CONFIRMING'
  | 'VALIDATING'
  | 'PENDING_COMPLIANCE'
  | 'PENDING_APPROVAL'
  | 'QUEUED'
  | 'BROADCASTED'
  | 'CONFIRMED'
  | 'SETTLED'
  | 'REORGED'
  | 'FAILED'

export type OnchainTransfer = {
  transferId: string
  direction: 'DEPOSIT' | 'WITHDRAWAL'
  state: OnchainTransferState
  networkId: string
  assetId: string
  assetCode: string
  fees: OnchainFeeBreakdown
  confirmations: number
  confirmationTarget: number
  transactionHash: string | null
  approvalRequired: boolean
  complianceStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  reversalRequired: boolean
  manualReviewReason: string | null
  externalProviderCalled: false
  createdAt: string
  updatedAt: string
}

export type OnchainWithdrawalPreview = {
  fees: OnchainFeeBreakdown
  approvalThreshold: DecimalString
  approvalRequired: boolean
  addressCoolingPeriodSeconds: number
  addressEligibleAt: string
  complianceGateEnabled: true
  externalProviderCalled: false
}

/**
 * Backend-calculated deposit facts. A preview is never a credit, reservation,
 * or proof that a chain transaction has been detected.
 */
export type OnchainDepositPreview = {
  previewId: string
  depositAddressId: string
  networkId: string
  assetId: string
  assetCode: string
  fees: OnchainFeeBreakdown
  confirmationTarget: number
  expiresAt: string
  externalProviderCalled: false
}

/** A tenant-scoped, opaque-cursor page of persisted onchain transfers. */
export type OnchainTransferPage = {
  items: OnchainTransfer[]
  nextCursor: string | null
}

export type OnchainFxQuote = {
  quoteId: string
  sourceAssetId: string
  targetAssetId: string
  sourceAmount: DecimalString
  targetAmount: DecimalString
  rate: DecimalString
  fxFee: DecimalString
  expiresAt: string
  externalProviderCalled: false
}

export type WithdrawalAddress = {
  id: string
  assetId: string
  assetCode: string
  networkId: string
  address: string
  label: string
  isDefault: boolean
  createdAt: string
}

export type CardProduct = {
  templateId: string
  assetId: string
  cardType: 'VIRTUAL' | 'PHYSICAL'
  currency: string
  openingFee: DecimalString
  monthlyFee: DecimalString
}

export type CardOpeningQuote = {
  templateId: string
  assetId: string
  cardType: 'VIRTUAL' | 'PHYSICAL'
  currency: string
  openingFee: DecimalString
  externalProviderCalled: false
  effectiveFees: Record<string, unknown>
}

export type CardTopupReceipt = {
  operationId: string
  cardId: string
  assetId: string
  currency: string
  amount: DecimalString
  availableBalanceMinor: string
  status: 'COMPLETED'
  externalProviderCalled: false
}

/**
 * An immutable backend quote for moving funds from one owned wallet account to
 * one card. The browser must submit the quote ID unchanged; it must not derive
 * fees, debit totals, or expiry itself.
 */
export type CardTopupQuote = {
  quoteId: string
  cardId: string
  sourceWalletAccountId: string
  assetId: string
  currency: string
  amount: DecimalString
  fees: OnchainFeeBreakdown
  totalDebitAmount: DecimalString
  expiresAt: string
  externalProviderCalled: false
}

const record = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}
const string = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
  return value
}
const decimalString = (value: unknown, name: string): DecimalString => {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,35})(?:\.\d{1,18})?$/.test(value))
    throw new Error(`${name} must be a canonical decimal string`)
  return value
}
const nullableString = (value: unknown, name: string): string | null => value === null ? null : string(value, name)
const bool = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`)
  return value
}
const integer = (value: unknown, name: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${name} must be a non-negative integer`)
  return value as number
}
const array = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
  return value
}
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], name: string): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${name} is invalid`)
  return value as T
}
const falseOnly = (value: unknown, name: string): false => {
  if (value !== false) throw new Error(`${name} must remain false`)
  return false
}

export const parseFeeBreakdown = (value: unknown): OnchainFeeBreakdown => {
  const input = record(value, 'fees')
  return {
    grossAmount: decimalString(input.grossAmount, 'fees.grossAmount'),
    platformFee: decimalString(input.platformFee, 'fees.platformFee'),
    networkFee: decimalString(input.networkFee, 'fees.networkFee'),
    fxFee: decimalString(input.fxFee, 'fees.fxFee'),
    netAmount: decimalString(input.netAmount, 'fees.netAmount'),
  }
}

export const parseTotalAssets = (value: unknown): TotalAssets => {
  const input = record(value, 'total assets')
  return {
    valuationAssetId: string(input.valuationAssetId, 'valuationAssetId'),
    valuationAssetCode: string(input.valuationAssetCode, 'valuationAssetCode'),
    totalLedgerValue: string(input.totalLedgerValue, 'totalLedgerValue'),
    totalAvailableValue: string(input.totalAvailableValue, 'totalAvailableValue'),
    valuationMode: oneOf(input.valuationMode, ['SANDBOX_REFERENCE'] as const, 'valuationMode'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
    items: array(input.items, 'items').map((item, index) => {
      const entry = record(item, `items[${index}]`)
      return {
        assetId: string(entry.assetId, 'assetId'),
        assetCode: string(entry.assetCode, 'assetCode'),
        assetClass: oneOf(entry.assetClass, ['FIAT', 'DIGITAL'] as const, 'assetClass'),
        ledgerBalance: string(entry.ledgerBalance, 'ledgerBalance'),
        availableBalance: string(entry.availableBalance, 'availableBalance'),
        valuationRate: string(entry.valuationRate, 'valuationRate'),
        ledgerValue: string(entry.ledgerValue, 'ledgerValue'),
        availableValue: string(entry.availableValue, 'availableValue'),
        updatedAt: string(entry.updatedAt, 'updatedAt'),
      }
    }),
  }
}

export const parseBalanceTriples = (value: unknown): WalletBalanceTriple[] => {
  const input = record(value, 'balance summary')
  return array(input.items, 'items').map((item, index) => {
    const entry = record(item, `items[${index}]`)
    return {
      assetCode: string(entry.assetCode, 'assetCode'),
      ledgerBalance: string(entry.ledgerBalance, 'ledgerBalance'),
      pendingBalance: string(entry.pendingBalance, 'pendingBalance'),
      availableBalance: string(entry.availableBalance, 'availableBalance'),
      updatedAt: string(entry.updatedAt, 'updatedAt'),
    }
  })
}

export const parseOnchainNetworks = (value: unknown): OnchainNetwork[] => {
  const input = record(value, 'network directory')
  return array(input.items, 'items').map((item, index) => {
    const entry = record(item, `items[${index}]`)
    return {
      caip2Id: string(entry.caip2Id, 'caip2Id'),
      displayName: string(entry.displayName, 'displayName'),
      confirmationTarget: integer(entry.confirmationTarget, 'confirmationTarget'),
      executionMode: oneOf(entry.executionMode, ['EXTERNAL_CUSTODY_CONTRACT_ONLY'] as const, 'executionMode'),
      externalProviderCalled: falseOnly(entry.externalProviderCalled, 'externalProviderCalled'),
    }
  })
}

export const parseDepositAddress = (value: unknown): OnchainDepositAddress => {
  const input = record(value, 'deposit address')
  return {
    addressId: string(input.addressId, 'addressId'),
    networkId: string(input.networkId, 'networkId'),
    assetId: string(input.assetId, 'assetId'),
    assetCode: string(input.assetCode, 'assetCode'),
    address: string(input.address, 'address'),
    caip10AccountId: string(input.caip10AccountId, 'caip10AccountId'),
    rotationIndex: integer(input.rotationIndex, 'rotationIndex'),
    status: oneOf(input.status, ['ACTIVE', 'RETIRED'] as const, 'status'),
    allocatedAt: string(input.allocatedAt, 'allocatedAt'),
    retiredAt: nullableString(input.retiredAt, 'retiredAt'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}

export const parseDepositAddresses = (value: unknown): OnchainDepositAddress[] => {
  const input = record(value, 'deposit address list')
  return array(input.items, 'items').map(parseDepositAddress)
}

const TRANSFER_STATES = ['AWAITING_DETECTION', 'DETECTED', 'CONFIRMING', 'VALIDATING', 'PENDING_COMPLIANCE', 'PENDING_APPROVAL', 'QUEUED', 'BROADCASTED', 'CONFIRMED', 'SETTLED', 'REORGED', 'FAILED'] as const

export const parseOnchainTransfer = (value: unknown): OnchainTransfer => {
  const input = record(value, 'onchain transfer')
  return {
    transferId: string(input.transferId, 'transferId'),
    direction: oneOf(input.direction, ['DEPOSIT', 'WITHDRAWAL'] as const, 'direction'),
    state: oneOf(input.state, TRANSFER_STATES, 'state'),
    networkId: string(input.networkId, 'networkId'),
    assetId: string(input.assetId, 'assetId'),
    assetCode: string(input.assetCode, 'assetCode'),
    fees: parseFeeBreakdown(input.fees),
    confirmations: integer(input.confirmations, 'confirmations'),
    confirmationTarget: integer(input.confirmationTarget, 'confirmationTarget'),
    transactionHash: nullableString(input.transactionHash, 'transactionHash'),
    approvalRequired: bool(input.approvalRequired, 'approvalRequired'),
    complianceStatus: oneOf(input.complianceStatus, ['PENDING', 'APPROVED', 'REJECTED'] as const, 'complianceStatus'),
    reversalRequired: bool(input.reversalRequired, 'reversalRequired'),
    manualReviewReason: nullableString(input.manualReviewReason, 'manualReviewReason'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
    createdAt: string(input.createdAt, 'createdAt'),
    updatedAt: string(input.updatedAt, 'updatedAt'),
  }
}

export const parseWithdrawalPreview = (value: unknown): OnchainWithdrawalPreview => {
  const input = record(value, 'withdrawal preview')
  if (input.complianceGateEnabled !== true) throw new Error('complianceGateEnabled must remain true')
  return {
    fees: parseFeeBreakdown(input.fees),
    approvalThreshold: string(input.approvalThreshold, 'approvalThreshold'),
    approvalRequired: bool(input.approvalRequired, 'approvalRequired'),
    addressCoolingPeriodSeconds: integer(input.addressCoolingPeriodSeconds, 'addressCoolingPeriodSeconds'),
    addressEligibleAt: string(input.addressEligibleAt, 'addressEligibleAt'),
    complianceGateEnabled: true,
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}

export const parseDepositPreview = (value: unknown): OnchainDepositPreview => {
  const input = record(value, 'deposit preview')
  return {
    previewId: string(input.previewId, 'previewId'),
    depositAddressId: string(input.depositAddressId, 'depositAddressId'),
    networkId: string(input.networkId, 'networkId'),
    assetId: string(input.assetId, 'assetId'),
    assetCode: string(input.assetCode, 'assetCode'),
    fees: parseFeeBreakdown(input.fees),
    confirmationTarget: integer(input.confirmationTarget, 'confirmationTarget'),
    expiresAt: string(input.expiresAt, 'expiresAt'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}

export const parseOnchainTransferPage = (value: unknown): OnchainTransferPage => {
  const input = record(value, 'onchain transfer page')
  const nextCursor = nullableString(input.nextCursor, 'nextCursor')
  if (nextCursor !== null && (nextCursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(nextCursor)))
    throw new Error('nextCursor is invalid')
  const items = array(input.items, 'items')
  if (items.length > 100) throw new Error('onchain transfer page exceeds the consumer limit')
  return {items: items.map(parseOnchainTransfer), nextCursor}
}

export const parseOnchainFxQuote = (value: unknown): OnchainFxQuote => {
  const input = record(value, 'onchain FX quote')
  return {
    quoteId: string(input.quoteId, 'quoteId'),
    sourceAssetId: string(input.sourceAssetId, 'sourceAssetId'),
    targetAssetId: string(input.targetAssetId, 'targetAssetId'),
    sourceAmount: string(input.sourceAmount, 'sourceAmount'),
    targetAmount: string(input.targetAmount, 'targetAmount'),
    rate: string(input.rate, 'rate'),
    fxFee: string(input.fxFee, 'fxFee'),
    expiresAt: string(input.expiresAt, 'expiresAt'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}

export const parseWithdrawalAddresses = (value: unknown): WithdrawalAddress[] => {
  const input = record(value, 'withdrawal address book')
  return array(input.items, 'items').map((item, index) => {
    const entry = record(item, `items[${index}]`)
    return {
      id: string(entry.id, 'id'),
      assetId: string(entry.assetId, 'assetId'),
      assetCode: string(entry.assetCode, 'assetCode'),
      networkId: string(entry.networkId, 'networkId'),
      address: string(entry.address, 'address'),
      label: string(entry.label, 'label'),
      isDefault: bool(entry.isDefault, 'isDefault'),
      createdAt: string(entry.createdAt, 'createdAt'),
    }
  })
}

export const parseCardProducts = (value: unknown): CardProduct[] => {
  const input = record(value, 'card products')
  return array(input.products, 'products').map((item, index) => {
    const entry = record(item, `products[${index}]`)
    return {
      templateId: string(entry.templateId, 'templateId'),
      assetId: string(entry.assetId, 'assetId'),
      cardType: oneOf(entry.cardType, ['VIRTUAL', 'PHYSICAL'] as const, 'cardType'),
      currency: string(entry.currency, 'currency'),
      openingFee: string(entry.openingFee, 'openingFee'),
      monthlyFee: string(entry.monthlyFee, 'monthlyFee'),
    }
  })
}

export const parseCardOpeningQuote = (value: unknown): CardOpeningQuote => {
  const input = record(value, 'card opening quote')
  return {
    templateId: string(input.productTemplateId, 'productTemplateId'),
    assetId: string(input.assetId, 'assetId'),
    cardType: oneOf(input.cardType, ['VIRTUAL', 'PHYSICAL'] as const, 'cardType'),
    currency: string(input.currency, 'currency'),
    openingFee: string(input.openingFee, 'openingFee'),
    effectiveFees: record(input.effectiveFees, 'effectiveFees'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}

export const parseCardTopup = (value: unknown): CardTopupReceipt => {
  const input = record(value, 'card top-up')
  return {
    operationId: string(input.operationId, 'operationId'),
    cardId: string(input.cardId, 'cardId'),
    assetId: string(input.assetId, 'assetId'),
    currency: string(input.currency, 'currency'),
    amount: decimalString(input.amount, 'amount'),
    availableBalanceMinor: string(input.availableBalanceMinor, 'availableBalanceMinor'),
    status: oneOf(input.status, ['COMPLETED'] as const, 'status'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}

export const parseCardTopupQuote = (value: unknown): CardTopupQuote => {
  const input = record(value, 'card top-up quote')
  return {
    quoteId: string(input.quoteId, 'quoteId'),
    cardId: string(input.cardId, 'cardId'),
    sourceWalletAccountId: string(input.sourceWalletAccountId, 'sourceWalletAccountId'),
    assetId: string(input.assetId, 'assetId'),
    currency: string(input.currency, 'currency'),
    amount: decimalString(input.amount, 'amount'),
    fees: parseFeeBreakdown(input.fees),
    totalDebitAmount: decimalString(input.totalDebitAmount, 'totalDebitAmount'),
    expiresAt: string(input.expiresAt, 'expiresAt'),
    externalProviderCalled: falseOnly(input.externalProviderCalled, 'externalProviderCalled'),
  }
}
