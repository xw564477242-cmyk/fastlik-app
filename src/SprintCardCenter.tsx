import { FormEvent, useMemo, useState } from 'react'
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
type CardState = 'ACTIVE' | 'FROZEN'

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
}

const initialCards: DemoCard[] = [
  { id: 'card_virtual_4826', kind: 'VIRTUAL', status: 'ACTIVE', last4: '4826', number: '5412889033414826', expiry: '09/30', cvv: '538', balance: 4276, currency: 'USD', label: 'Primary virtual' },
  { id: 'card_physical_1533', kind: 'PHYSICAL', status: 'ACTIVE', last4: '1533', number: '5412889077251533', expiry: '11/30', cvv: '271', balance: 1850, currency: 'USD', label: 'Travel physical' },
]

const demoTransactions: DemoTransaction[] = [
  { id: 'ctx_10001', cardId: 'card_virtual_4826', merchant: 'Apple Store', category: 'Electronics', amount: -248, currency: 'USD', status: 'SETTLED', date: '2026-07-21 11:06' },
  { id: 'ctx_10002', cardId: 'card_virtual_4826', merchant: 'Grab', category: 'Transport', amount: -18.6, currency: 'MYR', status: 'SETTLED', date: '2026-07-21 09:22' },
  { id: 'ctx_10003', cardId: 'card_virtual_4826', merchant: 'AWS', category: 'Cloud services', amount: -86.2, currency: 'USD', status: 'AUTHORIZED', date: '2026-07-20 23:18' },
  { id: 'ctx_10004', cardId: 'card_virtual_4826', merchant: 'Unknown merchant', category: 'Online', amount: -120, currency: 'USD', status: 'DECLINED', date: '2026-07-20 17:40' },
  { id: 'ctx_10005', cardId: 'card_physical_1533', merchant: 'KLIA Express', category: 'Transport', amount: -55, currency: 'MYR', status: 'SETTLED', date: '2026-07-19 13:15' },
]

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

function downloadCsv(rows: DemoTransaction[]) {
  const header = ['transaction_id', 'date', 'merchant', 'category', 'amount', 'currency', 'status']
  const body = rows.map((row) => [row.id, row.date, row.merchant, row.category, row.amount, row.currency, row.status])
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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0]

  const rows = useMemo(() => demoTransactions.filter((row) => {
    const matchesCard = row.cardId === selected.id
    const matchesQuery = `${row.merchant} ${row.category} ${row.id}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'ALL' || row.status === status
    return matchesCard && matchesQuery && matchesStatus
  }), [selected.id, query, status])

  const toggleFreeze = () => {
    const next = selected.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE'
    setCards((current) => current.map((card) => card.id === selected.id ? { ...card, status: next } : card))
    notify(next === 'FROZEN' ? 'Card frozen in Sandbox' : 'Card unfrozen in Sandbox')
  }

  const revealCvv = () => {
    setCvvVisible(true)
    notify('Sandbox CVV revealed for 20 seconds')
    window.setTimeout(() => setCvvVisible(false), 20_000)
  }

  const savePin = (event: FormEvent) => {
    event.preventDefault()
    if (!/^\d{4}$/.test(pin)) {
      notify('PIN must contain exactly four digits')
      return
    }
    setPin('')
    setPinOpen(false)
    notify('PIN updated securely in Sandbox')
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
    notify(`${kind === 'VIRTUAL' ? 'Virtual' : 'Physical'} card created in Sandbox`)
  }

  return <div className="content sprint-card-center">
    <section className="card-center-heading">
      <div><span>SPRINT-06 · MOCK UAT</span><h2>FastLink Card Center</h2><p>Create and control virtual and physical cards without waiting for Thredd credentials.</p></div>
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
          <button onClick={() => setDetailsVisible((value) => !value)}>{detailsVisible ? <EyeOff/> : <Eye/>}{detailsVisible ? 'Hide details' : 'Card detail'}</button>
          <button onClick={() => setPinOpen(true)}><KeyRound/>Set PIN</button>
          <button onClick={revealCvv}><LockKeyhole/>{cvvVisible ? selected.cvv : 'Show CVV'}</button>
          <button onClick={() => notify('Wallet binding opened')}><WalletCards/>Add to wallet</button>
        </div>
        <div className="security-note"><ShieldCheck/><span><b>Protected card data</b><small>CVV auto-hides. PIN is never displayed or stored in this page.</small></span></div>
      </section>
    </section>

    <section className="panel card-transaction-panel">
      <div className="panel-title"><div><h2>Card transactions</h2><p>Authorization and settlement activity for •••• {selected.last4}</p></div><button onClick={() => downloadCsv(rows)}><Download/> Export CSV</button></div>
      <div className="card-table-tools"><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant or transaction"/></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="AUTHORIZED">Authorized</option><option value="SETTLED">Settled</option><option value="DECLINED">Declined</option></select></div>
      <div className="card-transaction-table"><div className="table-row table-head"><span>Merchant</span><span>Transaction</span><span>Status</span><span>Amount</span></div>{rows.length ? rows.map((row) => <div className="table-row" key={row.id}><span><b>{row.merchant}</b><small>{row.category} · {row.date}</small></span><span>{row.id}</span><span><i className={`tx-${row.status.toLowerCase()}`}>{row.status}</i></span><span>{money(row.amount, row.currency)}</span></div>) : <div className="empty-card-table">No transactions match the current filters.</div>}</div>
    </section>

    {pinOpen && <div className="card-modal-backdrop" role="presentation"><form className="card-pin-modal" onSubmit={savePin}><button type="button" className="modal-close" onClick={() => { setPinOpen(false); setPin('') }} aria-label="Close"><X/></button><LockKeyhole/><h3>Set card PIN</h3><p>Enter a four-digit Sandbox PIN. The value is cleared immediately after submission.</p><input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="••••" aria-label="Four digit PIN"/><button type="submit" className="save-pin"><CheckCircle2/>Save PIN</button></form></div>}
  </div>
}
