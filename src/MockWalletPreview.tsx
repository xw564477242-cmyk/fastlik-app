import {Phase2WalletPanel} from './Phase2WalletPanel'
import type {WalletAccountRecord} from './walletData'

const previewAccounts: WalletAccountRecord[] = [{
  id: 'wallet_mock_usd',
  accountCode: 'CUSTOMER:USD:PRIMARY',
  name: 'Preview USD wallet',
  assetCode: 'USD',
  status: 'ACTIVE',
  currentBalance: '1000',
  postedBalance: '1000',
  pendingBalance: '0',
  availableBalance: '1000',
  updatedAt: '2026-08-21T08:00:00.000Z',
}]

export function MockWalletPreview() {
  return <main>
    <header><div><h1>FastLink Wallet Preview</h1><p>Deterministic UI fixture · no Backend or external-provider call.</p></div></header>
    <Phase2WalletPanel accounts={previewAccounts} selectedCardId="card_mock_physical"/>
  </main>
}
