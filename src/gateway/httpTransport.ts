import {API_REQUEST_DEADLINE_MS} from '../requestPolicy'
import {sessionFailureRequiresClear} from '../sessionLifecycle'

export type FastLinkEnvironment = 'LOCAL' | 'SANDBOX' | 'TEST' | 'UAT' | 'PRODUCTION'
export type GatewayResponseMode = 'json' | 'text'
export type GatewaySessionInvalidation = 'broadcast' | 'caller'

export type GatewayRequest = {
  path: string
  method?: string
  body?: unknown
  idempotencyKey?: string
  responseMode?: GatewayResponseMode
  signal?: AbortSignal
  maximumResponseBytes?: number
  sessionInvalidation?: GatewaySessionInvalidation
}

const env = (import.meta as ImportMeta & {env?: ImportMetaEnv}).env
const buildApiUrl = env?.VITE_FASTLINK_API_URL?.trim()
const buildEnvironment = env?.VITE_FASTLINK_ENVIRONMENT as FastLinkEnvironment | undefined
const apiUrl = (window.__FASTLINK_RUNTIME__?.apiUrl?.trim() || buildApiUrl || '').replace(/\/$/, '')
const environment = (window.__FASTLINK_RUNTIME__?.environment?.trim() || buildEnvironment) as FastLinkEnvironment | undefined

if (!apiUrl) throw new Error('Missing VITE_FASTLINK_API_URL')
if (!environment || !['LOCAL', 'SANDBOX', 'TEST', 'UAT', 'PRODUCTION'].includes(environment)) throw new Error('Invalid VITE_FASTLINK_ENVIRONMENT')
if (['SANDBOX', 'TEST', 'PRODUCTION'].includes(environment) && apiUrl !== '/api') throw new Error(`${environment} Cloudflare Wallet must use same-origin /api`)

const runtimeBuildSha = window.__FASTLINK_RUNTIME__?.buildSha?.trim()
const verifiedRuntimeBuildSha = runtimeBuildSha && /^[0-9a-f]{40}$/i.test(runtimeBuildSha) ? runtimeBuildSha : undefined

export const walletRuntime = Object.freeze({
  apiUrl,
  environment,
  buildSha: verifiedRuntimeBuildSha || env?.VITE_FASTLINK_BUILD_SHA?.trim() || 'unknown',
})

export class WalletGatewayError extends Error {
  constructor(public status: number, public traceId: string, message: string) {
    super(message)
  }
}

export const createTraceId = () => crypto.randomUUID()
export const readCsrfToken = () => document.cookie
  .split(';')
  .map((value) => value.trim())
  .find((value) => value.startsWith('fastlink_csrf='))
  ?.slice('fastlink_csrf='.length)

const boundedResponseText = async (response: Response, maximumBytes: number): Promise<string> => {
  const declared = response.headers.get('content-length')
  if (declared !== null) {
    const length = Number(declared)
    if (Number.isFinite(length) && length > maximumBytes) {
      await response.body?.cancel()
      throw new Error('API response exceeds the consumer limit')
    }
  }
  if (!response.body) {
    const value = await response.text()
    if (new TextEncoder().encode(value).byteLength > maximumBytes) throw new Error('API response exceeds the consumer limit')
    return value
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let value = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      received += chunk.value.byteLength
      if (received > maximumBytes) {
        await reader.cancel()
        throw new Error('API response exceeds the consumer limit')
      }
      value += decoder.decode(chunk.value, {stream: true})
    }
    return value + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export async function walletHttpRequest<T>(input: GatewayRequest): Promise<T> {
  if (!/^\/v(?:1|2)\//.test(input.path)) throw new Error('WalletGateway rejected a path outside /api/v1 or /api/v2')
  const id = createTraceId()
  const method = input.method ?? 'GET'
  const responseMode = input.responseMode ?? 'json'
  const sessionInvalidation = input.sessionInvalidation ?? 'broadcast'
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (input.signal?.aborted) cancel()
  else input.signal?.addEventListener('abort', cancel, {once: true})
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, API_REQUEST_DEADLINE_MS)
  try {
    const csrf = readCsrfToken()
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method)
    const response = await fetch(`${apiUrl}${input.path}`, {
      method,
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'X-Trace-Id': id,
        ...(input.body !== undefined ? {'Content-Type': 'application/json'} : {}),
        ...(input.idempotencyKey ? {'Idempotency-Key': input.idempotencyKey} : {}),
        ...(mutating && csrf ? {'X-CSRF-Token': decodeURIComponent(csrf)} : {}),
      },
      ...(input.body !== undefined ? {body: JSON.stringify(input.body)} : {}),
    })
    const returned = response.headers.get('x-trace-id') || id
    if (!response.ok) {
      let message = `HTTP ${response.status}`
      try {
        const raw = input.maximumResponseBytes === undefined
          ? await response.json()
          : JSON.parse(await boundedResponseText(response, Math.min(input.maximumResponseBytes, 16_384)))
        const payload = raw as {message?: string | string[]; code?: string}
        message = Array.isArray(payload.message) ? payload.message.join(', ') : (payload.message || payload.code || message)
      } catch {}
      throw new WalletGatewayError(response.status, returned, `${message} · HTTP ${response.status} · Trace ${returned}`)
    }
    if (response.status === 204) return undefined as T
    if (responseMode === 'text') {
      return (input.maximumResponseBytes === undefined
        ? await response.text()
        : await boundedResponseText(response, input.maximumResponseBytes)) as T
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof WalletGatewayError) {
      if (input.signal?.aborted) throw new DOMException('Wallet request cancelled', 'AbortError')
      if (sessionInvalidation === 'broadcast' && sessionFailureRequiresClear(error)) {
        window.dispatchEvent(new CustomEvent('fastlink:session-invalid', {detail: error}))
      }
      throw error
    }
    if (error instanceof DOMException && error.name === 'AbortError' && timedOut) {
      throw new WalletGatewayError(408, id, `API timeout · HTTP 408 · Trace ${id}`)
    }
    if (error instanceof DOMException && error.name === 'AbortError' && input.signal?.aborted) {
      throw new DOMException('Wallet transaction request cancelled', 'AbortError')
    }
    const message = error instanceof Error ? error.message : 'Network failure'
    throw new WalletGatewayError(0, id, `${message} · HTTP 0 · Trace ${id}`)
  } finally {
    window.clearTimeout(timeout)
    input.signal?.removeEventListener('abort', cancel)
  }
}
