import type {FormEvent} from 'react'
import {ArrowRightLeft,RefreshCw} from 'lucide-react'
import type {WalletAccountRecord,WalletTransferReceipt} from './apiClient'
import {consumerTransferDestinations} from './consumerTransferState'
import {normalizeWalletTransferInput} from './walletTransfer'

type Props={
 title:string
 accounts:readonly WalletAccountRecord[]
 source:WalletAccountRecord|null
 destinationAccountId:string
 amount:string
 busy:boolean
 retryPending:boolean
 retryExhausted:boolean
 loading:boolean
 error:string
 receipt:WalletTransferReceipt|null
 statusBusy:boolean
 statusRefreshCount:number
 statusRefreshLimit:number
 onDestinationChange:(value:string)=>void
 onAmountChange:(value:string)=>void
 onSubmit:()=>void|Promise<void>
 onRefreshStatus:()=>void|Promise<void>
}

export function ConsumerTransferFlow(props:Props){
 const destinations=consumerTransferDestinations(props.accounts,props.source)
 let allowed=false
 if(!props.busy&&!props.loading&&props.source?.status==='ACTIVE')try{
  normalizeWalletTransferInput({sourceAccountId:props.source.id,destinationAccountId:props.destinationAccountId.trim(),assetCode:props.source.assetCode,amount:props.amount},props.accounts)
  allowed=true
 }catch{}
 const submit=(event:FormEvent)=>{event.preventDefault();if(allowed)void props.onSubmit()}
 return <form className="transfer-form consumer-transfer-form" onSubmit={submit}>
  <h3><ArrowRightLeft/> {props.title} · {props.source?.assetCode??'Unavailable'}</h3>
  <label>Source account
   <input value={props.source?`${props.source.name} · ${props.source.accountCode} · ${props.source.availableBalance} ${props.source.assetCode}`:'No active source account'} disabled readOnly/>
  </label>
  <label>Destination account
   <select value={props.destinationAccountId} onChange={event=>props.onDestinationChange(event.target.value)} disabled={props.loading||props.busy||props.retryPending||destinations.length===0} required>
    <option value="">Select an active same-asset account</option>
    {destinations.map(account=><option key={account.id} value={account.id}>{account.name} · {account.accountCode} · {account.availableBalance} {account.assetCode}</option>)}
   </select>
  </label>
  <label>Amount
   <input value={props.amount} onChange={event=>props.onAmountChange(event.target.value)} inputMode="decimal" pattern="^[0-9]+(?:\\.[0-9]{1,18})?$" placeholder={props.source?`Amount in ${props.source.assetCode}`:'0.00'} disabled={props.loading||props.busy||props.retryPending} required/>
  </label>
  <button disabled={!allowed||props.retryExhausted}>{props.busy?'Transferring once…':props.retryExhausted?'Refresh session to continue':props.retryPending?'Retry safely with same key':'Transfer once'}</button>
  <small>{props.retryExhausted?'Same-key retry exhausted · no third POST · refresh the exact session before continuing.':props.retryPending?'Uncertain result · inputs locked · one manual retry reuses the same Idempotency-Key.':'Manual SANDBOX/TEST only · one new UUIDv4 Idempotency-Key · no automatic retries · commit only after persisted operation status and complete two-account refresh.'}</small>
  {props.error&&<div className="inline-error">{props.error} · Login remains active; no Provider or internal details are displayed.</div>}
  {props.receipt&&<div className="transfer-receipt">
   <div><span>Transfer receipt</span><b>{props.receipt.status}</b></div>
   <p><span>{props.receipt.amount} {props.receipt.assetCode} · {props.receipt.direction}</span><small>Operation {props.receipt.id}</small><small>Updated {new Date(props.receipt.updatedAt).toLocaleString()}</small></p>
   {!['COMPLETED','FAILED'].includes(props.receipt.status)&&<button type="button" onClick={()=>void props.onRefreshStatus()} disabled={props.busy||props.statusBusy||props.statusRefreshCount>=props.statusRefreshLimit}><RefreshCw/>{props.statusBusy?'Refreshing status…':props.statusRefreshCount>=props.statusRefreshLimit?'Refresh limit reached':`Refresh status (${props.statusRefreshCount}/${props.statusRefreshLimit})`}</button>}
  </div>}
 </form>
}
