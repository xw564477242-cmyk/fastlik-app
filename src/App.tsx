import {FormEvent,useEffect,useState} from 'react'
import {CreditCard,LogOut,RefreshCw,ShieldCheck,Snowflake,WalletCards} from 'lucide-react'
import {walletApi,walletRuntime,WalletApiError,WalletCredentials,WalletSession} from './apiClient'

type CardRecord={id:string;status?:string;last4?:string;[key:string]:unknown}

export default function App(){
 const[mode,setMode]=useState<'login'|'register'>('login')
 const[tenantId,setTenantId]=useState('')
 const[email,setEmail]=useState('')
 const[password,setPassword]=useState('')
 const[session,setSession]=useState<WalletSession|null>(null)
 const[cards,setCards]=useState<CardRecord[]>([])
 const[selected,setSelected]=useState<CardRecord|null>(null)
 const[busy,setBusy]=useState(true)
 const[error,setError]=useState('')
 const describe=(value:unknown)=>value instanceof WalletApiError?`${value.message}`:value instanceof Error?value.message:'Unknown API error'
 const clear=()=>{setSession(null);setCards([]);setSelected(null)}
 const acceptSession=async(current:WalletSession)=>{if(current.environment!==walletRuntime.environment)throw new Error(`Build environment ${walletRuntime.environment} does not match session ${current.environment}`);const rows=await walletApi.cards() as CardRecord[];setSession(current);setCards(rows);setSelected(rows[0]||null)}
 useEffect(()=>{void (async()=>{try{await acceptSession(await walletApi.session())}catch(value){clear();if(!(value instanceof WalletApiError&&value.status===401))setError(describe(value))}finally{setBusy(false)}})()},[])
 const authenticate=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');clear();try{const credentials:WalletCredentials={tenantId:tenantId.trim(),email:email.trim(),password};const current=mode==='login'?await walletApi.login(credentials):await walletApi.register(credentials);await acceptSession(current);setPassword('')}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 const reload=async()=>{if(!session||!selected)return;setBusy(true);setError('');try{const row=await walletApi.card(selected.id) as CardRecord;setSelected(row);setCards(current=>current.map(card=>card.id===row.id?row:card))}catch(value){setError(describe(value))}finally{setBusy(false)}}
 const toggle=async()=>{if(!session||!selected)return;setBusy(true);setError('');try{const frozen=String(selected.status).toUpperCase()==='FROZEN';await (frozen?walletApi.unfreeze(selected.id):walletApi.freeze(selected.id));await reload()}catch(value){setError(describe(value))}finally{setBusy(false)}}
 const refresh=async()=>{if(!session)return;setBusy(true);setError('');try{await acceptSession(await walletApi.refresh())}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 const logout=async()=>{setBusy(true);setError('');try{await walletApi.logout()}catch(value){if(!(value instanceof WalletApiError&&value.status===401))setError(describe(value))}finally{clear();setPassword('');setBusy(false)}}
 return <main style={{maxWidth:860,margin:'40px auto',padding:24,fontFamily:'Inter,system-ui'}}>
  <header><div><h1>FastLink Wallet</h1><p>Environment: <b>{walletRuntime.environment}</b> · Build: <b>{walletRuntime.buildSha}</b></p></div>{session&&<div className="session-actions"><button onClick={refresh} disabled={busy}><RefreshCw/> Refresh session</button><button onClick={logout} disabled={busy}><LogOut/> Sign out</button></div>}</header>
  {!session&&<section className="panel auth-panel"><ShieldCheck/><h2>{mode==='login'?'Sign in to FastLink':'Create your FastLink account'}</h2><p>Authentication is handled by the FastLink Backend using a secure HttpOnly cookie. Browser storage and pasted bearer tokens are disabled.</p><form onSubmit={authenticate}><label>Workspace<input value={tenantId} onChange={event=>setTenantId(event.target.value)} placeholder="Tenant ID or slug" autoComplete="organization" required/></label><label>Email<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Minimum 12 characters" autoComplete={mode==='login'?'current-password':'new-password'} minLength={12} required/></label><button disabled={busy||!tenantId.trim()||!email.trim()||password.length<12}>{busy?'Please wait…':mode==='login'?'Sign in':'Register'}</button></form><button className="mode-switch" onClick={()=>{setMode(current=>current==='login'?'register':'login');setError('')}}>{mode==='login'?'New to FastLink? Register':'Already registered? Sign in'}</button></section>}
  {error&&<section className="panel"><h3>API unavailable</h3><p>{error}</p><p>Unavailable · no stale data displayed.</p></section>}
  {session&&<><section className="panel"><div style={{display:'flex',justifyContent:'space-between'}}><h2><WalletCards/> Real cards</h2><button onClick={reload} disabled={busy}><RefreshCw/> Refresh cards</button></div>{cards.length===0?<p>Unavailable · no cards returned by Backend.</p>:<select value={selected?.id||''} onChange={e=>setSelected(cards.find(card=>card.id===e.target.value)||null)}>{cards.map(card=><option key={card.id} value={card.id}>{card.last4?`•••• ${card.last4}`:card.id}</option>)}</select>}</section>{selected&&<section className="panel"><CreditCard/><h2>{selected.last4?`Card •••• ${selected.last4}`:selected.id}</h2><p>Status: <b>{String(selected.status||'Unavailable')}</b></p><button onClick={toggle} disabled={busy}><Snowflake/> {String(selected.status).toUpperCase()==='FROZEN'?'Unfreeze':'Freeze'}</button></section>}</>}
 </main>
}
