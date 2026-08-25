import type {CardIssueInput} from './gateway/WalletGateway'

/**
 * Read-only resources rendered by the Phase 2 wallet.  Keep this list local
 * to the browser so a failed resource never causes the UI to invent data for
 * a different tenant or product.
 */
export type Phase2ReadResource =
  | 'deposit-addresses'
  | 'withdrawal-addresses'
  | 'onchain-transactions'
  | 'card-products'

type StatusLike = {status?: unknown; traceId?: unknown}

const errorStatus = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null
  const status = (value as StatusLike).status
  return typeof status === 'number' && Number.isInteger(status) ? status : null
}

const errorTrace = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null
  const traceId = (value as StatusLike).traceId
  return typeof traceId === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(traceId) ? traceId : null
}

/** Read requests may be retried only by an explicit user action. */
export const canManuallyRetryPhase2Read = (value: unknown): boolean => {
  const status = errorStatus(value)
  return status === 0 || status === 408 || status === 429 || (status !== null && status >= 500 && status <= 599)
}

const retryHint = (value: unknown): string => canManuallyRetryPhase2Read(value)
  ? 'No unverified data is shown. You may retry this read once manually.'
  : 'No unverified data is shown.'

export const phase2ReadFailureMessage = (resource: Phase2ReadResource, value: unknown): string => {
  const status = errorStatus(value)
  const trace = errorTrace(value)
  const traceSuffix = trace ? ` Reference ${trace}.` : ''
  if (status === 401 || status === 403)
    return `${resource.replace(/-/g, ' ')} is unavailable for this session. Sign in again before retrying.${traceSuffix}`
  if (status === 408)
    return `${resource.replace(/-/g, ' ')} timed out safely (HTTP 408). ${retryHint(value)}${traceSuffix}`
  if (status === 0 || status === 429 || (status !== null && status >= 500 && status <= 599))
    return `${resource.replace(/-/g, ' ')} is temporarily unavailable. ${retryHint(value)}${traceSuffix}`
  return `${resource.replace(/-/g, ' ')} is unavailable. ${retryHint(value)}${traceSuffix}`
}

export const phase2EmptyStateMessage: Record<Phase2ReadResource, string> = {
  'deposit-addresses': 'No active tenant-scoped Sandbox deposit address is configured. Deposit preview and intent remain disabled; the browser will not automatically allocate or invent an address.',
  'withdrawal-addresses': 'No eligible tenant-scoped Sandbox withdrawal address is configured for this network. Direct destination entry remains disabled.',
  'onchain-transactions': 'No tenant-scoped onchain transactions were returned.',
  'card-products': 'No tenant-enabled local Card product was returned. Card quote and issue actions remain disabled.',
}

/**
 * Product catalogues expose an immutable local asset identifier.  Card issue
 * always sends it under the new `currencyId` field; an ISO display code can
 * never become request input.
 */
export const cardIssueInputFromLocalProduct = (currencyId: unknown, alias?: unknown): CardIssueInput => {
  if (typeof currencyId !== 'string' || !/^[A-Za-z0-9._:-]{2,128}$/.test(currencyId) || /^[A-Z]{3}$/.test(currencyId))
    throw new Error('A valid local currencyId is required before Card issue')
  if (alias !== undefined && (typeof alias !== 'string' || alias.length === 0 || alias.length > 30))
    throw new Error('Card alias is invalid')
  return alias === undefined ? {currencyId} : {currencyId, alias}
}

export const phase2FxUnavailableMessage = (value: unknown): string => {
  const status = errorStatus(value)
  if (status === 408) return 'FX quote timed out safely. No conversion was performed; retry manually when the service is available.'
  if (status === 401 || status === 403) return 'FX quote is unavailable for this session. No conversion was performed.'
  return 'FX quote is unavailable. No conversion was performed; no unvalidated quote is displayed.'
}
