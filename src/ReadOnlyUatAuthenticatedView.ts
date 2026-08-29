import React from 'react'
import type {
  FastLinkEnvironment,
  WalletAccountRecord,
  WalletBalanceSummary,
  WalletOperationPage,
  WalletSession,
} from './apiClient.ts'
import type {CardRecord} from './cardList.ts'
import {
  ReadOnlyUatCapabilityMarker,
} from './AuthenticatedBusinessWriteBoundary.ts'
import {Phase2TestCardProductsPanel, type Phase2TestCardProductsGateway} from './Phase2TestCardProductsPanel.ts'
import {isReadOnlyUatSession, type FastLinkInteractionMode} from './interactionMode.ts'
import {phase2Availability} from './phase2Availability.ts'

export type ReadOnlyUatAuthenticatedViewProps = Readonly<{
  interactionMode: FastLinkInteractionMode
  runtimeEnvironment: FastLinkEnvironment
  session: WalletSession
  summary: WalletBalanceSummary | null
  summaryLoading: boolean
  summaryUnavailable: boolean
  accounts: readonly WalletAccountRecord[]
  accountsUnavailable: boolean
  cards: readonly CardRecord[]
  cardsUnavailable: boolean
  operations: WalletOperationPage | null
  operationsLoading: boolean
  operationsUnavailable: boolean
  catalogReadEnabled: boolean
  cardProductsGateway: Phase2TestCardProductsGateway
}>

const staticRecord = (key: string, title: string, details: readonly string[]) => React.createElement(
  'article',
  {className: 'balance-record', key},
  React.createElement('b', null, title),
  ...details.map((detail, index) => React.createElement('small', {key: `${key}:${index}`}, detail)),
)

export function ReadOnlyUatAuthenticatedView(props: ReadOnlyUatAuthenticatedViewProps) {
  const availability = phase2Availability(props.runtimeEnvironment, props.session.environment)
  const exactReadOnlyProfile = isReadOnlyUatSession(
    props.runtimeEnvironment,
    props.session.environment,
    props.interactionMode,
  )
  if (!exactReadOnlyProfile || availability.mode !== 'CARD_PRODUCTS_READ_ONLY') {
    return React.createElement(
      'section',
      {className: 'panel', 'data-readonly-uat-authenticated-view': 'INVALID'},
      React.createElement('b', null, 'READ_ONLY_UAT_UNAVAILABLE'),
      React.createElement('p', null, 'The restricted authenticated view is unavailable because its TEST identity does not match.'),
    )
  }

  const balances = props.summary?.items ?? []
  const recentOperations = props.operations?.items.slice(0, 3) ?? []
  const boundaryProps = {
    interactionMode: props.interactionMode,
    runtimeEnvironment: props.runtimeEnvironment,
    sessionEnvironment: props.session.environment,
  }

  return React.createElement(
    'div',
    {
      className: 'wallet-grid readonly-uat-authenticated-view',
      'data-readonly-uat-authenticated-view': 'ACTIVE',
    },
    React.createElement(ReadOnlyUatCapabilityMarker, boundaryProps),
    React.createElement(
      'section',
      {className: 'consumer-overview', 'aria-labelledby': 'readonly-uat-overview-title'},
      React.createElement('span', null, `Consumer wallet · ${props.session.environment}`),
      React.createElement('h2', {id: 'readonly-uat-overview-title'}, 'Your verified FastLink snapshot · read only'),
      React.createElement('p', null, 'Current authenticated Backend data only. Amounts from different assets are never combined.'),
    ),
    React.createElement(
      'section',
      {id: 'wallet-assets', className: 'panel'},
      React.createElement('h2', null, 'Persisted Wallet accounts and balances · read only'),
      props.summaryLoading && balances.length === 0 ? React.createElement('p', null, 'Loading verified balances…') : null,
      props.summaryUnavailable && balances.length === 0 ? React.createElement('p', {className: 'inline-error'}, 'Verified balances are unavailable.') : null,
      !props.summaryLoading && !props.summaryUnavailable && balances.length === 0
        ? React.createElement('p', null, 'No persisted Wallet balances returned.')
        : null,
      ...balances.map((balance) => staticRecord(
        `balance:${balance.assetCode}`,
        `${balance.availableBalance} ${balance.assetCode} available`,
        [`Ledger ${balance.ledgerBalance} · Pending ${balance.pendingBalance}`, `Updated ${balance.updatedAt}`],
      )),
      props.summaryUnavailable && balances.length > 0
        ? React.createElement('p', {className: 'card-action-note'}, 'Showing only the last verified current-session balance snapshot.')
        : null,
      props.accountsUnavailable && props.accounts.length === 0
        ? React.createElement('p', {className: 'inline-error'}, 'Verified Wallet accounts are unavailable.')
        : null,
      !props.accountsUnavailable && props.accounts.length === 0
        ? React.createElement('p', null, 'No persisted Wallet accounts returned.')
        : null,
      ...props.accounts.map((account) => staticRecord(
        `account:${account.id}`,
        `${account.name} · ${account.assetCode}`,
        [`${account.status} · ${account.availableBalance} available`, `Updated ${account.updatedAt}`],
      )),
    ),
    React.createElement(
      'section',
      {id: 'wallet-cards', className: 'panel'},
      React.createElement('h2', null, 'Persisted Cards · read only'),
      props.cardsUnavailable && props.cards.length === 0
        ? React.createElement('p', {className: 'inline-error'}, 'Verified Cards are unavailable.')
        : null,
      !props.cardsUnavailable && props.cards.length === 0
        ? React.createElement('p', null, 'No persisted Cards returned.')
        : null,
      ...props.cards.map((card) => staticRecord(
        `card:${card.id}`,
        card.last4 ? `Card •••• ${card.last4}` : 'Card · no public last4 returned',
        [`${card.type} · ${card.status} · ${card.currency}`, `Created ${card.createdAt}`],
      )),
      React.createElement('p', {className: 'card-action-note'}, 'Loaded Card capability data does not mount any Card business action.'),
    ),
    React.createElement(
      'section',
      {id: 'wallet-activity', className: 'panel'},
      React.createElement('h2', null, 'Recent persisted Wallet activity · read only'),
      props.operationsLoading && recentOperations.length === 0
        ? React.createElement('p', null, 'Loading verified activity…')
        : null,
      props.operationsUnavailable && recentOperations.length === 0
        ? React.createElement('p', {className: 'inline-error'}, 'Verified activity is unavailable.')
        : null,
      !props.operationsLoading && !props.operationsUnavailable && recentOperations.length === 0
        ? React.createElement('p', null, 'No persisted Wallet operations returned.')
        : null,
      ...recentOperations.map((operation) => staticRecord(
        `operation:${operation.id}`,
        `${operation.type} · ${operation.status}`,
        [`${operation.amount} ${operation.assetCode} · ${operation.direction}`, `Updated ${operation.updatedAt}`],
      )),
      props.operationsUnavailable && recentOperations.length > 0
        ? React.createElement('p', {className: 'card-action-note'}, 'Showing only the last verified current-session activity snapshot.')
        : null,
    ),
    React.createElement(Phase2TestCardProductsPanel, {
      availability,
      sessionKey: JSON.stringify([
        props.session.actorId,
        props.session.tenantId,
        props.session.customerId,
        props.session.environment,
        props.session.expiresAt ?? null,
      ]),
      gateway: props.cardProductsGateway,
      readEnabled: props.catalogReadEnabled,
    }),
  )
}
