import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, BarChart3, Bell, ChevronRight, CircleDollarSign, CreditCard, Eye, EyeOff, Home, Landmark, Plus, QrCode, ScanLine, Send, ShieldCheck, Snowflake, UserRound, WalletCards } from 'lucide-react'
import { SprintCardCenter } from './SprintCardCenter'

type Page = 'wallet' | 'cards' | 'dashboard'
type Toast = string | null

const assets = [
  { code: 'USDT', name: 'Tether', network: 'BSC · Ethereum · Base', amount: '12,480.50', fiat: '$12,480.50', color: '#26a17b' },
  { code: 'USDC', name: 'USD Coin', network: 'Ethereum · Base', amount: '2,150.00', fiat: '$2,150.00', color: '#2775ca' },
  { code: 'USD', name: 'US Dollar', network: 'Fiat Wallet', amount: '4,820.36', fiat: '$4,820.36', color: '#4e8e65' },
  { code: 'MYR', name: 'Malaysian Ringgit', network: 'Fiat Wallet', amount: '8,240.00', fiat: '$1,868.48', color: '#f0b541' },
]

const transactions = [
  { icon: ArrowDownLeft, name: 'USDT Deposit', meta: 'BSC · 18 confirmations', amount: '+2,000.00 USDT', time: '今天 14:28', positive: true },
  { icon: CreditCard, name: 'Apple Store', meta: 'FastLink Virtual · USD', amount: '-$248.00', time: '今天 11:06', positive: false },
  { icon: Send, name: 'Internal Transfer', meta: 'To FL-880214', amount: '-320.00 USDT', time: '昨天 18:42', positive: false },
  { icon: CircleDollarSign, name: 'USDT → USD', meta: 'FX conversion completed', amount: '+$594.00', time: '昨天 09:18', positive: true },
]

function route(): Page {
  const value = window.location.hash.replace('#/', '')
  return value === 'cards' || value === 'dashboard' ? value : 'wallet'
}

export default function App() {
  const [page, setPage] = useState<Page>(route())
  const [hidden, setHidden] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  useEffect(() => { const onHash = () => setPage(route()); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  const go = (next: Page) => { window.location.hash = `/${next}`; setPage(next) }
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2200) }
  return <div className="app-frame"><Sidebar page={page} go={go} /><main className="main-shell"><Topbar page={page} />{page === 'wallet' && <WalletHome hidden={hidden} setHidden={setHidden} notify={notify} go={go} />}{page === 'cards' && <SprintCardCenter notify={notify} />}{page === 'dashboard' && <Dashboard />}</main><MobileNav page={page} go={go} />{toast && <div className="toast"><ShieldCheck size={18}/>{toast}</div>}</div>
}

function Sidebar({page, go}:{page:Page;go:(p:Page)=>void}) {
  return <aside className="sidebar"><div className="brand"><span>F</span><div><b>FastLink</b><small>GLOBAL WALLET</small></div></div><nav><button className={page==='wallet'?'active':''} onClick={()=>go('wallet')}><Home/>Wallet</button><button className={page==='cards'?'active':''} onClick={()=>go('cards')}><CreditCard/>Card Center</button><button className={page==='dashboard'?'active':''} onClick={()=>go('dashboard')}><BarChart3/>Dashboard</button></nav><div className="secure"><ShieldCheck/><div><b>Funds protected</b><small>Multi-layer security</small></div></div><button className="profile"><span>WX</span><div><b>Wei Xiong</b><small>Personal Account</small></div><ChevronRight/></button></aside>
}

function Topbar({page}:{page:Page}) {
  const titles={wallet:['Wallet','Manage digital assets, fiat and cards in one place.'],cards:['Card Center','Control your virtual and physical FastLink cards.'],dashboard:['Dashboard','Your financial activity and portfolio overview.']}
  return <header className="topbar"><div><h1>{titles[page][0]}</h1><p>{titles[page][1]}</p></div><div className="top-actions"><span className="live-dot">Sandbox</span><button><Bell/><i/></button><button><UserRound/></button></div></header>
}

function WalletHome({hidden,setHidden,notify,go}:{hidden:boolean;setHidden:(v:boolean)=>void;notify:(s:string)=>void;go:(p:Page)=>void}) {
  return <div className="content"><section className="balance-hero"><div><span>TOTAL ASSETS <button onClick={()=>setHidden(!hidden)}>{hidden?<Eye/>:<EyeOff/>}</button></span><strong>{hidden?'••••••':'$21,319.34'}</strong><p><b>+2.84%</b> in the last 30 days</p></div><div className="balance-split"><button><i className="crypto"/><span>Digital assets</span><b>{hidden?'••••':'$14,630.50'}</b></button><button><i className="fiat"/><span>Fiat wallet</span><b>{hidden?'••••':'$6,688.84'}</b></button><button onClick={()=>go('cards')}><i className="card"/><span>Card balance</span><b>{hidden?'••••':'$4,276.00'}</b></button></div></section><section className="quick-actions">{[[Plus,'Deposit'],[ArrowUpRight,'Withdraw'],[Send,'Transfer'],[ScanLine,'Scan & Pay']].map(([Icon,label])=><button key={label as string} onClick={()=>notify(`${label} flow opened in Sandbox`)}><span><Icon/></span>{label as string}</button>)}</section><div className="grid-two"><section className="panel"><div className="panel-title"><div><h2>My assets</h2><p>Digital assets and fiat accounts</p></div><button>Manage <ChevronRight/></button></div><div className="asset-list">{assets.map(asset=><button key={asset.code} onClick={()=>notify(`${asset.code} account opened`)}><span className="coin" style={{background:asset.color}}>{asset.code[0]}</span><div><b>{asset.code}</b><small>{asset.name} · {asset.network}</small></div><section><b>{hidden?'••••':asset.amount}</b><small>{hidden?'••••':asset.fiat}</small></section><ChevronRight/></button>)}</div></section><section className="panel card-preview"><div className="panel-title"><div><h2>FastLink Card</h2><p>Ready for global spending</p></div><button onClick={()=>go('cards')}>Card Center <ChevronRight/></button></div><MiniCard/><div className="card-stats"><p><span>Available</span><b>$4,276.00</b></p><p><span>This month</span><b>$1,284.60</b></p></div></section></div><section className="panel transactions"><div className="panel-title"><div><h2>Recent activity</h2><p>Wallet, exchange and card transactions</p></div><button>View all <ChevronRight/></button></div>{transactions.map(({icon:Icon,...tx})=><div className="transaction" key={tx.name+tx.time}><span><Icon/></span><div><b>{tx.name}</b><small>{tx.meta}</small></div><section><b className={tx.positive?'positive':''}>{tx.amount}</b><small>{tx.time}</small></section></div>)}</section></div>
}

function MiniCard(){return <div className="mini-card"><div className="card-brand"><b>FastLink</b><span>VIRTUAL</span></div><div className="chip"/><strong>•••• &nbsp;•••• &nbsp;•••• &nbsp;4826</strong><div className="card-bottom"><span><small>VALID THRU</small>09/30</span><b>mastercard</b></div></div>}

function CardCenter({frozen,setFrozen,notify}:{frozen:boolean;setFrozen:(v:boolean)=>void;notify:(s:string)=>void}) {
  const [physical,setPhysical]=useState(false)
  return <div className="content"><section className="cards-layout"><div className={`large-card ${frozen?'frozen':''}`}><div className="card-brand"><b>FastLink</b><span>{frozen?'FROZEN':'VIRTUAL'}</span></div><div className="contactless">)))</div><strong>5412 &nbsp; 8890 &nbsp; 3341 &nbsp; 4826</strong><div className="card-bottom"><span><small>CARDHOLDER</small>WEI XIONG</span><span><small>VALID THRU</small>09/30</span><b>mastercard</b></div></div><section className="card-control panel"><span>AVAILABLE BALANCE</span><strong>$4,276.00</strong><p>Monthly spending <b>$1,284.60 / $10,000</b></p><div className="progress"><i style={{width:'12.8%'}}/></div><div className="control-grid"><button onClick={()=>{setFrozen(!frozen);notify(frozen?'Card unfrozen':'Card frozen')}}><Snowflake/>{frozen?'Unfreeze':'Freeze'}</button><button onClick={()=>notify('Card details protected by verification')}><Eye/>Details</button><button onClick={()=>notify('Spending limits opened')}><BarChart3/>Limits</button><button onClick={()=>notify('Wallet binding opened')}><WalletCards/>Add to wallet</button></div></section></section><section className="panel card-services"><div className="panel-title"><div><h2>Card services</h2><p>Payments, security and card lifecycle</p></div></div><div className="service-grid">{[['Online payments','Enabled'],['ATM withdrawals','Enabled'],['Contactless','Enabled'],['Apple Pay','Ready'],['Alipay binding','Available'],['WeChat Pay','Available']].map(x=><button key={x[0]} onClick={()=>notify(`${x[0]} settings opened`)}><ShieldCheck/><div><b>{x[0]}</b><small>{x[1]}</small></div><ChevronRight/></button>)}</div></section><section className="panel physical"><div><Landmark/><section><h2>FastLink Physical Card</h2><p>Global POS payments and ATM withdrawals. Delivery tracking included.</p></section></div>{physical?<span className="ordered">Application submitted</span>:<button onClick={()=>{setPhysical(true);notify('Physical card application submitted')}}>Apply now <ChevronRight/></button>}</section></div>
}

function Dashboard(){
  const monthly=useMemo(()=>[42,58,48,72,66,88,76,96,82,106,94,118],[])
  return <div className="content"><section className="metrics"><article><span>Net worth</span><b>$21,319.34</b><small className="positive">+2.84% this month</small></article><article><span>Card spending</span><b>$1,284.60</b><small>42 transactions</small></article><article><span>Rewards earned</span><b>$86.42</b><small>Available cashback</small></article><article><span>Security score</span><b>96 / 100</b><small className="positive">All checks passed</small></article></section><div className="grid-two dashboard-grid"><section className="panel chart"><div className="panel-title"><div><h2>Asset trend</h2><p>Portfolio value over 12 months</p></div><button>USD <ChevronRight/></button></div><div className="bars">{monthly.map((h,i)=><i key={i} style={{height:`${h}px`}}><span>{['A','S','O','N','D','J','F','M','A','M','J','J'][i]}</span></i>)}</div></section><section className="panel allocation"><div className="panel-title"><div><h2>Asset allocation</h2><p>Across wallet and cards</p></div></div><div className="donut"><span><b>68.6%</b><small>Digital</small></span></div><div className="legend"><p><i className="l1"/>Digital assets <b>$14,630.50</b></p><p><i className="l2"/>Fiat wallet <b>$6,688.84</b></p><p><i className="l3"/>Card reserved <b>$4,276.00</b></p></div></section></div><section className="panel insights"><div className="panel-title"><div><h2>Financial overview</h2><p>FastLink account health</p></div></div><div>{[['Funding completed','$8,420.00','12 deposits'],['FX converted','$3,880.00','Average spread 0.68%'],['Global card spend','$6,248.20','18 countries'],['Internal transfers','$1,920.00','100% completed']].map(x=><article key={x[0]}><span>{x[0]}</span><b>{x[1]}</b><small>{x[2]}</small></article>)}</div></section></div>
}

function MobileNav({page,go}:{page:Page;go:(p:Page)=>void}){return <nav className="mobile-nav"><button className={page==='wallet'?'active':''} onClick={()=>go('wallet')}><Home/>Wallet</button><button className={page==='cards'?'active':''} onClick={()=>go('cards')}><CreditCard/>Cards</button><button className={page==='dashboard'?'active':''} onClick={()=>go('dashboard')}><BarChart3/>Dashboard</button><button onClick={()=>{}}><QrCode/>Pay</button></nav>}
