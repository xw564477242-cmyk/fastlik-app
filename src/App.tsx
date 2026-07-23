import {FormEvent,useState} from 'react'
import {CreditCard,RefreshCw,ShieldAlert,Snowflake,WalletCards} from 'lucide-react'
import {walletApi,walletRuntime,WalletApiError} from './apiClient'

type CardRecord={id:string;status?:string;last4?:string;[key:string]:unknown}

export default function App(){
 const[token,setToken]=useState('')
 const[cards,setCards]=useState<CardRecord[]>([])
 const[selected,setSelected]=useState<CardRecord|null>(null)
 const[busy,setBusy]=useState(false)
 const[error,setError]=useState('')
 const[connected,setConnected]=useState(false)
 const describe=(value:unknown)=>value instanceof WalletApiError?`${value.message}`:value instanceof Error?value.message:'Unknown API error'
 const clear=()=>{setCards([]);setSelected(null);setConnected(false)}
 const login=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');clear();try{const session=await walletApi.session(token.trim());if(session.environment!==walletRuntime.environment)throw new Error(`Build environment ${walletRuntime.environment} does not match session ${session.environment}`);const rows=await walletApi.cards(token.trim()) as CardRecord[];setCards(rows);setSelected(rows[0]||null);setConnected(true)}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 const reload=async()=>{if(!connected||!selected)return;setBusy(true);setError('');try{const row=await walletApi.card(token,selected.id) as CardRecord;setSelected(row);setCards(current=>current.map(card=>card.id===row.id?row:card))}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 const toggle=async()=>{if(!connected||!selected)return;setBusy(true);setError('');try{const frozen=String(selected.status).toUpperCase()==='FROZEN';await (frozen?walletApi.unfreeze(token,selected.id):walletApi.freeze(token,selected.id));await reload()}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 return <main style={{maxWidth:860,margin:'40px auto',padding:24,fontFamily:'Inter,system-ui'}}>
  <header><h1>FastLink Wallet</h1><p>Environment: <b>{walletRuntime.environment}</b> · Build: <b>{walletRuntime.buildSha}</b></p></header>
  {!connected&&<section className="panel"><ShieldAlert/><h2>Backend session required</h2><p>Production builds contain no static balances, transactions, cards, or Sandbox fallback. Enter a real backend-issued bearer session.</p><form onSubmit={login}><input type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder="Backend bearer session" autoComplete="off"/><button disabled={busy||!token.trim()}>{busy?'Connecting…':'Connect'}</button></form></section>}
  {error&&<section className="panel"><h3>API unavailable</h3><p>{error}</p><p>Unavailable · no stale data displayed.</p></section>}
  {connected&&<><section className="panel"><div style={{display:'flex',justifyContent:'space-between'}}><h2><WalletCards/> Real cards</h2><button onClick={reload} disabled={busy}><RefreshCw/> Refresh</button></div>{cards.length===0?<p>Unavailable · no cards returned by Backend.</p>:<select value={selected?.id||''} onChange={e=>setSelected(cards.find(card=>card.id===e.target.value)||null)}>{cards.map(card=><option key={card.id} value={card.id}>{card.last4?`•••• ${card.last4}`:card.id}</option>)}</select>}</section>{selected&&<section className="panel"><CreditCard/><h2>{selected.last4?`Card •••• ${selected.last4}`:selected.id}</h2><p>Status: <b>{String(selected.status||'Unavailable')}</b></p><button onClick={toggle} disabled={busy}><Snowflake/> {String(selected.status).toUpperCase()==='FROZEN'?'Unfreeze':'Freeze'}</button></section>}</>}
 </main>
}
