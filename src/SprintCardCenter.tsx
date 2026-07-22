import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import {
  CardApiError,
  CardClient,
  CardProduct,
  CardRecord,
  CardType,
  DataSource,
  cardApi,
} from './cardApi'

type ApplicationForm = {
  cardType: CardType
  partnerCardProductId: string
  cardDesignId: string
  language: string
  deliveryMethod: string
}

const emptyForm = (cardType: CardType): ApplicationForm => ({
  cardType,
  partnerCardProductId: '',
  cardDesignId: '',
  language: '',
  deliveryMethod: '',
})

const sourceLabels: Record<DataSource, string> = {
  SANDBOX: 'Sandbox',
  OFFICIAL_UAT: 'Official UAT',
  PRODUCTION: 'Production',
}

function money(value: { amount: number; currency: string }) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: value.currency }).format(value.amount)
}

function statusLabel(status: CardRecord['status']) {
  return status.replace('_', ' ')
}

function errorMessage(error: unknown) {
  if (error instanceof CardApiError) {
    return error.traceId ? `${error.message} · Trace ${error.traceId}` : error.message
  }
  return 'Card service is unavailable. No mock data was loaded.'
}

export function SprintCardCenter({
  notify,
  api = cardApi,
}: {
  notify: (message: string) => void
  api?: CardClient
}) {
  const [cards, setCards] = useState<CardRecord[]>([])
  const [selectedReference, setSelectedReference] = useState('')
  const [dataSource, setDataSource] = useState<DataSource | null>(null)
  const [traceId, setTraceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applicationType, setApplicationType] = useState<CardType | null>(null)
  const [busyPreference, setBusyPreference] = useState<'3DS' | 'NETWORK' | null>(null)

  const selected = cards.find((card) => card.cardReference === selectedReference) ?? cards[0]

  const loadCards = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const envelope = await api.listCards()
      setCards(envelope.data)
      setDataSource(envelope.meta.dataSource)
      setTraceId(envelope.meta.traceId)
      setSelectedReference((current) => envelope.data.some((card) => card.cardReference === current)
        ? current
        : envelope.data[0]?.cardReference ?? '')
    } catch (loadError) {
      setCards([])
      setDataSource(null)
      setTraceId('')
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void loadCards() }, [loadCards])

  const updateThreeDSecure = async (language: string) => {
    if (!selected) return
    setBusyPreference('3DS')
    try {
      const result = await api.updateThreeDSecure(selected.cardReference, { language })
      setCards((current) => current.map((card) => card.cardReference === selected.cardReference ? result.data : card))
      setDataSource(result.meta.dataSource)
      setTraceId(result.meta.traceId)
      notify('3DS preference updated')
    } catch (preferenceError) {
      notify(errorMessage(preferenceError))
    } finally {
      setBusyPreference(null)
    }
  }

  const updateNetworkSharing = async (enabled: boolean) => {
    if (!selected) return
    setBusyPreference('NETWORK')
    try {
      const result = await api.updateNetworkSharing(selected.cardReference, enabled)
      setCards((current) => current.map((card) => card.cardReference === selected.cardReference ? result.data : card))
      setDataSource(result.meta.dataSource)
      setTraceId(result.meta.traceId)
      notify('Network sharing preference updated')
    } catch (preferenceError) {
      notify(errorMessage(preferenceError))
    } finally {
      setBusyPreference(null)
    }
  }

  return <div className="content sprint-card-center">
    <section className="card-center-heading">
      <div>
        <span>THR-001—THR-008 · CROSS-PLATFORM ALIGNMENT</span>
        <h2>FastLink Card Center</h2>
        <p>Apply, track and manage your cards using verified partner data.</p>
      </div>
      <div className="card-create-actions">
        <button onClick={() => setApplicationType('VIRTUAL')}><Plus />Virtual card</button>
        <button onClick={() => setApplicationType('PHYSICAL')}><Plus />Physical card</button>
      </div>
    </section>

    <section className={`data-source-banner ${error ? 'source-error' : ''}`} aria-live="polite">
      <div>
        {error ? <AlertTriangle /> : <ShieldCheck />}
        <span><b>Data source</b><small>{dataSource ? sourceLabels[dataSource] : 'Not verified'}</small></span>
      </div>
      <span>{error || (traceId ? `Trace ${traceId}` : loading ? 'Verifying connection…' : 'Connected')}</span>
      <button onClick={() => void loadCards()} disabled={loading}><RefreshCw />Refresh</button>
    </section>

    {loading && <section className="card-empty-state"><RefreshCw className="spin" /><h3>Loading verified card data</h3><p>No cached or mock card record will be shown.</p></section>}

    {!loading && error && <section className="card-empty-state card-error-state"><AlertTriangle /><h3>Card data unavailable</h3><p>{error}</p><button onClick={() => void loadCards()}>Try again</button></section>}

    {!loading && !error && cards.length === 0 && <section className="card-empty-state"><CreditCard /><h3>No cards yet</h3><p>Start with a virtual or physical card application. Cardholder details are read from your verified KYC profile.</p></section>}

    {!loading && !error && selected && <>
      <section className="card-selector" aria-label="Card list">
        {cards.map((card) => <button key={card.cardReference} className={card.cardReference === selected.cardReference ? 'active' : ''} onClick={() => setSelectedReference(card.cardReference)}>
          <CreditCard />
          <span><b>{card.productName}</b><small>{card.type} · •••• {card.last4}</small></span>
          <i className={card.status.toLowerCase()}>{statusLabel(card.status)}</i>
          <ChevronRight />
        </button>)}
      </section>

      <section className="cards-layout sprint-card-layout">
        <div className={`large-card ${selected.status === 'FROZEN' ? 'frozen' : ''}`}>
          <div className="card-brand"><b>FastLink</b><span>{selected.type}</span></div>
          <div className="card-design-name">{selected.design?.name ?? 'Classic'}</div>
          <strong>•••• &nbsp;•••• &nbsp;•••• &nbsp;{selected.last4}</strong>
          <div className="card-bottom"><span><small>NAME ON CARD</small>{selected.nameOnCard}</span><span><small>STATUS</small>{statusLabel(selected.status)}</span><b>{selected.network.toLowerCase()}</b></div>
        </div>

        <section className="card-control panel card-balance-panel">
          <span>TOTAL BALANCE</span><strong>{money(selected.balance.total)}</strong>
          <div className="balance-breakdown">
            <p><span>Available</span><b>{money(selected.balance.available)}</b></p>
            <p><span>Pending</span><b>{money(selected.balance.pending)}</b></p>
          </div>
          <dl className="card-facts">
            <div><dt>Card type</dt><dd>{selected.type}</dd></div>
            <div><dt>Network</dt><dd>{selected.network}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(selected.status)}</dd></div>
            <div><dt>Product</dt><dd>{selected.productName}</dd></div>
          </dl>
          <div className="security-note"><ShieldCheck /><span><b>Protected card data</b><small>Full PAN, CVV and provider credentials are never returned to this screen.</small></span></div>
        </section>
      </section>

      <section className="card-detail-grid">
        <article className="panel profile-card">
          <div className="detail-title"><UserRound /><div><h3>Cardholder profile</h3><p>Maintained separately from the source KYC record.</p></div></div>
          <dl><div><dt>Name</dt><dd>{selected.cardholder.displayName}</dd></div>{selected.cardholder.emailMasked && <div><dt>Email</dt><dd>{selected.cardholder.emailMasked}</dd></div>}{selected.cardholder.phoneMasked && <div><dt>Phone</dt><dd>{selected.cardholder.phoneMasked}</dd></div>}</dl>
        </article>

        <article className="panel profile-card">
          <div className="detail-title"><MapPin /><div><h3>Delivery</h3><p>Address and fulfilment progress.</p></div></div>
          {selected.type === 'PHYSICAL' ? <>
            {selected.deliveryAddress ? <address>{selected.deliveryAddress.line1}<br />{selected.deliveryAddress.line2 && <>{selected.deliveryAddress.line2}<br /></>}{selected.deliveryAddress.city}, {selected.deliveryAddress.postalCode}<br />{selected.deliveryAddress.country}</address> : <p className="muted">Delivery address pending.</p>}
            <div className="fulfilment-status"><PackageCheck /><span><small>Fulfilment</small><b>{selected.fulfilment?.status.replaceAll('_', ' ') ?? 'PENDING'}</b></span></div>
          </> : <p className="muted">Not required for a virtual card.</p>}
        </article>

        <article className="panel profile-card preference-card">
          <div className="detail-title"><ShieldCheck /><div><h3>Security & privacy</h3><p>Only customer-manageable controls are exposed.</p></div></div>
          <PreferenceSelect label="3DS challenge language" value={selected.threeDSecure.language ?? ''} options={selected.threeDSecure.allowedLanguages ?? []} disabled={!selected.threeDSecure.userManageable || busyPreference !== null} onChange={(language) => void updateThreeDSecure(language)} />
          <PreferenceToggle label="Network sharing" checked={selected.networkSharing.enabled} disabled={!selected.networkSharing.userManageable || busyPreference !== null} onChange={(enabled) => void updateNetworkSharing(enabled)} />
        </article>
      </section>

      {selected.relationships?.enabled && <section className="panel relationship-panel">
        <div className="panel-title"><div><h2>Linked cards</h2><p>Parent and child relationships enabled by this card product.</p></div></div>
        <div className="relationship-list">
          {selected.relationships.parent && <div><span>Parent</span><b>{selected.relationships.parent.label}</b><small>•••• {selected.relationships.parent.last4}</small></div>}
          {selected.relationships.children?.map((child) => <div key={child.cardReference}><span>Child</span><b>{child.label}</b><small>•••• {child.last4}</small></div>)}
        </div>
      </section>}
    </>}

    {applicationType && <CardApplicationModal
      api={api}
      cardType={applicationType}
      onClose={() => setApplicationType(null)}
      onCreated={(card, source, newTraceId) => {
        setCards((current) => [...current, card])
        setSelectedReference(card.cardReference)
        setDataSource(source)
        setTraceId(newTraceId)
        setApplicationType(null)
        notify(`${card.type === 'VIRTUAL' ? 'Virtual' : 'Physical'} card application submitted`)
      }}
      notify={notify}
    />}
  </div>
}

function PreferenceToggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="preference-toggle"><span><b>{label}</b><small>{disabled ? 'Managed by your card product' : 'You may update this setting'}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>
}

function PreferenceSelect({ label, value, options, disabled, onChange }: { label: string; value: string; options: string[]; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="preference-toggle"><span><b>{label}</b><small>{disabled ? 'Managed by your card product' : 'You may update this setting'}</small></span><select aria-label={label} value={value} disabled={disabled || options.length === 0} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}

function CardApplicationModal({
  api,
  cardType,
  onClose,
  onCreated,
  notify,
}: {
  api: CardClient
  cardType: CardType
  onClose: () => void
  onCreated: (card: CardRecord, source: DataSource, traceId: string) => void
  notify: (message: string) => void
}) {
  const [form, setForm] = useState(() => emptyForm(cardType))
  const [products, setProducts] = useState<CardProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let active = true
    setLoadingProducts(true)
    api.listProducts(cardType).then((result) => {
      if (!active) return
      setProducts(result.data)
      setForm((current) => ({
        ...current,
        partnerCardProductId: result.data[0]?.partnerCardProductId ?? '',
        cardDesignId: result.data[0]?.designChoices[0]?.id ?? '',
        language: result.data[0]?.manufacturingChoices?.languages?.[0] ?? '',
        deliveryMethod: String(result.data[0]?.manufacturingChoices?.deliveryMethods?.[0]?.code ?? ''),
      }))
    }).catch((productError) => {
      if (active) setFormError(errorMessage(productError))
    }).finally(() => {
      if (active) setLoadingProducts(false)
    })
    return () => { active = false }
  }, [api, cardType])

  const selectedProduct = useMemo(() => products.find((product) => product.partnerCardProductId === form.partnerCardProductId), [form.partnerCardProductId, products])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError('')
    if (!form.partnerCardProductId) {
      setFormError('Choose an approved card product.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.applyForCard({
        partnerCardProductId: form.partnerCardProductId,
        cardType,
        cardDesignId: form.cardDesignId || undefined,
        manufacturing: form.language || form.deliveryMethod ? {
          ...(form.language ? { language: form.language } : {}),
          ...(form.deliveryMethod ? { deliveryMethod: Number(form.deliveryMethod) } : {}),
        } : undefined,
      })
      onCreated(result.data, result.meta.dataSource, result.meta.traceId)
    } catch (submitError) {
      const message = errorMessage(submitError)
      setFormError(message)
      notify(message)
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="card-modal-backdrop" role="presentation">
    <form className="card-application-modal" onSubmit={submit} aria-label={`${cardType.toLowerCase()} card application`}>
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
      <CreditCard />
      <h3>Apply for a {cardType.toLowerCase()} card</h3>
      <p>Your verified identity comes from KYC. It is not re-entered here.</p>
      {formError && <div className="form-error" role="alert"><AlertTriangle />{formError}</div>}
      <label>Card product<select disabled={loadingProducts || submitting} value={form.partnerCardProductId} onChange={(event) => { const product = products.find((item) => item.partnerCardProductId === event.target.value); setForm((current) => ({ ...current, partnerCardProductId: event.target.value, cardDesignId: product?.designChoices[0]?.id ?? '', language: product?.manufacturingChoices?.languages?.[0] ?? '', deliveryMethod: String(product?.manufacturingChoices?.deliveryMethods?.[0]?.code ?? '') })) }}><option value="">{loadingProducts ? 'Loading verified products…' : 'Select product'}</option>{products.map((product) => <option key={product.partnerCardProductId} value={product.partnerCardProductId}>{product.name} · {product.network}</option>)}</select></label>
      {!!selectedProduct?.designChoices.length && <label>Card design<select value={form.cardDesignId} onChange={(event) => setForm((current) => ({ ...current, cardDesignId: event.target.value }))}>{selectedProduct.designChoices.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}</select></label>}
      {!!selectedProduct?.manufacturingChoices?.languages?.length && <label>Card language<select value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))}>{selectedProduct.manufacturingChoices.languages.map((language) => <option key={language} value={language}>{language}</option>)}</select></label>}
      {cardType === 'PHYSICAL' && !!selectedProduct?.manufacturingChoices?.deliveryMethods?.length && <label>Delivery method<select value={form.deliveryMethod} onChange={(event) => setForm((current) => ({ ...current, deliveryMethod: event.target.value }))}>{selectedProduct.manufacturingChoices.deliveryMethods.map((method) => <option key={method.code} value={method.code}>{method.label}</option>)}</select></label>}
      <div className="kyc-source-note"><CheckCircle2 /><span><b>Verified KYC profile</b><small>Cardholder identity, name on card and delivery address are mapped by the backend.</small></span></div>
      <button type="submit" className="application-submit" disabled={submitting || loadingProducts || products.length === 0}>{submitting ? 'Submitting…' : 'Submit application'}</button>
    </form>
  </div>
}
