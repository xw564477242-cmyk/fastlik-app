import React, {useEffect, useState} from 'react'
import type {CardProduct} from './gateway/contracts.ts'
import type {Phase2Availability} from './phase2Availability.ts'
import {phase2EmptyStateMessage, phase2ReadFailureMessage} from './phase2WalletUat.ts'

export type Phase2TestCardProductsGateway = Readonly<{
  cardProducts(signal?: AbortSignal): Promise<CardProduct[]>
}>

type Props = Readonly<{
  availability: Extract<Phase2Availability, {mode: 'CARD_PRODUCTS_READ_ONLY'}>
  sessionKey: string
  gateway: Phase2TestCardProductsGateway
}>

export function Phase2TestCardProductsPanel({availability, sessionKey, gateway}: Props) {
  const [products, setProducts] = useState<CardProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setProducts([])
    setReadError('')
    setLoading(true)
    void gateway.cardProducts(controller.signal).then((value) => {
      if (current) setProducts(value)
    }).catch((value: unknown) => {
      if (current && !controller.signal.aborted) {
        setReadError(phase2ReadFailureMessage('card-products', value))
      }
    }).finally(() => {
      if (current) setLoading(false)
    })
    return () => {
      current = false
      controller.abort()
    }
  }, [gateway, sessionKey])

  return React.createElement(
    'section',
    {id: 'phase2-wallet', className: 'panel phase2-wallet', 'data-phase2-state': availability.code},
    React.createElement(
      'div',
      {className: 'panel-row'},
      React.createElement(
        'div',
        null,
        React.createElement('h2', null, 'Prime Wallet · TEST read-only capability'),
        React.createElement('p', {className: 'card-action-note'}, 'Runtime: TEST · Session: TEST · local Card catalogue only'),
      ),
    ),
    React.createElement(
      'div',
      {className: 'inline-error'},
      React.createElement('b', null, availability.code),
      ' · Onchain network and Phase2 actions are deferred in TEST.',
    ),
    React.createElement('p', {className: 'card-action-note'}, availability.message),
    React.createElement(
      'div',
      {className: 'record-list', 'data-card-catalog-state': loading ? 'LOADING' : readError ? 'UNAVAILABLE' : 'READY'},
      React.createElement('h3', null, 'Card products · read only'),
      loading ? React.createElement('p', null, 'Loading the tenant-scoped local Card catalogue…') : null,
      readError ? React.createElement('div', {className: 'inline-error'}, readError) : null,
      !loading && !readError && products.length === 0
        ? React.createElement('p', null, phase2EmptyStateMessage['card-products'])
        : null,
      ...(!loading && !readError ? products.map((item) => React.createElement(
        'div',
        {className: 'balance-record', key: item.templateId},
        React.createElement('b', null, `${item.cardType} · ${item.currency}`),
        React.createElement('small', null, `currencyId ${item.assetId} · Opening fee ${item.openingFee} · Monthly fee ${item.monthlyFee}`),
      )) : []),
    ),
    React.createElement(
      'p',
      {className: 'card-action-note'},
      'No Card quote, issue, funding, address, transfer, FX, or Provider action is available from this TEST panel.',
    ),
  )
}
