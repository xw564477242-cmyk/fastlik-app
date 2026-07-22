import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Snowflake,
  WalletCards,
  X,
} from 'lucide-react'

type CardKind = 'VIRTUAL' | 'PHYSICAL'
type CardState = 'PENDING' | 'ACTIVE' | 'FROZEN' | 'LOST' | 'STOLEN'

type DemoCard = {
  id: string
  kind: CardKind
  status: CardState
  last4: string
  number: string
  expiry: string
  cvv: string
  balance: number
  currency: string
  label: string
}

type DemoTransaction = {
  id: string
  cardId: string
  merchant: string
  category: string
  amount: number
  currency: string
  status: 'SETTLED' | 'AUTHORIZED' | 'DECLINED'
  date: string
  type: string
  billingAmount: number
  settlementAmount: number
  fee: number
  mcc: string
  stan: string
  rrn: string
  authorisationCode: string
  posEntryMode: string
  network: string
  lifecycle: string
  avs: string
  threeDsSca: string
  settlementStatus: string
}

const initialCards: DemoCard[] = [
  { id: 'card_virtual_4826', kind: 'VIRTUAL', status: 'ACTIVE', last4: '4826', number: '5412889033414826', expiry: '09/30', cvv: '538', balance: 4276, currency: 'USD', label: 'Primary virtual' },
  { id: 'card_physical_1533', kind: 'PHYSICAL', status: 'ACTIVE', last4: '1533', number: '5412889077251533', expiry: '11/30', cvv: '271', balance: 1850, currency: 'USD', label: 'Travel physical' },
]

const demoTransactions: DemoTransaction[] = [
  { id: 'ctx_10001', cardId: 'card_virtual_4826', merchant: 'Apple Store', category: 'Electronics', amount: -248, billingAmount: -248, settlementAmount: -248, fee: 0, currency: 'USD', status: 'SETTLED', date: '2026-07-21 11:06', type: 'Purchase', mcc: '5732', stan: '184205', rrn: '602021184205', authorisationCode: 'A18420', posEntryMode: 'ECOMMERCE', network: 'Mastercard', lifecycle: 'Authorised → Cleared → Settled', avs: 'MATCH', threeDsSca: '3DS 2.2 · SCA applied', settlementStatus: 'SETTLED' },
  { id: 'ctx_10002', cardId: 'card_virtual_4826', merchant: 'Grab', category: 'Transport', amount: -18.6, billingAmount: -4.12, settlementAmount: -18.6, fee: .12, currency: 'MYR', status: 'SETTLED', date: '2026-07-21 09:22', type: 'Purchase', mcc: '4121', stan: '184001', rrn: '602021184001', authorisationCode: 'G18401', posEntryMode: 'TOKENISED', network: 'Mastercard', lifecycle: 'Authorised → Settled', avs: 'NOT_APPLICABLE', threeDsSca: 'Wallet token cryptogram', settlementStatus: 'SETTLED' },
  { id: 'ctx_10003', cardId: 'card_virtual_4826', merchant: 'AWS', category: 'Cloud services', amount: -86.2, billingAmount: -86.2, settlementAmount: 0, fee: 0, currency: 'USD', status: 'AUTHORIZED', date: '2026-07-20 23:18', type: 'Purchase', mcc: '7372', stan: '183818', rrn: '602020183818', authorisationCode: 'W18381', posEntryMode: 'ECOMMERCE', network: 'Visa', lifecycle: 'Authorised', avs: 'MATCH', threeDsSca: '3DS 2.2 · frictionless', settlementStatus: 'PENDING' },
  { id: 'ctx_10004', cardId: 'card_virtual_4826', merchant: 'Unknown merchant', category: 'Online', amount: -120, billingAmount: -120, settlementAmount: 0, fee: 0, currency: 'USD', status: 'DECLINED', date: '2026-07-20 17:40', type: 'Purchase', mcc: '5999', stan: '177402', rrn: '602020177402', authorisationCode: '—', posEntryMode: 'ECOMMERCE', network: 'Mastercard', lifecycle: 'Declined', avs: 'NO_MATCH', threeDsSca: 'Challenge failed', settlementStatus: 'NOT_APPLICABLE' },
  { id: 'ctx_10005', cardId: 'card_physical_1533', merchant: 'KLIA Express', category: 'Transport', amount: -55, billingAmount: -12.2, settlementAmount: -55, fee: .2, currency: 'MYR', status: 'SETTLED', date: '2026-07-19 13:15', type: 'Purchase', mcc: '4112', stan: '131505', rrn: '602019131505', authorisationCode: 'K13150', posEntryMode: 'CONTACTLESS', network: 'Mastercard', lifecycle: 'Authorised → Cleared → Settled', avs: 'NOT_APPLICABLE', threeDsSca: 'Card present', settlementStatus: 'SETTLED' },
]

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

function downloadCsv(rows: DemoTransaction[]) {
  const header = ['transaction_id', 'date', 'type', 'merchant', 'mcc', 'amount', 'billing_amount', 'settlement_amount', 'fee', 'currency', 'status', 'stan', 'rrn', 'authorisation_code', 'pos_entry_mode', 'network', 'lifecycle', 'avs', 'three_ds_sca', 'settlement_status']
  const body = rows.map((row) => [row.id, row.date, row.type, row.merchant, row.mcc, row.amount, row.billingAmount, row.settlementAmount, row.fee, row.currency, row.status, row.stan, row.rrn, row.authorisationCode, row.posEntryMode, row.network, row.lifecycle, row.avs, row.threeDsSca, row.settlementStatus])
  const csv = [header, ...body].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'fastlink-card-transactions.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function SprintCardCenter({ notify }: { notify: (message: string) => void }) {
  const [cards, setCards] = useState(initialCards)
  const [selectedId, setSelectedId] = useState(initialCards[0].id)
  const [detailsVisible, setDetailsVisible] = useState(false)
  const [cvvVisible, setCvvVisible] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [reauthTarget, setReauthTarget] = useState<'DETAILS' | 'CVV' | null>(null)
  const [reauthPhrase, setReauthPhrase] = useState('')
  const [selectedTransaction, setSelectedTransaction] = useState<DemoTransaction | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0]

  useEffect(() => {
    const hide = () => { setDetailsVisible(false); setCvvVisible(false) }
    const visibility = () => { if (document.hidden) hide() }
    window.addEventListener('blur', hide)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('blur', hide); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  const rows = useMemo(() => demoTransactions.filter((row) => {
    const matchesCard = row.cardId === selected.id
    const matchesQuery = `${row.merchant} ${row.category} ${row.id}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'ALL' || row.status === status
    return matchesCard && matchesQuery && matchesStatus
  }), [selected.id, query, status])

  const toggleFreeze = () => {
    const next = selected.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE'
    setCards((current) => current.map((card) => card.id === selected.id ? { ...card, status: next } : card))
    notify(next === 'FROZEN' ? 'Card frozen in MOCK' : 'Card unfrozen in MOCK')
  }

  const requestReveal = (target: 'DETAILS' | 'CVV') => {
    setReauthPhrase('')
    setReauthTarget(target)
  }

  const confirmReveal = (event: FormEvent) => {
    event.preventDefault()
    if (reauthPhrase !== 'MOCK') { notify('Enter MOCK to confirm the clearly-labelled demo re-authentication'); return }
    if (reauthTarget === 'DETAILS') setDetailsVisible(true)
    if (reauthTarget === 'CVV') setCvvVisible(true)
    setReauthTarget(null);setReauthPhrase('')
    notify('MOCK detail revealed for 20 seconds; production re-authentication remains BLOCKED')
    window.setTimeout(() => { setDetailsVisible(false); setCvvVisible(false) }, 20_000)
  }

  const savePin = (event: FormEvent) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(pin)) {
      notify('PIN must contain exactly four digits')
      return
    }
    setPin('')
    setPinOpen(false)
    notify('PIN updated in MOCK; no PIN was persisted')
  }

  const createCard = (kind: CardKind) => {
    const id = `card_${kind.toLowerCase()}_${cards.length + 1}`
    const last4 = String(6100 + cards.length)
    const card: DemoCard = {
      id,
      kind,
      status: 'ACTIVE',
      last4,
      number: `541288907725${last4}`,
      expiry: '12/30',
      cvv: '406',
      balance: 0,
      currency: 'USD',
      label: kind === 'VIRTUAL' ? 'New virtual' : 'New physical',
    }
    setCards((current) => [...current, card])
    setSelectedId(id)
    notify(`${kind === 'VIRTUAL' ? 'Virtual' : 'Physical'} card created in MOCK`)
  }

  const lifecycleAction = (action: string, next?: CardState) => {
    if (next) setCards((current) => current.map((card) => card.id === selected.id ? { ...card, status: next } : card))
    notify(`${action} recorded in MOCK only`)
  }

  return <div className="content sprint-card-center">
    <section className="card-center-heading">
      <div><span>CONTRACT V2.0 · THR-APP-001 · DATA SOURCE: MOCK · NOT UAT</span><h2>FastLink Card Center</h2><p>Local UI contract preview. Real authorization is server-side inbound Thredd EHI; no UAT request, audit record or database write is represented here.</p></div>
      <div className="card-create-actions"><button onClick={() => createCard('VIRTUAL')}><Plus/>Virtual card</button><button onClick={() => createCard('PHYSICAL')}><Plus/>Physical card</button></div>
    </section>

    <section className="card-selector" aria-label="Card list">
      {cards.map((card) => <button key={card.id} className={card.id === selected.id ? 'active' : ''} onClick={() => { setSelectedId(card.id); setDetailsVisible(false); setCvvVisible(false) }}>
        <CreditCard/><span><b>{card.label}</b><small>{card.kind} · •••• {card.last4}</small></span><i className={card.status.toLowerCase()}>{card.status}</i><ChevronRight/>
      </button>)}
    </section>

    <section className="cards-layout sprint-card-layout">
      <div className={`large-card ${selected.status === 'FROZEN' ? 'frozen' : ''}`}>
        <div className="card-brand"><b>FastLink</b><span>{selected.status === 'FROZEN' ? 'FROZEN' : selected.kind}</span></div>
        <div className="contactless">)))</div>
        <strong>{detailsVisible ? selected.number.replace(/(.{4})/g, '$1 ').trim() : `••••  ••••  ••••  ${selected.last4}`}</strong>
        <div className="card-bottom"><span><small>CARDHOLDER</small>FASTLINK DEMO</span><span><small>VALID THRU</small>{selected.expiry}</span><b>mastercard</b></div>
      </div>

      <section className="card-control panel">
        <span>AVAILABLE BALANCE</span><strong>{money(selected.balance, selected.currency)}</strong>
        <p>Provider <b>THREDD_MOCK</b></p><p>Card token <b>{selected.id}</b></p>
        <div className="control-grid sprint-controls">
          <button onClick={toggleFreeze}><Snowflake/>{selected.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}</button>
          <button onClick={() => detailsVisible ? setDetailsVisible(false) : requestReveal('DETAILS')}>{detailsVisible ? <EyeOff/> : <Eye/>}{detailsVisible ? 'Hide details' : 'Card detail'}</button>
          <button onClick={() => setPinOpen(true)}><KeyRound/>Set PIN</button>
          <button onClick={() => cvvVisible ? setCvvVisible(false) : requestReveal('CVV')}><LockKeyhole/>{cvvVisible ? selected.cvv : 'Show CVV'}</button>
          <button onClick={() => notify('Wallet binding opened in MOCK')}><WalletCards/>Add to wallet</button>
        </div>
        <div className="security-note"><ShieldCheck/><span><b>Protected card data · MOCK contract preview · THR-APP-001</b><small>Mock secondary confirmation is required; details auto-hide after 20 seconds, blur or backgrounding. Production server re-authentication is BLOCKED: no real Backend UAT Environment. Mock is not production validation.</small></span></div>
      </section>
    </section>

    <section className="panel card-services"><div className="panel-title"><div><h2>Card lifecycle & controls</h2><p>Every button is explicitly local MOCK state; no provider call is implied.</p></div></div><div className="service-grid">{[
      ['Activate',()=>lifecycleAction('Activate','ACTIVE')],['Lost',()=>lifecycleAction('Lost','LOST')],['Stolen',()=>lifecycleAction('Stolen','STOLEN')],
      ['Renew',()=>lifecycleAction('Renew')],['Replace',()=>lifecycleAction('Replace')],['Card controls',()=>lifecycleAction('Card controls')],
      ['Card limits',()=>lifecycleAction('Card limits')],['Load',()=>lifecycleAction('Load')],['Unload',()=>lifecycleAction('Unload')],
      ['Transfer',()=>lifecycleAction('Transfer')],['Card image',()=>lifecycleAction('Card image')],['Virtual → Physical',()=>lifecycleAction('Virtual to Physical')],
    ].map(([label,run])=><button key={label as string} onClick={run as ()=>void}><ShieldCheck/><div><b>{label as string}</b><small>MOCK only</small></div><ChevronRight/></button>)}</div></section>

    <section className="panel card-transaction-panel">
      <div className="panel-title"><div><h2>Card transactions</h2><p>Authorization and settlement activity for •••• {selected.last4}</p></div><button onClick={() => downloadCsv(rows)}><Download/> Export CSV</button></div>
      <div className="card-table-tools"><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant or transaction"/></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="AUTHORIZED">Authorized</option><option value="SETTLED">Settled</option><option value="DECLINED">Declined</option></select></div>
      <div className="card-transaction-table"><div className="table-row table-head"><span>Merchant</span><span>Transaction</span><span>Status</span><span>Amount / Fee</span></div>{rows.length ? rows.map((row) => <button className="table-row transaction-button" key={row.id} onClick={()=>setSelectedTransaction(row)}><span><b>{row.merchant}</b><small>MCC {row.mcc} · {row.date}</small></span><span>{row.id}<small>{row.lifecycle}</small></span><span><i className={`tx-${row.status.toLowerCase()}`}>{row.status}</i></span><span>{money(row.amount, row.currency)}<small>Fee {money(row.fee,row.currency)}</small></span></button>) : <div className="empty-card-table">No transactions match the current filters.</div>}</div>
    </section>

    {selectedTransaction&&<section className="panel mock-transaction-detail"><div className="panel-title"><div><h2>Transaction Detail · {selectedTransaction.id}</h2><p>Data Source: MOCK · friendly fields only</p></div><button onClick={()=>setSelectedTransaction(null)}><X/> Close</button></div><div className="detail-grid">{[
      ['Type / Status',`${selectedTransaction.type} · ${selectedTransaction.status}`],['Transaction amount',money(selectedTransaction.amount,selectedTransaction.currency)],['Billing amount',money(selectedTransaction.billingAmount,selectedTransaction.currency)],
      ['Settlement amount',money(selectedTransaction.settlementAmount,selectedTransaction.currency)],['Fee',money(selectedTransaction.fee,selectedTransaction.currency)],['Merchant / MCC',`${selectedTransaction.merchant} · ${selectedTransaction.mcc}`],
      ['Time',selectedTransaction.date],['STAN',selectedTransaction.stan],['RRN',selectedTransaction.rrn],['Authorization Code',selectedTransaction.authorisationCode],['POS Entry Mode',selectedTransaction.posEntryMode],
      ['Card Network',selectedTransaction.network],['Lifecycle',selectedTransaction.lifecycle],['AVS',selectedTransaction.avs],['3DS / SCA',selectedTransaction.threeDsSca],['Settlement Status',selectedTransaction.settlementStatus],
    ].map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>}

    {pinOpen && <div className="card-modal-backdrop" role="presentation"><form className="card-pin-modal" onSubmit={savePin}><button type="button" className="modal-close" onClick={() => { setPinOpen(false); setPin('') }} aria-label="Close"><X/></button><LockKeyhole/><h3>Set card PIN · MOCK</h3><p>Enter a four-digit mock PIN. The value is cleared immediately and is never persisted.</p><input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="••••" aria-label="Four digit PIN"/><button type="submit" className="save-pin"><CheckCircle2/>Save MOCK PIN</button></form></div>}
    {reauthTarget&&<div className="card-modal-backdrop" role="presentation"><form className="card-pin-modal" onSubmit={confirmReveal}><button type="button" className="modal-close" onClick={()=>setReauthTarget(null)} aria-label="Close"><X/></button><LockKeyhole/><h3>Secondary confirmation · MOCK</h3><p>This is only a UI contract preview. Enter <b>MOCK</b> to reveal synthetic {reauthTarget==='CVV'?'CVV':'card data'}; production must use server-side re-authentication.</p><input autoFocus value={reauthPhrase} onChange={event=>setReauthPhrase(event.target.value.toUpperCase())} autoComplete="off"/><button type="submit" className="save-pin"><CheckCircle2/>Confirm MOCK reveal</button></form></div>}
  </div>
}
