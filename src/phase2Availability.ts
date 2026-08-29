import type {FastLinkEnvironment} from './gateway/httpTransport'

export const PHASE2_DEFERRED_CODE = 'B_DEFERRED' as const

export type Phase2Availability =
  | Readonly<{
      mode: 'ACTIVE'
      environment: 'SANDBOX'
      sessionEnvironment: 'SANDBOX'
      code: null
    }>
  | Readonly<{
      mode: 'CARD_PRODUCTS_READ_ONLY'
      environment: 'TEST'
      sessionEnvironment: 'TEST'
      code: typeof PHASE2_DEFERRED_CODE
      message: string
    }>
  | Readonly<{
      mode: 'DEFERRED'
      environment: FastLinkEnvironment
      sessionEnvironment: FastLinkEnvironment
      code: typeof PHASE2_DEFERRED_CODE
      message: string
    }>

/**
 * Phase2 onchain and funding are a DEV SANDBOX contract. TEST may mount only
 * the local read-only Card catalogue; every other environment or mismatched
 * session defers before mounting a request-owning component.
 */
export function phase2Availability(
  environment: FastLinkEnvironment,
  sessionEnvironment: FastLinkEnvironment,
): Phase2Availability {
  if (environment === 'SANDBOX' && sessionEnvironment === 'SANDBOX') {
    return Object.freeze({mode: 'ACTIVE', environment, sessionEnvironment, code: null})
  }
  if (environment === 'TEST' && sessionEnvironment === 'TEST') {
    return Object.freeze({
      mode: 'CARD_PRODUCTS_READ_ONLY',
      environment,
      sessionEnvironment,
      code: PHASE2_DEFERRED_CODE,
      message: 'Phase2 onchain networks and actions are enabled only in DEV SANDBOX. TEST performs one local Card product read and sends no Phase2 onchain or write request.',
    })
  }
  const reason = environment === sessionEnvironment
    ? 'Phase2 local onchain and Card-funding controls are enabled only in DEV SANDBOX.'
    : 'The Wallet runtime and authenticated Session environments do not match.'
  return Object.freeze({
    mode: 'DEFERRED',
    environment,
    sessionEnvironment,
    code: PHASE2_DEFERRED_CODE,
    message: `${reason} No Phase2 catalogue, address, transaction, quote, or write request was sent from this ${environment} view.`,
  })
}
