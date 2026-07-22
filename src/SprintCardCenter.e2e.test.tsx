import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SprintCardCenter } from './SprintCardCenter'
import { CardClient, CardEnvelope, CardProduct, CardRecord } from './cardApi'

const card: CardRecord = {
  cardReference: 'opaque-app-reference-4826',
  type: 'PHYSICAL',
  network: 'MASTERCARD',
  status: 'ACTIVE',
  last4: '4826',
  productName: 'FastLink Global',
  nameOnCard: 'WEI XIONG',
  design: { id: 'classic', name: 'Classic' },
  balance: {
    total: { amount: 4276, currency: 'USD' },
    available: { amount: 4200, currency: 'USD' },
    pending: { amount: 76, currency: 'USD' },
  },
  cardholder: { displayName: 'Wei Xiong', emailMasked: 'w***@example.com' },
  deliveryAddress: { line1: '1 Market Street', city: 'Kuala Lumpur', postalCode: '50000', country: 'MY' },
  fulfilment: { status: 'IN_PRODUCTION' },
  relationships: { enabled: false },
  threeDSecure: { configured: true, userManageable: true, language: 'EN', allowedLanguages: ['EN', 'ZH'] },
  networkSharing: { enabled: false, userManageable: false },
}

const virtualProduct: CardProduct = {
  partnerCardProductId: 'partner-product-uat-1',
  name: 'FastLink Global Virtual',
  cardType: 'VIRTUAL',
  network: 'MASTERCARD',
  designChoices: [{ id: 'classic', name: 'Classic' }],
  manufacturingChoices: { languages: ['EN'] },
}

const physicalProduct: CardProduct = {
  partnerCardProductId: 'partner-product-uat-physical-1',
  name: 'FastLink Global Physical',
  cardType: 'PHYSICAL',
  network: 'MASTERCARD',
  designChoices: [{ id: 'black', name: 'FastLink Black' }],
  manufacturingChoices: { languages: ['EN'], deliveryMethods: [{ code: 2, label: 'Express delivery' }] },
}

function envelope<T>(data: T): CardEnvelope<T> {
  return { data, meta: { dataSource: 'OFFICIAL_UAT', traceId: 'trace-uat-001' } }
}

function api(overrides: Partial<CardClient> = {}): CardClient {
  return {
    listCards: vi.fn().mockResolvedValue(envelope([card])),
    listProducts: vi.fn().mockImplementation((type) => Promise.resolve(envelope([type === 'PHYSICAL' ? physicalProduct : virtualProduct]))),
    applyForCard: vi.fn().mockResolvedValue(envelope({ ...card, cardReference: 'new-app-reference', type: 'VIRTUAL', productName: virtualProduct.name })),
    updateThreeDSecure: vi.fn().mockResolvedValue(envelope({ ...card, threeDSecure: { ...card.threeDSecure, language: 'ZH' } })),
    updateNetworkSharing: vi.fn().mockResolvedValue(envelope({ ...card, networkSharing: { ...card.networkSharing, enabled: true } })),
    ...overrides,
  }
}

afterEach(cleanup)

describe('Card Center customer flow', () => {
  it('renders verified balances, profile and fulfilment without exposing provider identifiers', async () => {
    const { container } = render(<SprintCardCenter notify={vi.fn()} api={api()} />)
    await screen.findAllByText('FastLink Global')

    expect(screen.getByText('Official UAT')).toBeTruthy()
    expect(screen.getByText('$4,200.00')).toBeTruthy()
    expect(screen.getByText('$76.00')).toBeTruthy()
    expect(screen.getByText('Wei Xiong')).toBeTruthy()
    expect(screen.getByText('IN PRODUCTION')).toBeTruthy()
    expect(screen.queryByText('Linked cards')).toBeNull()
    expect(container.textContent).not.toContain(card.cardReference)
  })

  it('submits only approved product, design and manufacturing choices', async () => {
    const client = api()
    const user = userEvent.setup()
    render(<SprintCardCenter notify={vi.fn()} api={client} />)
    await screen.findAllByText('FastLink Global')

    await user.click(screen.getByRole('button', { name: /virtual card/i }))
    await screen.findByRole('option', { name: /FastLink Global Virtual/i })
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(() => expect(client.applyForCard).toHaveBeenCalledOnce())
    expect(client.applyForCard).toHaveBeenCalledWith({
      partnerCardProductId: 'partner-product-uat-1',
      cardType: 'VIRTUAL',
      cardDesignId: 'classic',
      manufacturing: { language: 'EN' },
    })
  })

  it('submits an approved delivery method for a physical card without re-entering its address', async () => {
    const client = api()
    const user = userEvent.setup()
    render(<SprintCardCenter notify={vi.fn()} api={client} />)
    await screen.findAllByText('FastLink Global')

    await user.click(screen.getByRole('button', { name: /physical card/i }))
    await screen.findByRole('option', { name: /FastLink Global Physical/i })
    await user.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(() => expect(client.applyForCard).toHaveBeenCalledOnce())
    expect(client.applyForCard).toHaveBeenCalledWith({
      partnerCardProductId: 'partner-product-uat-physical-1',
      cardType: 'PHYSICAL',
      cardDesignId: 'black',
      manufacturing: { language: 'EN', deliveryMethod: 2 },
    })
  })

  it('updates only the customer-manageable 3DS language and locks network sharing otherwise', async () => {
    const client = api()
    render(<SprintCardCenter notify={vi.fn()} api={client} />)
    await screen.findAllByText('FastLink Global')

    const threeDS = screen.getByRole('combobox', { name: /3DS challenge language/i })
    const sharing = screen.getByRole('checkbox', { name: /Network sharing/i })
    expect(threeDS.hasAttribute('disabled')).toBe(false)
    expect(sharing.hasAttribute('disabled')).toBe(true)

    fireEvent.change(threeDS, { target: { value: 'ZH' } })
    await waitFor(() => expect(client.updateThreeDSecure).toHaveBeenCalledWith(card.cardReference, { language: 'ZH' }))
    expect(client.updateNetworkSharing).not.toHaveBeenCalled()
  })

  it('shows an explicit outage and never inserts fallback card data', async () => {
    const client = api({ listCards: vi.fn().mockRejectedValue(new Error('offline')) })
    render(<SprintCardCenter notify={vi.fn()} api={client} />)

    await screen.findByText('Card data unavailable')
    expect(screen.getByText('Not verified')).toBeTruthy()
    expect(screen.getAllByText(/No mock data was loaded/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('FastLink Global')).toBeNull()
  })
})
