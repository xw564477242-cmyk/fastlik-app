export type FastLinkInteractionMode = 'FULL' | 'READ_ONLY_UAT'

export const READ_ONLY_UAT_MARKER = 'CARD_PRODUCTS_READ_ONLY'

const READ_ONLY_AUTH_POST_PATHS = new Set([
  '/v1/auth/login',
  '/v1/auth/refresh',
  '/v1/auth/logout',
])

export function parseInteractionMode(value: string | undefined): FastLinkInteractionMode {
  const mode = (value?.trim().toUpperCase() || 'FULL') as FastLinkInteractionMode
  if (mode !== 'FULL' && mode !== 'READ_ONLY_UAT') {
    throw new Error('Invalid FastLink interaction mode')
  }
  return mode
}

export function validateInteractionMode(
  environment: string,
  mode: FastLinkInteractionMode,
): FastLinkInteractionMode {
  if (mode === 'READ_ONLY_UAT' && environment !== 'TEST') {
    throw new Error('READ_ONLY_UAT is allowed only in TEST')
  }
  return mode
}

export function isReadOnlyUatSession(
  runtimeEnvironment: string,
  sessionEnvironment: string,
  mode: FastLinkInteractionMode,
): boolean {
  return mode === 'READ_ONLY_UAT'
    && runtimeEnvironment === 'TEST'
    && sessionEnvironment === 'TEST'
}

export function readOnlyUatRequestAllowed(path: string, method = 'GET'): boolean {
  const normalizedMethod = method.trim().toUpperCase()
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    return true
  }
  return normalizedMethod === 'POST' && READ_ONLY_AUTH_POST_PATHS.has(path)
}
