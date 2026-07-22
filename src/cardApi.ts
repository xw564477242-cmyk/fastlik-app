export type DataSource = 'SANDBOX' | 'OFFICIAL_UAT' | 'PRODUCTION'
export type CardType = 'VIRTUAL' | 'PHYSICAL'
export type CardStatus = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'SUSPENDED' | 'CLOSED'

export type Money = {
  amount: number
  currency: string
}

export type CardholderProfile = {
  displayName: string
  emailMasked?: string
  phoneMasked?: string
}

export type Address = {
  line1: string
  line2?: string
  city: string
  region?: string
  postalCode: string
  country: string
}

export type CardRecord = {
  cardReference: string
  type: CardType
  network: 'MASTERCARD' | 'VISA'
  status: CardStatus
  last4: string
  productName: string
  nameOnCard: string
  design?: { id: string; name: string; imageUrl?: string }
  balance: {
    total: Money
    available: Money
    pending: Money
  }
  cardholder: CardholderProfile
  deliveryAddress?: Address
  fulfilment?: {
    status: 'NOT_REQUIRED' | 'PENDING' | 'IN_PRODUCTION' | 'DISPATCHED' | 'DELIVERED' | 'FAILED'
    trackingReference?: string
    estimatedDeliveryDate?: string
  }
  relationships?: {
    enabled: boolean
    parent?: { cardReference: string; label: string; last4: string }
    children?: Array<{ cardReference: string; label: string; last4: string }>
  }
  threeDSecure: {
    configured: boolean
    userManageable: boolean
    language?: string
    allowedLanguages?: string[]
  }
  networkSharing: {
    enabled: boolean
    userManageable: boolean
  }
}

export type CardProduct = {
  partnerCardProductId: string
  name: string
  cardType: CardType
  network: 'MASTERCARD' | 'VISA'
  designChoices: Array<{ id: string; name: string; imageUrl?: string }>
  manufacturingChoices?: {
    languages?: string[]
    deliveryMethods?: Array<{ code: number; label: string }>
  }
}

export type CardApplication = {
  partnerCardProductId: string
  cardType: CardType
  cardDesignId?: string
  manufacturing?: {
    language?: string
    deliveryMethod?: number
  }
}

export type CardEnvelope<T> = {
  data: T
  meta: {
    dataSource: DataSource
    traceId: string
  }
}

export interface CardClient {
  listCards(): Promise<CardEnvelope<CardRecord[]>>
  listProducts(cardType?: CardType): Promise<CardEnvelope<CardProduct[]>>
  applyForCard(application: CardApplication): Promise<CardEnvelope<CardRecord>>
  updateThreeDSecure(cardReference: string, configuration: { language: string }): Promise<CardEnvelope<CardRecord>>
  updateNetworkSharing(cardReference: string, enabled: boolean): Promise<CardEnvelope<CardRecord>>
}

export type AccessTokenProvider = () => string | undefined

let sessionAccessToken: string | undefined

export function setCardSessionAccessToken(token: string | undefined): void {
  const value = token?.trim()
  sessionAccessToken = value || undefined
}

const forbiddenResponseKeys = new Set([
  'pan',
  'cardnumber',
  'cvv',
  'cvc',
  'publictoken',
  'token',
  'kid',
  'certificate',
  'certificatepem',
  'controlgroupid',
  'internalcontrolgroupid',
])

export class CardApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly traceId?: string,
  ) {
    super(message)
    this.name = 'CardApiError'
  }
}

export function assertSafeCardPayload(value: unknown, path = 'response'): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeCardPayload(entry, `${path}[${index}]`))
    return
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (forbiddenResponseKeys.has(key.toLowerCase())) {
      throw new CardApiError(`Unsafe card payload rejected at ${path}.${key}`)
    }
    assertSafeCardPayload(entry, `${path}.${key}`)
  })
}

function isDataSource(value: unknown): value is DataSource {
  return value === 'SANDBOX' || value === 'OFFICIAL_UAT' || value === 'PRODUCTION'
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value ?? '').replace(/\/$/, '')
}

export function createCardClient(
  baseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  fetcher: typeof fetch = fetch,
  accessTokenProvider: AccessTokenProvider = () => sessionAccessToken,
): CardClient {
  function authorizationHeader(): { Authorization: string } {
    const token = accessTokenProvider()?.trim()
    if (!token) throw new CardApiError('Authenticated FastLink user session is required', 401)
    return { Authorization: `Bearer ${token}` }
  }

  async function request<T>(path: string, init?: RequestInit): Promise<CardEnvelope<T>> {
    const response = await fetcher(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...authorizationHeader(),
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
    const traceId = response.headers.get('x-trace-id') ?? undefined

    if (!response.ok) {
      let message = `Card service request failed (${response.status})`
      try {
        const problem = await response.json() as { title?: string; detail?: string; traceId?: string }
        message = problem.detail ?? problem.title ?? message
        throw new CardApiError(message, response.status, problem.traceId ?? traceId)
      } catch (error) {
        if (error instanceof CardApiError) throw error
        throw new CardApiError(message, response.status, traceId)
      }
    }

    const envelope = await response.json() as CardEnvelope<T>
    assertSafeCardPayload(envelope)
    if (!envelope?.meta || !isDataSource(envelope.meta.dataSource) || !envelope.meta.traceId) {
      throw new CardApiError('Card response is missing verified data-source metadata', response.status, traceId)
    }
    return envelope
  }

  async function requestNoContent(path: string, body: unknown): Promise<void> {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authorizationHeader() },
      body: JSON.stringify(body),
    })
    const traceId = response.headers.get('x-trace-id') ?? undefined
    if (response.status !== 204) {
      throw new CardApiError(`Update Card must return 204 No Content (received ${response.status})`, response.status, traceId)
    }
  }

  async function updateAndRetrieve(cardReference: string, body: unknown): Promise<CardEnvelope<CardRecord>> {
    const path = `/api/app/cards/${encodeURIComponent(cardReference)}`
    await requestNoContent(path, body)
    return request<CardRecord>(path)
  }

  return {
    listCards: () => request<CardRecord[]>('/api/app/cards'),
    listProducts: (cardType) => request<CardProduct[]>(`/api/app/card-products${cardType ? `?cardType=${cardType}` : ''}`),
    applyForCard: (application) => request<CardRecord>('/api/app/cards', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(application),
    }),
    updateThreeDSecure: (cardReference, configuration) => updateAndRetrieve(cardReference, { config3DSecure: configuration }),
    updateNetworkSharing: (cardReference, enabled) => updateAndRetrieve(cardReference, { networkSharing: enabled }),
  }
}

export const cardApi = createCardClient()
