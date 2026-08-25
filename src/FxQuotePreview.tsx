import {FormEvent,useEffect,useRef,useState} from 'react'
import {ArrowRightLeft} from 'lucide-react'
import {WalletAccountRecord,walletApi,walletRuntime,WalletApiError,WalletSession} from './apiClient'
import {FxQuote,FxQuoteInput,beginFxQuoteSubmit,createFxQuoteRequestIdentity,fxQuoteFailureCanInvalidateSession,fxQuoteFailureRetainsVerifiedQuote,fxQuoteRequestIsCurrent,fxQuoteRequestWasAborted,fxQuoteSessionScope,normalizeFxQuoteInput,settleFxQuoteSubmit} from './fxQuote'
import {phase2FxUnavailableMessage} from './phase2WalletUat'

type Props={session:WalletSession;accounts:readonly WalletAccountRecord[]}

const retryable=(value:unknown)=>value instanceof WalletApiError&&fxQuoteFailureRetainsVerifiedQuote(value.status)

export default function FxQuotePreview({session,accounts}:Props){
 const assetCodes=[...new Set(accounts.filter(account=>account.status==='ACTIVE').map(account=>account.assetCode))]
 const assetVersion=assetCodes.join('|')
 const currentScope=fxQuoteSessionScope(session,walletRuntime.environment)
 const[sourceAssetCode,setSourceAssetCodeState]=useState(assetCodes[0]??'')
 const[targetAssetCode,setTargetAssetCodeState]=useState(assetCodes.find(code=>code!==assetCodes[0])??'')
 const[sourceAmount,setSourceAmountState]=useState('')
 const[quote,setQuoteState]=useState<FxQuote|null>(null)
 const[busy,setBusy]=useState(false)
 const[error,setError]=useState('')
 const mounted=useRef(true)
 const scopeRef=useRef<string|null>(currentScope)
 const sourceAssetRef=useRef(sourceAssetCode)
 const targetAssetRef=useRef(targetAssetCode)
 const sourceAmountRef=useRef(sourceAmount)
 const quoteRef=useRef<FxQuote|null>(null)
 const inputGeneration=useRef(0)
 const requestGeneration=useRef(0)
 const requestSequence=useRef(0)
 const submitGate=useRef<{activeRequestId:number|null}>({activeRequestId:null})
 const requestAbortController=useRef<AbortController|null>(null)
 scopeRef.current=currentScope

 const replaceQuote=(value:FxQuote|null)=>{quoteRef.current=value;setQuoteState(value)}
 const abortRequest=()=>{requestAbortController.current?.abort();requestAbortController.current=null}
 const invalidateRequest=()=>{abortRequest();requestGeneration.current+=1;submitGate.current.activeRequestId=null}
 const clearForInputChange=()=>{inputGeneration.current+=1;invalidateRequest();replaceQuote(null);setBusy(false);setError('')}
 const setSourceAssetCode=(value:string)=>{if(value===sourceAssetRef.current)return;clearForInputChange();sourceAssetRef.current=value;setSourceAssetCodeState(value)}
 const setTargetAssetCode=(value:string)=>{if(value===targetAssetRef.current)return;clearForInputChange();targetAssetRef.current=value;setTargetAssetCodeState(value)}
 const setSourceAmount=(value:string)=>{if(value===sourceAmountRef.current)return;clearForInputChange();sourceAmountRef.current=value;setSourceAmountState(value)}
 const currentInput=():FxQuoteInput|null=>{try{return normalizeFxQuoteInput({sourceAssetCode:sourceAssetRef.current,targetAssetCode:targetAssetRef.current,sourceAmount:sourceAmountRef.current})}catch{return null}}

 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;invalidateRequest()}},[])
 useEffect(()=>{
  abortRequest()
  inputGeneration.current+=1
  requestGeneration.current+=1
  submitGate.current.activeRequestId=null
  const nextSource=assetCodes[0]??''
  const nextTarget=assetCodes.find(code=>code!==nextSource)??''
  sourceAssetRef.current=nextSource
  targetAssetRef.current=nextTarget
  sourceAmountRef.current=''
  quoteRef.current=null
  setSourceAssetCodeState(nextSource)
  setTargetAssetCodeState(nextTarget)
  setSourceAmountState('')
  setQuoteState(null)
  setBusy(false)
  setError('')
 },[currentScope,assetVersion])

 const requestQuote=async(event:FormEvent)=>{
  event.preventDefault()
  const expectedScope=fxQuoteSessionScope(session,walletRuntime.environment)
  const input=currentInput()
  if(!expectedScope||expectedScope!==scopeRef.current||!input){setError('Use two different active assets and a positive amount.');return}
  const requestId=++requestSequence.current
  if(!beginFxQuoteSubmit(submitGate.current,requestId))return
  const controller=new AbortController()
  requestAbortController.current=controller
  const generation=++requestGeneration.current
  const inputVersion=inputGeneration.current
  const identity=createFxQuoteRequestIdentity(requestId,generation,inputVersion,expectedScope,input)
  const isCurrent=()=>Boolean(
   submitGate.current.activeRequestId===requestId&&
   requestAbortController.current===controller&&
   !controller.signal.aborted&&
   fxQuoteSessionScope(session,walletRuntime.environment)===expectedScope&&
   scopeRef.current===expectedScope&&
   fxQuoteRequestIsCurrent(identity,requestGeneration.current,inputGeneration.current,scopeRef.current,currentInput(),mounted.current)
  )
  setBusy(true)
  setError('')
  try{
   const result=await walletApi.fxQuote(session,input,controller.signal)
   if(isCurrent())replaceQuote(result)
  }catch(value){
   const current=isCurrent()
   if(current&&!fxQuoteRequestWasAborted(value)){
    if(fxQuoteFailureCanInvalidateSession(value,current,controller.signal)){
     requestAbortController.current=null
     settleFxQuoteSubmit(submitGate.current,requestId)
     setBusy(false)
     window.dispatchEvent(new CustomEvent('fastlink:session-invalid',{detail:value}))
     return
    }
    if(!retryable(value))replaceQuote(null)
    setError(phase2FxUnavailableMessage(value))
   }
  }finally{
   const current=isCurrent()
   const settled=settleFxQuoteSubmit(submitGate.current,requestId)
   if(current&&settled){requestAbortController.current=null;setBusy(false)}
  }
 }

 const allowed=Boolean(currentScope&&assetCodes.length>1)
 return <section className="panel fx-quote-preview">
  <h2><ArrowRightLeft/> Synthetic FX quote preview</h2>
  <p className="card-action-note">SANDBOX/TEST only · one POST per click · no conversion, funds movement, polling, automatic retry, or direct Provider call.</p>
  {!allowed&&<p>Unavailable · two different active Wallet assets are required.</p>}
  {allowed&&<form className="fx-quote-form" onSubmit={requestQuote}>
   <label>From<select aria-label="FX quote source asset" value={sourceAssetCode} onChange={event=>setSourceAssetCode(event.target.value)} disabled={busy}>{assetCodes.map(code=><option value={code} key={code} disabled={code===targetAssetCode}>{code}</option>)}</select></label>
   <label>To<select aria-label="FX quote target asset" value={targetAssetCode} onChange={event=>setTargetAssetCode(event.target.value)} disabled={busy}>{assetCodes.map(code=><option value={code} key={code} disabled={code===sourceAssetCode}>{code}</option>)}</select></label>
   <label className="fx-quote-amount">Source amount<input aria-label="FX quote source amount" value={sourceAmount} onChange={event=>setSourceAmount(event.target.value)} inputMode="decimal" pattern="^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,18})?$" maxLength={37} placeholder={`Amount in ${sourceAssetCode}`} disabled={busy} required/></label>
   <button disabled={busy||!sourceAmount||sourceAssetCode===targetAssetCode}>{busy?'Requesting once…':'Preview synthetic quote'}</button>
  </form>}
  {busy&&quote&&<p className="card-action-note">Refreshing once · the same-input verified quote remains visible until completion.</p>}
  {error&&<div className="inline-error">{error} {quote?'The same-input verified quote remains visible.':'No unvalidated quote displayed.'}</div>}
  {quote&&<div className="fx-quote-result">
   <div><span>Receive</span><b>{quote.targetAmount} {quote.targetAssetCode}</b></div>
   <p><span>{quote.sourceAmount} {quote.sourceAssetCode} · Rate {quote.rate}</span><small>Quote {quote.quoteId}</small><small>{quote.environment} · Expires {new Date(quote.expiresAt).toLocaleString()}</small></p>
  </div>}
 </section>
}
