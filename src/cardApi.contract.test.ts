import { describe, expect, it, vi } from 'vitest'
import { CardApiError, assertSafeCardPayload, createCardClient } from './cardApi'

const safeCard = {
  cardReference: 'app-card-ref-1',
  type: 'VIRTUAL',
  network: 'MASTERCARD',
  status: 'ACTIVE',
  last4: '4826',
  productName: 'FastLink Global',
  nameOnCard: 'WEI XIONG',
  balance: {
    total: { amount: 120, currency: 'USD' },
    available: { amount: 100, currency: 'USD' },
    pending: { amount: 20, currency: 'USD' },
  },
  cardholder: { displayName: 'Wei Xiong' },
  threeDSecure: { configured: true, userManageable: true, language: 'EN', allowedLanguages: ['EN', 'ZH'] },
  networkSharing: { enabled: false, userManageable: true },
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'x-trace-id': 'trace-header' },
  })
}

describe('card API contract', () => {
  it.each(['pan', 'cardNumber', 'cvv', 'publicToken', 'kid', 'certificate', 'controlGroupId'])('rejects forbidden response key %s', (key) => {
    expect(() => assertSafeCardPayload({ data: { ...safeCard, [key]: 'forbidden' } })).toThrow(CardApiError)
  })

  it('requires verified source metadata and never falls back to mock data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [safeCard] }))
    const client = createCardClient('https://backend.example', fetcher, () => 'user-access-token')
    await expect(client.listCards()).rejects.toThrow('missing verified data-source metadata')
  })

  it('uses the customer-facing card application contract without re-entering KYC', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({
      data: safeCard,
      meta: { dataSource: 'OFFICIAL_UAT', traceId: 'trace-application' },
    }))
    const client = createCardClient('https://backend.example', fetcher, () => 'user-access-token')

    await client.applyForCard({
      partnerCardProductId: 'partner-product-uat-1',
      cardType: 'VIRTUAL',
      cardDesignId: 'classic',
      manufacturing: { language: 'EN' },
    })

    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://backend.example/api/app/cards')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer user-access-token')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toEqual({ partnerCardProductId: 'partner-product-uat-1', cardType: 'VIRTUAL', cardDesignId: 'classic', manufacturing: { language: 'EN' } })
    expect(body).not.toHaveProperty('cardholder')
    expect(body).not.toHaveProperty('kyc')
    expect(body).not.toHaveProperty('nameOnCard')
    expect(body).not.toHaveProperty('deliveryAddress')
  })

  it('requires 204 for Update Card and re-retrieves through the protected reference', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => init?.method === 'PUT'
      ? new Response(null, { status: 204, headers: { 'x-trace-id': 'trace-update' } })
      : response({ data: safeCard, meta: { dataSource: 'OFFICIAL_UAT', traceId: 'trace-retrieve' } }))
    const client = createCardClient('https://backend.example', fetcher, () => 'user-access-token')
    await client.updateThreeDSecure('app-card-ref-1', { language: 'ZH' })
    await client.updateNetworkSharing('app-card-ref-1', true)

    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://backend.example/api/app/cards/app-card-ref-1', 'PUT'],
      ['https://backend.example/api/app/cards/app-card-ref-1', 'GET'],
      ['https://backend.example/api/app/cards/app-card-ref-1', 'PUT'],
      ['https://backend.example/api/app/cards/app-card-ref-1', 'GET'],
    ])
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ config3DSecure: { language: 'ZH' } })
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ networkSharing: true })
  })

  it('rejects a 200 response from Update Card', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: safeCard, meta: { dataSource: 'OFFICIAL_UAT', traceId: 'trace-invalid' } }, 200))
    const client = createCardClient('https://backend.example', fetcher, () => 'user-access-token')
    await expect(client.updateThreeDSecure('app-card-ref-1', { language: 'EN' })).rejects.toThrow('must return 204 No Content')
  })

  it('denies all card calls before transport when the user Bearer session is absent', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const client = createCardClient('https://backend.example', fetcher, () => undefined)
    await expect(client.listCards()).rejects.toThrow('Authenticated FastLink user session is required')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
