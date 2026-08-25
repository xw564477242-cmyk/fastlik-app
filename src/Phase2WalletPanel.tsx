import {useEffect, useMemo, useState} from 'react'
import {ArrowDownToLine, ArrowUpFromLine, CreditCard, RefreshCw, ShieldCheck, WalletCards} from 'lucide-react'
import {walletDataSource, walletGateway} from './gateway/index'
import type {
  CardOpeningQuote,
  CardProduct,
  CardTopupQuote,
  OnchainDepositAddress,
  OnchainDepositPreview,
  OnchainNetwork,
  OnchainTransfer,
  OnchainTransferPage,
  OnchainWithdrawalPreview,
  TotalAssets,
  WalletBalanceTriple,
  WithdrawalAddress,
} from './gateway/index'
import type {WalletAccountRecord} from './walletData'

type Props = {
  accounts: readonly WalletAccountRecord[]
  selectedCardId: string | null
}

const USDT_ASSET_ID = 'flp_asset_usdt'
const terminal = new Set(['SETTLED', 'REORGED', 'FAILED'])
const idempotencyKey = (operation: string) => `${operation}:${crypto.randomUUID()}`
const message = (value: unknown) => value instanceof Error ? value.message : 'Wallet request unavailable'

function FeeRows({transfer}: {transfer: OnchainTransfer}) {
  return <div className="phase2-fees">
    <div><span>Gross</span><b>{transfer.fees.grossAmount} {transfer.assetCode}</b></div>
    <div><span>Platform fee</span><b>{transfer.fees.platformFee} {transfer.assetCode}</b></div>
    <div><span>Network fee</span><b>{transfer.fees.networkFee} {transfer.assetCode}</b></div>
    <div><span>FX fee</span><b>{transfer.fees.fxFee} {transfer.assetCode}</b></div>
    <div><span>Net</span><b>{transfer.fees.netAmount} {transfer.assetCode}</b></div>
  </div>
}

function TransferDetail({transfer, onRefresh, busy}: {transfer: OnchainTransfer; onRefresh: () => void; busy: boolean}) {
  return <div className={`phase2-transfer-detail ${transfer.state === 'REORGED' ? 'reorg-warning' : ''}`}>
    <div className="panel-row"><h4>Onchain transaction detail</h4><button type="button" onClick={onRefresh} disabled={busy}><RefreshCw/> Refresh status</button></div>
    <div><span>Transfer</span><b>{transfer.transferId}</b></div>
    <div><span>State</span><b>{transfer.state}</b></div>
    <div><span>Confirmations</span><b>{transfer.confirmations} / {transfer.confirmationTarget}</b></div>
    <div><span>Compliance</span><b>{transfer.complianceStatus}</b></div>
    <div><span>Approval</span><b>{transfer.approvalRequired ? 'Required' : 'Not required'}</b></div>
    <div><span>Transaction hash</span><b>{transfer.transactionHash ?? 'Awaiting broadcast/detection'}</b></div>
    {transfer.state === 'REORGED' && <div className="inline-error"><b>Account frozen — manual review required.</b><br/>{transfer.manualReviewReason ?? 'Chain reorganization detected.'}<br/>The posted ledger balance remains visible; available balance is controlled by Backend.</div>}
    <FeeRows transfer={transfer}/>
  </div>
}

export function Phase2WalletPanel({accounts, selectedCardId}: Props) {
  const [tab, setTab] = useState<'overview' | 'deposit' | 'withdraw' | 'cards'>('overview')
  const [total, setTotal] = useState<TotalAssets | null>(null)
  const [balances, setBalances] = useState<WalletBalanceTriple[]>([])
  const [networks, setNetworks] = useState<OnchainNetwork[]>([])
  const [networkId, setNetworkId] = useState('eip155:1')
  const [depositAddresses, setDepositAddresses] = useState<OnchainDepositAddress[]>([])
  const [withdrawalAddresses, setWithdrawalAddresses] = useState<WithdrawalAddress[]>([])
  const [products, setProducts] = useState<CardProduct[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [depositPreview, setDepositPreview] = useState<OnchainDepositPreview | null>(null)
  const [depositTransfer, setDepositTransfer] = useState<OnchainTransfer | null>(null)
  const [onchainTransfers, setOnchainTransfers] = useState<OnchainTransferPage | null>(null)
  const [withdrawalAmount, setWithdrawalAmount] = useState('')
  const [withdrawalAddressId, setWithdrawalAddressId] = useState('')
  const [withdrawalPreview, setWithdrawalPreview] = useState<OnchainWithdrawalPreview | null>(null)
  const [withdrawalTransfer, setWithdrawalTransfer] = useState<OnchainTransfer | null>(null)
  const [productId, setProductId] = useState('')
  const [openingQuote, setOpeningQuote] = useState<CardOpeningQuote | null>(null)
  const [cardAlias, setCardAlias] = useState('')
  const [topupAmount, setTopupAmount] = useState('')
  const [topupAccountId, setTopupAccountId] = useState('')
  const [topupQuote, setTopupQuote] = useState<CardTopupQuote | null>(null)
  const [cardReceipt, setCardReceipt] = useState('')

  const activeDepositAddress = useMemo(
    () => depositAddresses.find((item) => item.networkId === networkId && item.status === 'ACTIVE') ?? null,
    [depositAddresses, networkId],
  )
  const eligibleWithdrawalAddresses = useMemo(
    () => withdrawalAddresses.filter((item) => item.networkId === networkId && item.assetId === USDT_ASSET_ID),
    [withdrawalAddresses, networkId],
  )
  const selectedWithdrawalAddress = eligibleWithdrawalAddresses.find((item) => item.id === withdrawalAddressId) ?? null
  const selectedProduct = products.find((item) => item.templateId === productId) ?? null

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const [nextTotal, nextBalances, nextNetworks, nextAddresses, nextBook, nextProducts, nextTransfers] = await Promise.all([
        walletGateway.totalAssets(),
        walletGateway.balanceTriples(),
        walletGateway.onchainNetworks(),
        walletGateway.depositAddresses({networkId, assetId: USDT_ASSET_ID}),
        walletGateway.withdrawalAddresses(),
        walletGateway.cardProducts(),
        walletGateway.onchainTransfers(),
      ])
      setTotal(nextTotal)
      setBalances(nextBalances)
      setNetworks(nextNetworks)
      setDepositAddresses(nextAddresses)
      setWithdrawalAddresses(nextBook)
      setProducts(nextProducts)
      setOnchainTransfers(nextTransfers)
      if (!withdrawalAddressId) setWithdrawalAddressId(nextBook.find((item) => item.networkId === networkId)?.id ?? '')
      if (!productId) setProductId(nextProducts[0]?.templateId ?? '')
      if (!topupAccountId) setTopupAccountId(accounts[0]?.id ?? '')
    } catch (value) {
      setError(message(value))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { setTopupQuote(null) }, [selectedCardId])

  const loadAddresses = async (nextNetworkId: string) => {
    setNetworkId(nextNetworkId)
    setDepositPreview(null)
    setWithdrawalPreview(null)
    setBusy(true)
    setError('')
    try {
      const next = await walletGateway.depositAddresses({networkId: nextNetworkId, assetId: USDT_ASSET_ID})
      setDepositAddresses(next)
      setWithdrawalAddressId(withdrawalAddresses.find((item) => item.networkId === nextNetworkId)?.id ?? '')
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const allocateAddress = async () => {
    setBusy(true); setError('')
    try {
      const value = await walletGateway.allocateDepositAddress({networkId, assetId: USDT_ASSET_ID})
      setDepositPreview(null)
      setDepositAddresses((current) => [...current.filter((item) => item.addressId !== value.addressId), value])
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const rotateAddress = async () => {
    if (!activeDepositAddress) return
    setBusy(true); setError('')
    try {
      const value = await walletGateway.rotateDepositAddress(activeDepositAddress.addressId)
      setDepositPreview(null)
      const history = await walletGateway.depositAddresses({networkId, assetId: USDT_ASSET_ID})
      setDepositAddresses(history.some((item) => item.addressId === value.addressId) ? history : [...history, value])
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const previewDeposit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeDepositAddress) return
    setBusy(true); setError('')
    try {
      setDepositPreview(await walletGateway.previewDeposit({networkId, assetId: USDT_ASSET_ID, depositAddressId: activeDepositAddress.addressId, grossAmount: depositAmount}))
    } catch (value) { setDepositPreview(null); setError(message(value)) } finally { setBusy(false) }
  }

  const submitDeposit = async () => {
    if (!activeDepositAddress || !depositPreview) return
    setBusy(true); setError('')
    try {
      setDepositTransfer(await walletGateway.createDepositIntent({networkId, assetId: USDT_ASSET_ID, depositAddressId: activeDepositAddress.addressId, grossAmount: depositAmount, previewId: depositPreview.previewId}, idempotencyKey('deposit')))
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const refreshDeposit = async () => {
    if (!depositTransfer) return
    setBusy(true); setError('')
    try { setDepositTransfer(await walletGateway.depositStatus(depositTransfer.transferId)) }
    catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const previewWithdrawal = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedWithdrawalAddress) return
    setBusy(true); setError('')
    try {
      setWithdrawalPreview(await walletGateway.previewWithdrawal({networkId, assetId: USDT_ASSET_ID, withdrawalAddressId: selectedWithdrawalAddress.id, netAmount: withdrawalAmount}))
    } catch (value) { setWithdrawalPreview(null); setError(message(value)) } finally { setBusy(false) }
  }

  const submitWithdrawal = async () => {
    if (!selectedWithdrawalAddress || !withdrawalPreview) return
    setBusy(true); setError('')
    try {
      setWithdrawalTransfer(await walletGateway.submitWithdrawal({networkId, assetId: USDT_ASSET_ID, withdrawalAddressId: selectedWithdrawalAddress.id, netAmount: withdrawalAmount}, idempotencyKey('withdrawal')))
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const refreshWithdrawal = async () => {
    if (!withdrawalTransfer) return
    setBusy(true); setError('')
    try { setWithdrawalTransfer(await walletGateway.withdrawalStatus(withdrawalTransfer.transferId)) }
    catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const quoteCard = async () => {
    if (!productId) return
    setBusy(true); setError('')
    try { setOpeningQuote(await walletGateway.cardOpeningQuote(productId)) }
    catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const issuePhysical = async () => {
    if (!selectedProduct || selectedProduct.cardType !== 'PHYSICAL') return
    setBusy(true); setError('')
    try {
      const response = await walletGateway.createPhysicalCard({currencyId: selectedProduct.assetId, alias: cardAlias || undefined}, idempotencyKey('physical-card'))
      setCardReceipt(`Physical Card request accepted: ${JSON.stringify(response)}`)
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const reportLost = async () => {
    if (!selectedCardId) return
    setBusy(true); setError('')
    try {
      const response = await walletGateway.reportCardLost(selectedCardId, idempotencyKey('report-lost'))
      setCardReceipt(`Lost Card replacement accepted: ${JSON.stringify(response)}`)
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const previewCardTopup = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedCardId || !topupAccountId) return
    setBusy(true); setError('')
    try {
      setTopupQuote(await walletGateway.previewCardTopup(selectedCardId, {sourceWalletAccountId: topupAccountId, amount: topupAmount}))
    } catch (value) { setTopupQuote(null); setError(message(value)) } finally { setBusy(false) }
  }

  const topup = async () => {
    if (!selectedCardId || !topupAccountId || !topupQuote) return
    setBusy(true); setError('')
    try {
      const response = await walletGateway.topupCard(selectedCardId, {sourceWalletAccountId: topupAccountId, quoteId: topupQuote.quoteId}, idempotencyKey('card-topup'))
      setCardReceipt(`Card top-up ${response.status}: ${response.amount} ${response.currency} · operation ${response.operationId}`)
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  return <section id="phase2-wallet" className="panel phase2-wallet">
    <div className="panel-row"><div><h2>Prime Wallet · P1 + Phase2</h2><p className="card-action-note">Gateway: {walletDataSource} · v1 account/card contracts + v2 onchain namespace · Backend-calculated financial values only.</p></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw/> Refresh</button></div>
    <nav className="phase2-tabs" aria-label="Prime Wallet modules">
      {(['overview', 'deposit', 'withdraw', 'cards'] as const).map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
    </nav>
    {error && <div className="inline-error">{error}</div>}
    {tab === 'overview' && <div className="phase2-overview">
      <div className="total-assets"><span>Total ledger value</span><b>{total ? `${total.totalLedgerValue} ${total.valuationAssetCode}` : 'Unavailable'}</b><small>Available: {total ? `${total.totalAvailableValue} ${total.valuationAssetCode}` : 'Unavailable'} · {total?.valuationMode ?? 'No fallback valuation'}</small></div>
      <div className="record-list">{balances.map((item) => <div className="balance-record" key={item.assetCode}><b>{item.assetCode}</b><small>Ledger {item.ledgerBalance} · Pending {item.pendingBalance} · Available {item.availableBalance}</small></div>)}</div>
      <div className="record-list"><h3>Onchain transactions</h3>{onchainTransfers?.items.length ? onchainTransfers.items.map((item) => <div className="wallet-history-row" key={item.transferId}><span><b>{item.direction} · {item.assetCode}</b><small>{item.state} · {item.networkId} · {new Date(item.updatedAt).toLocaleString()}</small></span><b>{item.fees.netAmount} {item.assetCode}</b></div>) : <p>No tenant-scoped onchain transactions returned.</p>}</div>
      <p className="card-action-note">Frozen/closed accounts keep ledger value visible; Backend returns available balance as 0. The client performs no balance arithmetic.</p>
    </div>}
    {(tab === 'deposit' || tab === 'withdraw') && <label>CAIP-2 network<select value={networkId} onChange={(event) => void loadAddresses(event.target.value)} disabled={busy}>{networks.map((item) => <option key={item.caip2Id} value={item.caip2Id}>{item.displayName} · {item.caip2Id} · {item.confirmationTarget} confirmations</option>)}</select></label>}
    {tab === 'deposit' && <div className="phase2-flow">
      <div className="panel-row"><h3><ArrowDownToLine/> Onchain deposit</h3><div><button type="button" onClick={() => void allocateAddress()} disabled={busy}>Allocate address</button> <button type="button" onClick={() => void rotateAddress()} disabled={busy || !activeDepositAddress}>Rotate address</button></div></div>
      {activeDepositAddress ? <div className="address-card"><b>{activeDepositAddress.address}</b><small>{activeDepositAddress.caip10AccountId} · rotation {activeDepositAddress.rotationIndex}</small></div> : <p>No active address. Allocate one before creating a deposit intent.</p>}
      <form className="transfer-form" onSubmit={previewDeposit}><label>Expected gross amount<input value={depositAmount} onChange={(event) => {setDepositAmount(event.target.value); setDepositPreview(null)}} inputMode="decimal" pattern="^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$" required/></label><button disabled={busy || !activeDepositAddress}>Preview Backend fees and confirmations</button></form>
      {depositPreview && <div className="phase2-preview"><div><span>Preview</span><b>{depositPreview.previewId}</b></div><div><span>Gross / net</span><b>{depositPreview.fees.grossAmount} / {depositPreview.fees.netAmount} {depositPreview.assetCode}</b></div><div><span>Fees</span><b>{depositPreview.fees.platformFee} / {depositPreview.fees.networkFee} / {depositPreview.fees.fxFee} {depositPreview.assetCode}</b></div><div><span>Confirmations</span><b>{depositPreview.confirmationTarget}</b></div><div><span>Expires</span><b>{new Date(depositPreview.expiresAt).toLocaleString()}</b></div><button type="button" onClick={() => void submitDeposit()} disabled={busy}>Create deposit intent with this preview</button></div>}
      {depositTransfer && <TransferDetail transfer={depositTransfer} onRefresh={() => void refreshDeposit()} busy={busy}/>}
    </div>}
    {tab === 'withdraw' && <div className="phase2-flow">
      <h3><ArrowUpFromLine/> Onchain withdrawal</h3>
      <form className="transfer-form" onSubmit={previewWithdrawal}><label>Saved address<select value={withdrawalAddressId} onChange={(event) => {setWithdrawalAddressId(event.target.value); setWithdrawalPreview(null)}} required><option value="">Select an address-book entry</option>{eligibleWithdrawalAddresses.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.address}</option>)}</select></label><label>Net amount<input value={withdrawalAmount} onChange={(event) => {setWithdrawalAmount(event.target.value); setWithdrawalPreview(null)}} inputMode="decimal" pattern="^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$" required/></label><button disabled={busy || !selectedWithdrawalAddress}>Preview Backend fees and gates</button></form>
      {eligibleWithdrawalAddresses.length === 0 && <div className="inline-error">No saved address is eligible for this network. Direct address entry is intentionally disabled.</div>}
      {withdrawalPreview && <div className="phase2-preview"><div><span>Approval threshold</span><b>{withdrawalPreview.approvalThreshold} USDT</b></div><div><span>Approval</span><b>{withdrawalPreview.approvalRequired ? 'Required' : 'Not required'}</b></div><div><span>Compliance gate</span><b>{withdrawalPreview.complianceGateEnabled ? 'Required' : 'Unavailable'}</b></div><div><span>Cooling period</span><b>{withdrawalPreview.addressCoolingPeriodSeconds} seconds · eligible {new Date(withdrawalPreview.addressEligibleAt).toLocaleString()}</b></div><div><span>Gross</span><b>{withdrawalPreview.fees.grossAmount} USDT</b></div><div><span>Platform / network / FX</span><b>{withdrawalPreview.fees.platformFee} / {withdrawalPreview.fees.networkFee} / {withdrawalPreview.fees.fxFee} USDT</b></div><div><span>Net</span><b>{withdrawalPreview.fees.netAmount} USDT</b></div><button type="button" onClick={() => void submitWithdrawal()} disabled={busy}><ShieldCheck/> Submit to compliance</button></div>}
      {withdrawalTransfer && <TransferDetail transfer={withdrawalTransfer} onRefresh={() => void refreshWithdrawal()} busy={busy}/>}
    </div>}
    {tab === 'cards' && <div className="phase2-flow">
      <h3><WalletCards/> Card products and funding</h3>
      <label>Product<select value={productId} onChange={(event) => {setProductId(event.target.value); setOpeningQuote(null)}}><option value="">Select product</option>{products.map((item) => <option key={item.templateId} value={item.templateId}>{item.cardType} · {item.assetId} · {item.currency}</option>)}</select></label>
      <div className="panel-row"><button type="button" onClick={() => void quoteCard()} disabled={busy || !selectedProduct}>Get opening quote</button>{selectedProduct?.cardType === 'PHYSICAL' && <button type="button" onClick={() => void issuePhysical()} disabled={busy || !openingQuote}><CreditCard/> Issue physical Card</button>}</div>
      {openingQuote && <div className="phase2-preview"><div><span>Product asset</span><b>{openingQuote.assetId}</b></div><div><span>Opening fee</span><b>{openingQuote.openingFee} {openingQuote.currency}</b></div><div><span>Provider called</span><b>{openingQuote.externalProviderCalled ? 'Yes' : 'No'}</b></div></div>}
      <label>Card alias<input value={cardAlias} onChange={(event) => setCardAlias(event.target.value)} maxLength={30}/></label>
      <form className="transfer-form" onSubmit={previewCardTopup}><label>Funding wallet<select value={topupAccountId} onChange={(event) => {setTopupAccountId(event.target.value); setTopupQuote(null)}}><option value="">Select owned account</option>{accounts.map((item) => <option value={item.id} key={item.id}>{item.assetCode} · {item.availableBalance} available</option>)}</select></label><label>Top-up amount<input value={topupAmount} onChange={(event) => {setTopupAmount(event.target.value); setTopupQuote(null)}} inputMode="decimal" pattern="^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$" required/></label><button disabled={busy || !selectedCardId || !topupAccountId}>Preview Card top-up</button></form>
      {topupQuote && <div className="phase2-preview"><div><span>Quote</span><b>{topupQuote.quoteId}</b></div><div><span>Amount / debit</span><b>{topupQuote.amount} / {topupQuote.totalDebitAmount} {topupQuote.currency}</b></div><div><span>Fees</span><b>{topupQuote.fees.platformFee} / {topupQuote.fees.networkFee} / {topupQuote.fees.fxFee} {topupQuote.currency}</b></div><div><span>Expires</span><b>{new Date(topupQuote.expiresAt).toLocaleString()}</b></div><button type="button" onClick={() => void topup()} disabled={busy}>Top up selected Card with this quote</button></div>}
      <button type="button" className="danger-button" onClick={() => void reportLost()} disabled={busy || !selectedCardId}>Report selected Card lost</button>
      <p className="card-action-note">Card limits and transaction timeline remain in the P1 Card panel below. All writes use a fresh Idempotency-Key.</p>
      {cardReceipt && <div className="transfer-receipt">{cardReceipt}</div>}
    </div>}
  </section>
}
