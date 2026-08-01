import {createElement,useMemo,useState,type ReactNode} from 'react'
import {ArrowDownToLine,ArrowLeft,ArrowLeftRight,ArrowUpFromLine,Bell,CircleUserRound,CreditCard,Eye,EyeOff,History,Home,Layers,LogOut,RefreshCw,ScanLine,Send,ShieldCheck,User,WalletCards} from 'lucide-react'
import type {CardBalanceRecord,WalletAccountRecord,WalletBalanceSummary,WalletOperationPage,WalletSession,WalletTransactionPage} from './apiClient'
import type {CardRecord} from './cardList'
import type {CardTransactionRecord} from './cardTransactions'

type Page='home'|'assets'|'convert'|'pay'|'cards'|'history'|'profile'|'deposit'|'withdraw'|'transfer'

type Props={
 session:WalletSession
 accounts:WalletAccountRecord[]
 summary:WalletBalanceSummary|null
 operations:WalletOperationPage|null
 transactions:WalletTransactionPage|null
 cards:CardRecord[]
 selectedCard:CardRecord|null
 cardBalance:CardBalanceRecord|null
 cardTransactions:readonly CardTransactionRecord[]
 loading:boolean
 errors:string[]
 buildSha:string
 onRefresh:()=>void
 onLogout:()=>void
}

const money=(value:string|number|undefined,currency='USD')=>{
 if(value===undefined)return 'Unavailable'
 const parsed=Number(value)
 if(!Number.isFinite(parsed))return `${value} ${currency}`
 return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(parsed)
}

const minorMoney=(value:string|undefined,currency='USD')=>{
 if(value===undefined)return 'Unavailable'
 const parsed=Number(value)
 return Number.isFinite(parsed)?money(parsed/100,currency):`${value} minor ${currency}`
}

const pageTitles:Record<Page,string>={home:'首页',assets:'资产',convert:'兑换',pay:'支付',cards:'卡片',history:'历史',profile:'我的',deposit:'充值',withdraw:'提现',transfer:'转账'}

export function WalletExperience(props:Props){
 const[page,setPage]=useState<Page>('home')
 const[hidden,setHidden]=useState(false)
 const total=useMemo(()=>{
  const values=props.summary?.items??[]
  if(values.length!==1||values[0].assetCode!=='USD')return null
  const parsed=Number(values[0].availableBalance)
  return Number.isFinite(parsed)?parsed:null
 },[props.summary])
 const recentOperations=props.operations?.items.slice(0,4)??[]
 const go=(next:Page)=>setPage(next)
 const action=(next:Page,icon:typeof ArrowDownToLine,label:string)=><button className="wallet-action" onClick={()=>go(next)}><span>{createElement(icon,{size:21})}</span>{label}</button>
 return <div className="consumer-wallet">
  <div className="consumer-scroll">
   <div className="phone-status"><span>9:41</span><span className="phone-signal"><i/><b/></span></div>
   {page==='home'?<>
    <header className="consumer-header"><div className="consumer-person"><span>FL</span><div><small>欢迎回来</small><b>{props.session.actorId}</b></div></div><button aria-label="Notifications"><Bell size={19}/><i/></button></header>
    <section className="consumer-balance"><div className="balance-label"><span>总资产</span><button onClick={()=>setHidden(value=>!value)} aria-label="Toggle balance">{hidden?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><strong>{hidden?'••••••':total===null?'Unavailable':money(total)}</strong>{total===null&&<small>不同币种不会按未经验证的汇率合计</small>}<div className="balance-mini">{(props.summary?.items??[]).slice(0,3).map(item=><button key={item.assetCode} onClick={()=>go('assets')}><span>{item.assetCode}</span><b>{hidden?'••••':`${item.availableBalance}`}</b><small>可用余额</small></button>)}{!props.summary?.items.length&&<div className="consumer-empty">暂无已验证余额</div>}</div></section>
    <div className="wallet-actions">{action('deposit',ArrowDownToLine,'充值')}{action('withdraw',ArrowUpFromLine,'提现')}{action('convert',ArrowLeftRight,'兑换')}{action('pay',ScanLine,'支付')}{action('transfer',Send,'转账')}{action('cards',CreditCard,'卡片')}</div>
    <section className="consumer-section"><div className="consumer-section-title"><h2>最近交易</h2><button onClick={()=>go('history')}>查看全部</button></div><OperationRows rows={recentOperations}/></section>
   </>:<PageHeader title={pageTitles[page]} onBack={()=>go('home')} onRefresh={['assets','cards','history'].includes(page)?props.onRefresh:undefined}/>} 
   {page==='assets'&&<Assets accounts={props.accounts} summary={props.summary}/>} 
   {page==='cards'&&<Cards cards={props.cards} selected={props.selectedCard} balance={props.cardBalance} transactions={props.cardTransactions}/>} 
   {page==='history'&&<HistoryPage operations={props.operations} transactions={props.transactions}/>} 
   {page==='profile'&&<Profile session={props.session} buildSha={props.buildSha} onLogout={props.onLogout}/>} 
   {page==='convert'&&<Unavailable icon={<ArrowLeftRight/>} title="兑换" text="兑换页面已完成。真实汇率与兑换提交在获得已验证合约前保持关闭。"/>}
   {page==='pay'&&<Unavailable icon={<ScanLine/>} title="支付" text="支付页面已完成。扫描与付款提交暂不执行，避免产生真实资金操作。"/>}
   {page==='deposit'&&<Unavailable icon={<ArrowDownToLine/>} title="充值" text="充值入口已完成。充值地址与入账流程将在下一阶段接入。"/>}
   {page==='withdraw'&&<Unavailable icon={<ArrowUpFromLine/>} title="提现" text="提现入口已完成。当前只读阶段不会提交提现。"/>}
   {page==='transfer'&&<Unavailable icon={<Send/>} title="转账" text="转账入口已完成。当前只读阶段不会提交转账。"/>}
   {props.errors.length>0&&<section className="consumer-errors"><b>部分数据暂不可用</b>{props.errors.map(value=><p key={value}>{value}</p>)}<small>已保持登录，没有显示替代数据。</small></section>}
  </div>
  <nav className="consumer-nav">
   <Nav active={page==='home'} icon={<Home/>} label="首页" onClick={()=>go('home')}/>
   <Nav active={page==='assets'} icon={<Layers/>} label="资产" onClick={()=>go('assets')}/>
   <Nav active={page==='convert'} icon={<ArrowLeftRight/>} label="兑换" onClick={()=>go('convert')}/>
   <Nav active={page==='pay'} icon={<ScanLine/>} label="支付" onClick={()=>go('pay')}/>
   <Nav active={page==='cards'} icon={<CreditCard/>} label="卡片" onClick={()=>go('cards')}/>
   <Nav active={page==='profile'} icon={<User/>} label="我的" onClick={()=>go('profile')}/>
  </nav>
 </div>
}

function PageHeader({title,onBack,onRefresh}:{title:string;onBack:()=>void;onRefresh?:()=>void}){return <header className="page-header"><button onClick={onBack} aria-label="Back"><ArrowLeft/></button><h1>{title}</h1>{onRefresh?<button onClick={onRefresh} aria-label="Refresh"><RefreshCw/></button>:<span/>}</header>}

function Assets({accounts,summary}:{accounts:WalletAccountRecord[];summary:WalletBalanceSummary|null}){return <main className="consumer-page"><section className="consumer-hero"><WalletCards/><span>钱包账户</span><strong>{accounts.length}</strong><small>所有数据来自 FastLink Dev</small></section><section className="consumer-section"><div className="consumer-section-title"><h2>资产明细</h2><span>只读</span></div>{accounts.map(account=>{const balance=summary?.items.find(item=>item.assetCode===account.assetCode);return <article className="asset-row" key={account.id}><span>{account.assetCode.slice(0,2)}</span><div><b>{account.assetCode}</b><small>{account.status} · {account.id}</small></div><strong>{balance?.availableBalance??account.availableBalance}</strong></article>})}{accounts.length===0&&<div className="consumer-empty">没有返回钱包账户</div>}</section></main>}

function Cards({cards,selected,balance,transactions}:{cards:CardRecord[];selected:CardRecord|null;balance:CardBalanceRecord|null;transactions:readonly CardTransactionRecord[]}){return <main className="consumer-page">{selected?<><section className={`consumer-card ${selected.status==='FROZEN'?'is-frozen':''}`}><div><b>FASTLINK</b><span>{selected.type}</span></div><i/><strong>•••• •••• •••• {selected.last4??'----'}</strong><footer><span><small>STATUS</small>{selected.status}</span><span><small>EXPIRES</small>{selected.expiryMonth&&selected.expiryYear?`${String(selected.expiryMonth).padStart(2,'0')}/${String(selected.expiryYear).slice(-2)}`:'--/--'}</span></footer></section><section className="card-overview"><div><span>可用余额</span><b>{balance?minorMoney(balance.availableBalanceMinor,balance.currency):'Unavailable'}</b></div><div><span>卡片数量</span><b>{cards.length}</b></div></section><section className="consumer-section"><div className="consumer-section-title"><h2>卡片交易</h2><span>只读</span></div><CardRows rows={transactions}/></section></>:<Unavailable icon={<CreditCard/>} title="暂无卡片" text="Backend 没有返回可显示的卡片。"/>}</main>}

function HistoryPage({operations,transactions}:{operations:WalletOperationPage|null;transactions:WalletTransactionPage|null}){return <main className="consumer-page"><section className="consumer-section history-panel"><div className="history-switch"><button className="active">全部</button><button>钱包</button><button>卡片</button></div><OperationRows rows={operations?.items??[]}/>{!operations?.items.length&&transactions?.items.map(row=><article className="operation-row" key={row.id}><span><History/></span><div><b>{row.type}</b><small>{row.status} · {new Date(row.createdAt).toLocaleString()}</small></div><strong>{row.amount} {row.assetCode}</strong></article>)}</section></main>}

function Profile({session,buildSha,onLogout}:{session:WalletSession;buildSha:string;onLogout:()=>void}){return <main className="consumer-page"><section className="profile-card"><span>FL</span><h2>{session.actorId}</h2><p>{session.tenantId}</p><i>{session.environment}</i></section><section className="profile-list"><div><CircleUserRound/><span><b>账户</b><small>{session.customerId}</small></span></div><div><ShieldCheck/><span><b>安全会话</b><small>HttpOnly Cookie · 不保存 Token</small></span></div><div><RefreshCw/><span><b>应用版本</b><small>{buildSha}</small></span></div></section><button className="logout-button" onClick={onLogout}><LogOut/>退出登录</button></main>}

function Unavailable({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <main className="consumer-page"><section className="unavailable-page"><span>{icon}</span><h2>{title}</h2><p>{text}</p><small>页面不会生成演示金额、替代记录或提交资金操作。</small></section></main>}

function OperationRows({rows}:{rows:WalletOperationPage['items']}){return <div className="operation-list">{rows.map(row=><article className="operation-row" key={row.id}><span>{row.direction==='INCOMING'?<ArrowDownToLine/>:<ArrowUpFromLine/>}</span><div><b>{row.type.replaceAll('_',' ')}</b><small>{row.status} · {new Date(row.createdAt).toLocaleString()}</small></div><strong className={row.direction==='INCOMING'?'incoming':''}>{row.direction==='INCOMING'?'+':'-'}{row.amount} {row.assetCode}</strong></article>)}{rows.length===0&&<div className="consumer-empty">没有返回交易记录</div>}</div>}

function CardRows({rows}:{rows:readonly CardTransactionRecord[]}){return <div className="operation-list">{rows.map(row=><article className="operation-row" key={row.id}><span><CreditCard/></span><div><b>{row.merchantName??'Card transaction'}</b><small>{row.status} · {new Date(row.occurredAt).toLocaleString()}</small></div><strong>{minorMoney(row.amountMinor,row.currency)}</strong></article>)}{rows.length===0&&<div className="consumer-empty">没有返回卡片交易</div>}</div>}

function Nav({active,icon,label,onClick}:{active:boolean;icon:ReactNode;label:string;onClick:()=>void}){return <button className={active?'active':''} onClick={onClick}><span>{icon}</span><small>{label}</small></button>}
