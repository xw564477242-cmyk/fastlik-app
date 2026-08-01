import {createElement,useMemo,useState,type ReactNode} from 'react'
import {ArrowDownToLine,ArrowLeft,ArrowLeftRight,ArrowUpFromLine,BadgeCheck,Banknote,Bell,Bitcoin,ChevronRight,CircleUserRound,CreditCard,Eye,EyeOff,Globe2,Headphones,HelpCircle,History,Home,Layers,LockKeyhole,LogOut,Plus,QrCode,RefreshCw,ScanLine,Send,Settings,ShieldCheck,Smartphone,User} from 'lucide-react'
import type {CardBalanceRecord,CardLimitsRecord,WalletAccountRecord,WalletBalanceSummary,WalletOperationPage,WalletSession,WalletTransactionPage} from './apiClient'
import type {CardRecord} from './cardList'
import type {CardTransactionRecord} from './cardTransactions'

type Page='home'|'assets'|'digital'|'convert'|'pay'|'cards'|'history'|'profile'|'deposit'|'withdraw'|'transfer'|'notifications'|'settings'|'security'|'support'

type Props={
 session:WalletSession
 accounts:WalletAccountRecord[]
 summary:WalletBalanceSummary|null
 operations:WalletOperationPage|null
 transactions:WalletTransactionPage|null
 cards:CardRecord[]
 selectedCard:CardRecord|null
 cardBalance:CardBalanceRecord|null
 cardLimits:CardLimitsRecord|null
 cardTransactions:readonly CardTransactionRecord[]
 loading:boolean
 errors:string[]
 buildSha:string
 onRefresh:()=>void
 onSelectCard:(card:CardRecord)=>void
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

const pageTitles:Record<Page,string>={home:'首页',assets:'资产',digital:'数字资产',convert:'兑换',pay:'支付',cards:'卡片',history:'历史',profile:'我的',deposit:'充值',withdraw:'提现',transfer:'转账',notifications:'通知',settings:'设置',security:'安全中心',support:'帮助与支持'}
const fiatAssetCodes=['CNY','USD','SGD','VND'] as const
const digitalAssetCodes=['USDT','USDC','ETH'] as const

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
    <header className="consumer-header"><div className="consumer-person"><span>FL</span><div><small>欢迎回来</small><b>{props.session.actorId}</b></div></div><button aria-label="Notifications" onClick={()=>go('notifications')}><Bell size={19}/><i/></button></header>
    <section className="consumer-balance"><div className="balance-label"><span>总资产</span><button onClick={()=>setHidden(value=>!value)} aria-label="Toggle balance">{hidden?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><strong>{hidden?'••••••':total===null?'Unavailable':money(total)}</strong>{total===null&&<small>不同币种不会按未经验证的汇率合计</small>}<div className="balance-mini asset-entry-grid"><button onClick={()=>go('assets')}><span>法币资产</span><b>{hidden?'••••':`${(props.summary?.items??[]).filter(item=>fiatAssetCodes.includes(item.assetCode as typeof fiatAssetCodes[number])).length} 币种`}</b><small>CNY · USD · SGD · VND</small></button><button onClick={()=>go('digital')}><span>数字货币</span><b>待开发</b><small>USDT · USDC · ETH</small></button><button onClick={()=>go('cards')}><span>卡片资产</span><b>{props.cards.length} 张</b><small>虚拟卡 · 实体卡</small></button></div></section>
    <div className="wallet-actions">{action('deposit',ArrowDownToLine,'充值')}{action('withdraw',ArrowUpFromLine,'提现')}{action('convert',ArrowLeftRight,'兑换')}{action('pay',ScanLine,'支付')}{action('transfer',Send,'转账')}{action('cards',CreditCard,'卡片')}</div>
    <section className="consumer-section"><div className="consumer-section-title"><h2>最近交易</h2><button onClick={()=>go('history')}>查看全部</button></div><OperationRows rows={recentOperations}/></section>
   </>:<PageHeader title={pageTitles[page]} onBack={()=>go('home')} onRefresh={['assets','cards','history'].includes(page)?props.onRefresh:undefined}/>} 
   {page==='assets'&&<Assets accounts={props.accounts} summary={props.summary} onDigital={()=>go('digital')} onCards={()=>go('cards')}/>} 
   {page==='digital'&&<DigitalAssets/>}
   {page==='cards'&&<><CardAssetCategories cards={props.cards}/><Cards cards={props.cards} selected={props.selectedCard} balance={props.cardBalance} limits={props.cardLimits} transactions={props.cardTransactions} onSelect={props.onSelectCard}/></>} 
   {page==='history'&&<HistoryPage operations={props.operations} transactions={props.transactions}/>} 
   {page==='profile'&&<Profile session={props.session} buildSha={props.buildSha} onNavigate={go} onLogout={props.onLogout}/>} 
   {page==='convert'&&<PendingFlow kind="convert"/>}
   {page==='pay'&&<PendingFlow kind="pay"/>}
   {page==='deposit'&&<PendingFlow kind="deposit"/>}
   {page==='withdraw'&&<PendingFlow kind="withdraw"/>}
   {page==='transfer'&&<PendingFlow kind="transfer" accounts={props.accounts}/>} 
   {page==='notifications'&&<Notifications/>}
   {page==='settings'&&<SettingsPage onNavigate={go}/>} 
   {page==='security'&&<SecurityPage/>}
   {page==='support'&&<SupportPage/>}
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

function Assets({accounts,summary,onDigital,onCards}:{accounts:WalletAccountRecord[];summary:WalletBalanceSummary|null;onDigital:()=>void;onCards:()=>void}){return <main className="consumer-page"><section className="consumer-hero"><Banknote/><span>法币钱包</span><strong>{fiatAssetCodes.length}</strong><small>CNY · USD · SGD · VND；所有金额均来自 FastLink Dev</small></section><div className="asset-categories"><button className="active"><Banknote/><span><b>法币资产</b><small>CNY · USD · SGD · VND</small></span><ChevronRight/></button><button onClick={onDigital}><Bitcoin/><span><b>数字货币资产</b><small>USDT · USDC · ETH</small></span><ChevronRight/></button><button onClick={onCards}><CreditCard/><span><b>卡片资产</b><small>虚拟卡 · 实体卡</small></span><ChevronRight/></button></div><section className="consumer-section"><div className="consumer-section-title"><h2>法币资产明细</h2><span>只读</span></div>{fiatAssetCodes.map(code=>{const account=accounts.find(item=>item.assetCode===code);const balance=summary?.items.find(item=>item.assetCode===code);return <article className={`asset-row ${account?'':'unavailable-asset'}`} key={code}><span>{code.slice(0,2)}</span><div><b>{code}</b><small>{account?`${account.status} · ${account.id}`:'Dev Backend 尚未返回此币种账户'}</small></div><strong>{balance?.availableBalance??account?.availableBalance??'未返回'}</strong></article>})}</section></main>}

function DigitalAssets(){return <main className="consumer-page"><section className="consumer-hero"><Bitcoin/><span>数字货币资产</span><strong>{digitalAssetCodes.length}</strong><small>USDT · USDC · ETH；当前功能待开发</small></section><section className="consumer-section"><div className="consumer-section-title"><h2>数字货币</h2><span>待开发</span></div>{digitalAssetCodes.map(code=><article className="asset-row unavailable-asset" key={code}><span>{code.slice(0,2)}</span><div><b>{code}</b><small>{code==='USDT'?'稳定币 · 支持网络待确定':code==='USDC'?'稳定币 · 支持网络待确定':'Ethereum · 链上能力待接入'}</small></div><strong>待开发</strong></article>)}</section><section className="flow-card"><label>钱包地址<div className="scan-placeholder"><QrCode/><span>充值地址和二维码待开发</span></div></label><button className="pending-submit" disabled>数字货币功能待开发</button><small>不会生成虚假地址、余额或链上交易。</small></section></main>}

function CardAssetCategories({cards}:{cards:CardRecord[]}){const virtualCards=cards.filter(card=>card.type==='VIRTUAL');const physicalCards=cards.filter(card=>card.type==='PHYSICAL');return <div className="card-asset-categories"><div><Smartphone/><span><b>虚拟卡</b><small>即时使用的数字卡片</small></span><strong>{virtualCards.length}</strong></div><div><CreditCard/><span><b>实体卡</b><small>可配送的银行卡片</small></span><strong>{physicalCards.length}</strong></div></div>}

function Cards({cards,selected,balance,limits,transactions,onSelect}:{cards:CardRecord[];selected:CardRecord|null;balance:CardBalanceRecord|null;limits:CardLimitsRecord|null;transactions:readonly CardTransactionRecord[];onSelect:(card:CardRecord)=>void}){return <main className="consumer-page">{selected?<><section className={`consumer-card ${selected.status==='FROZEN'?'is-frozen':''}`}><div><b>FASTLINK</b><span>{selected.type}</span></div><i/><strong>•••• •••• •••• {selected.last4??'----'}</strong><footer><span><small>STATUS</small>{selected.status}</span><span><small>EXPIRES</small>{selected.expiryMonth&&selected.expiryYear?`${String(selected.expiryMonth).padStart(2,'0')}/${String(selected.expiryYear).slice(-2)}`:'--/--'}</span></footer></section><section className="card-overview"><div><span>可用余额</span><b>{balance?minorMoney(balance.availableBalanceMinor,balance.currency):'Unavailable'}</b></div><div><span>当前余额</span><b>{balance?minorMoney(balance.currentBalanceMinor,balance.currency):'Unavailable'}</b></div><div><span>待处理金额</span><b>{balance?minorMoney(balance.pendingAmountMinor,balance.currency):'Unavailable'}</b></div><div><span>卡片数量</span><b>{cards.length}</b></div></section><div className="card-shortcuts"><button disabled><LockKeyhole/><span>冻结卡片</span><small>待开发</small></button><button disabled><Settings/><span>卡片设置</span><small>待开发</small></button><button disabled><Plus/><span>添加卡片</span><small>待开发</small></button></div>{cards.length>1&&<section className="consumer-section"><div className="consumer-section-title"><h2>我的卡片</h2><span>{cards.length} 张</span></div><div className="card-picker">{cards.map(card=><button className={card.id===selected.id?'active':''} key={card.id} onClick={()=>onSelect(card)}><CreditCard/><span><b>{card.alias??card.type}</b><small>•••• {card.last4??'----'} · {card.status}</small></span><ChevronRight/></button>)}</div></section>}<section className="consumer-section card-detail"><div className="consumer-section-title"><h2>卡片详情</h2><span>只读</span></div><div><span>卡片 ID</span><b>{selected.id}</b></div><div><span>类型</span><b>{selected.type}</b></div><div><span>状态</span><b>{selected.status}</b></div><div><span>有效期</span><b>{selected.expiryMonth&&selected.expiryYear?`${String(selected.expiryMonth).padStart(2,'0')}/${selected.expiryYear}`:'Unavailable'}</b></div></section><section className="consumer-section card-limits"><div className="consumer-section-title"><h2>消费限额</h2><span>只读</span></div><div><span>单笔限额</span><b>{limits?.singleTransactionMinor??'Unavailable'}</b></div><div><span>每日消费</span><b>{limits?.dailySpendMinor??'Unavailable'}</b></div><div><span>每月消费</span><b>{limits?.monthlySpendMinor??'Unavailable'}</b></div><div><span>每日 ATM</span><b>{limits?.dailyAtmMinor??'Unavailable'}</b></div></section><section className="consumer-section"><div className="consumer-section-title"><h2>卡片交易</h2><span>只读</span></div><CardRows rows={transactions}/></section></>:<Unavailable icon={<CreditCard/>} title="暂无卡片" text="Backend 没有返回可显示的卡片。"/>}</main>}

function HistoryPage({operations,transactions}:{operations:WalletOperationPage|null;transactions:WalletTransactionPage|null}){return <main className="consumer-page"><section className="consumer-section history-panel"><div className="history-switch"><button className="active">全部</button><button>钱包</button><button>卡片</button></div><OperationRows rows={operations?.items??[]}/>{!operations?.items.length&&transactions?.items.map(row=><article className="operation-row" key={row.id}><span><History/></span><div><b>{row.type}</b><small>{row.status} · {new Date(row.createdAt).toLocaleString()}</small></div><strong>{row.amount} {row.assetCode}</strong></article>)}</section></main>}

function Profile({session,buildSha,onNavigate,onLogout}:{session:WalletSession;buildSha:string;onNavigate:(page:Page)=>void;onLogout:()=>void}){return <main className="consumer-page"><section className="profile-card"><span>FL</span><h2>{session.actorId}</h2><p>{session.tenantId}</p><i>{session.environment}</i></section><section className="profile-list"><div><CircleUserRound/><span><b>账户信息</b><small>{session.customerId}</small></span></div><button onClick={()=>onNavigate('security')}><ShieldCheck/><span><b>安全中心</b><small>Cookie 会话、密码与双重验证</small></span><ChevronRight/></button><button onClick={()=>onNavigate('settings')}><Settings/><span><b>偏好设置</b><small>语言、通知与显示</small></span><ChevronRight/></button><button onClick={()=>onNavigate('support')}><HelpCircle/><span><b>帮助与支持</b><small>常见问题和联系我们</small></span><ChevronRight/></button><div><RefreshCw/><span><b>应用版本</b><small>{buildSha}</small></span></div></section><button className="logout-button" onClick={onLogout}><LogOut/>退出登录</button></main>}

type PendingKind='digital'|'deposit'|'withdraw'|'convert'|'pay'|'transfer'
const pendingCopy:Record<PendingKind,{icon:typeof Banknote;title:string;subtitle:string;steps:string[];button:string}>={
 digital:{icon:Bitcoin,title:'数字资产',subtitle:'数字资产账户和链上能力尚未接入。',steps:['支持资产与网络','钱包地址与二维码','链上记录与确认状态'],button:'数字资产待开发'},
 deposit:{icon:ArrowDownToLine,title:'充值',subtitle:'选择充值方式并查看入账说明。',steps:['选择钱包账户','选择银行或数字资产通道','确认充值资料与状态'],button:'充值功能待开发'},
 withdraw:{icon:ArrowUpFromLine,title:'提现',subtitle:'提现提交目前保持关闭，不会产生资金操作。',steps:['选择资金账户','填写收款资料','确认费用与预计到账时间'],button:'提现功能待开发'},
 convert:{icon:ArrowLeftRight,title:'兑换',subtitle:'兑换报价和提交将在汇率合约验收后开放。',steps:['选择卖出与买入币种','获取实时汇率和费用','确认兑换结果'],button:'兑换功能待开发'},
 pay:{icon:QrCode,title:'支付',subtitle:'扫码和商户付款目前不会发起真实支付。',steps:['扫描或输入收款码','确认商户和支付账户','验证并提交付款'],button:'支付功能待开发'},
 transfer:{icon:Send,title:'转账',subtitle:'页面结构已建立，当前只读验收不提交转账。',steps:['选择转出钱包账户','填写收款账户和金额','确认并查看转账状态'],button:'转账提交待开发'},
}

function PendingFlow({kind,accounts=[]}:{kind:PendingKind;accounts?:WalletAccountRecord[]}){const copy=pendingCopy[kind];const Icon=copy.icon;return <main className="consumer-page"><section className="flow-intro"><span><Icon/></span><div><em>待开发</em><h2>{copy.title}</h2><p>{copy.subtitle}</p></div></section><section className="flow-card"><label>{kind==='transfer'?'转出账户':'账户'}<button disabled>{accounts[0]?`${accounts[0].assetCode} · ${accounts[0].availableBalance}`:'请选择钱包账户'}<ChevronRight/></button></label>{kind==='convert'?<div className="flow-pair"><label>卖出<input disabled placeholder="0.00 USD"/></label><ArrowLeftRight/><label>买入<input disabled placeholder="0.00 EUR"/></label></div>:kind==='pay'?<label>付款信息<div className="scan-placeholder"><ScanLine/><span>扫描商户二维码</span></div></label>:<><label>{kind==='deposit'?'充值方式':kind==='withdraw'?'收款账户':kind==='transfer'?'收款账户':'金额'}<input disabled placeholder={kind==='deposit'?'银行转账 / 数字资产':kind==='transfer'?'账户 ID 或手机号':'尚未开放'}/></label>{kind!=='digital'&&kind!=='deposit'&&<label>金额<input disabled placeholder="0.00" inputMode="decimal"/></label>}</>}<button className="pending-submit" disabled>{copy.button}</button><small>不会生成演示数据，也不会发送任何资金请求。</small></section><section className="flow-steps"><h3>预计流程</h3>{copy.steps.map((step,index)=><div key={step}><span>{index+1}</span><p>{step}</p><BadgeCheck/></div>)}</section></main>}

function Notifications(){return <main className="consumer-page"><section className="notice-summary"><Bell/><div><b>通知中心</b><small>系统与交易消息</small></div><em>0 条未读</em></section><section className="consumer-section"><div className="consumer-section-title"><h2>最新通知</h2><span>只读</span></div><div className="consumer-empty tall"><Bell/><b>暂无通知</b><small>Backend 没有返回通知记录，不会显示替代消息。</small></div></section></main>}

function SettingsPage({onNavigate}:{onNavigate:(page:Page)=>void}){return <main className="consumer-page"><section className="settings-group"><h3>常用设置</h3><button><Globe2/><span><b>语言</b><small>简体中文</small></span><ChevronRight/></button><button><Bell/><span><b>通知偏好</b><small>系统和交易提醒</small></span><em>待开发</em></button><button><Smartphone/><span><b>显示与设备</b><small>深色模式</small></span><em>待开发</em></button></section><section className="settings-group"><h3>账户</h3><button onClick={()=>onNavigate('security')}><ShieldCheck/><span><b>安全中心</b><small>登录与账户保护</small></span><ChevronRight/></button><button onClick={()=>onNavigate('support')}><Headphones/><span><b>帮助与支持</b><small>常见问题与联系渠道</small></span><ChevronRight/></button></section></main>}

function SecurityPage(){return <main className="consumer-page"><section className="security-score"><ShieldCheck/><div><b>当前会话安全</b><small>HttpOnly Cookie · 浏览器不保存 Token</small></div><BadgeCheck/></section><section className="settings-group"><h3>安全功能</h3><button disabled><LockKeyhole/><span><b>修改密码</b><small>需要 Backend 安全流程</small></span><em>待开发</em></button><button disabled><Smartphone/><span><b>双重验证</b><small>验证器或安全密钥</small></span><em>待开发</em></button><button disabled><Bell/><span><b>登录提醒</b><small>新设备登录通知</small></span><em>待开发</em></button></section></main>}

function SupportPage(){return <main className="consumer-page"><section className="support-hero"><Headphones/><h2>有什么可以帮你？</h2><p>当前预览不发送客服消息。</p></section><section className="settings-group"><h3>常见问题</h3>{['如何查看钱包余额？','卡片状态是什么意思？','交易记录何时更新？','如何保护我的账户？'].map(question=><button key={question}><HelpCircle/><span><b>{question}</b><small>帮助内容待补充</small></span><ChevronRight/></button>)}</section><button className="pending-submit" disabled>联系客服 · 待开发</button></main>}

function Unavailable({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <main className="consumer-page"><section className="unavailable-page"><span>{icon}</span><h2>{title}</h2><p>{text}</p><small>页面不会生成演示金额、替代记录或提交资金操作。</small></section></main>}

function OperationRows({rows}:{rows:WalletOperationPage['items']}){return <div className="operation-list">{rows.map(row=><article className="operation-row" key={row.id}><span>{row.direction==='INCOMING'?<ArrowDownToLine/>:<ArrowUpFromLine/>}</span><div><b>{row.type.replaceAll('_',' ')}</b><small>{row.status} · {new Date(row.createdAt).toLocaleString()}</small></div><strong className={row.direction==='INCOMING'?'incoming':''}>{row.direction==='INCOMING'?'+':'-'}{row.amount} {row.assetCode}</strong></article>)}{rows.length===0&&<div className="consumer-empty">没有返回交易记录</div>}</div>}

function CardRows({rows}:{rows:readonly CardTransactionRecord[]}){return <div className="operation-list">{rows.map(row=><article className="operation-row" key={row.id}><span><CreditCard/></span><div><b>{row.merchantName??'Card transaction'}</b><small>{row.status} · {new Date(row.occurredAt).toLocaleString()}</small></div><strong>{minorMoney(row.amountMinor,row.currency)}</strong></article>)}{rows.length===0&&<div className="consumer-empty">没有返回卡片交易</div>}</div>}

function Nav({active,icon,label,onClick}:{active:boolean;icon:ReactNode;label:string;onClick:()=>void}){return <button className={active?'active':''} onClick={onClick}><span>{icon}</span><small>{label}</small></button>}
