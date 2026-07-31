import {cardListPath,parseCardPage,parseCardRecord} from './cardList'
import {cardBalancePath,parseCardBalance} from './cardBalance'
import {cardTransactionPath,parseCardTransactionPage} from './cardTransactions'
import {cardLimitsPath,parseCardLimits} from './cardLimits'
import {parseWalletBalance} from './walletData'
import type {WalletAccountRecord,WalletBalanceRecord,WalletTransferReceipt} from './walletData'
import {parseWalletOperationDetail,parseWalletOperationPage,walletOperationActivityPath,walletOperationDetailPath} from './walletOperations'
import type {WalletOperationPage,WalletOperationRecord} from './walletOperations'
import {parseVirtualCardCreateInput,parseVirtualCardCreateResponse,validateVirtualCardIdempotencyKey,virtualCardCreateDecision,virtualCardCreatePath} from './virtualCardCreate'
import type {VirtualCardCreateInput} from './virtualCardCreate'
import {cardReplacementDecision,cardReplacementPath,parseCardReplacementInput,parseCardReplacementResponse,validateCardReplacementIdempotencyKey} from './cardReplacement'
import type {CardReplacementInput} from './cardReplacement'
import {cardRenewalDecision,cardRenewalPath,parseCardRenewalResponse,validateCardRenewalIdempotencyKey} from './cardRenewal'
import {parseWalletBalanceSummary,WALLET_BALANCE_SUMMARY_PATH,walletBalanceSummaryReadAllowed} from './walletBalanceSummary'
import type {WalletBalanceSummary} from './walletBalanceSummary'
import {readWalletTransferAccounts,readWalletTransferStatus,submitWalletTransfer} from './walletTransfer'
import type {WalletTransferInput,WalletTransferTransportRequest} from './walletTransfer'
import {readWalletTransactionDetail,readWalletTransactionHistory} from './walletTransactions'
import type {WalletTransactionFilters,WalletTransactionHistoryState,WalletTransactionRecord,WalletTransactionTransportRequest} from './walletTransactions'

export type {WalletAccountRecord,WalletBalanceRecord,WalletTransferReceipt} from './walletData'
export type {WalletTransactionHistoryState as WalletTransactionPage,WalletTransactionRecord} from './walletTransactions'
export type {WalletOperationPage,WalletOperationRecord} from './walletOperations'
export type {CardBalanceRecord} from './cardBalance'
export type {CardLimitsRecord} from './cardLimits'
export type {VirtualCardCreateInput} from './virtualCardCreate'
export type {CardReplacementInput,CardReplacementReason} from './cardReplacement'
export type {WalletBalanceSummary} from './walletBalanceSummary'

export type FastLinkEnvironment='LOCAL'|'SANDBOX'|'TEST'|'UAT'|'PRODUCTION'
export type WalletSession={actorId:string;tenantId:string;customerId:string;environment:FastLinkEnvironment;expiresAt?:string}
export type WalletCredentials={tenantId:string;email:string;password:string}
export type InternalTransferInput=WalletTransferInput

const buildApiUrl=(import.meta.env.VITE_FASTLINK_API_URL as string|undefined)?.trim()
const buildEnvironment=(import.meta.env.VITE_FASTLINK_ENVIRONMENT as FastLinkEnvironment|undefined)
const apiUrl=(window.__FASTLINK_RUNTIME__?.apiUrl?.trim()||buildApiUrl||'').replace(/\/$/,'')
const environment=(window.__FASTLINK_RUNTIME__?.environment?.trim()||buildEnvironment) as FastLinkEnvironment|undefined
if(!apiUrl)throw new Error('Missing VITE_FASTLINK_API_URL')
if(!environment||!['LOCAL','SANDBOX','TEST','UAT','PRODUCTION'].includes(environment))throw new Error('Invalid VITE_FASTLINK_ENVIRONMENT')
if(['SANDBOX','TEST','PRODUCTION'].includes(environment)&&apiUrl!=='/api')throw new Error(`${environment} Cloudflare Wallet must use same-origin /api`)

const runtimeBuildSha=window.__FASTLINK_RUNTIME__?.buildSha?.trim()
const verifiedRuntimeBuildSha=runtimeBuildSha&&/^[0-9a-f]{40}$/i.test(runtimeBuildSha)?runtimeBuildSha:undefined
export const walletRuntime=Object.freeze({apiUrl,environment,buildSha:verifiedRuntimeBuildSha||(import.meta.env.VITE_FASTLINK_BUILD_SHA as string|undefined)?.trim()||'unknown'})
export class WalletApiError extends Error{constructor(public status:number,public traceId:string,message:string){super(message)}}
const trace=()=>crypto.randomUUID()
const csrfToken=()=>document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('fastlink_csrf='))?.slice('fastlink_csrf='.length)

async function request<T>(path:string,method='GET',body?:unknown,idempotencyKey?:string,responseMode:'json'|'text'='json'):Promise<T>{
 const id=trace();const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),20_000)
 try{
  const csrf=csrfToken()
  const mutating=!['GET','HEAD','OPTIONS'].includes(method)
  const response=await fetch(`${apiUrl}${path}`,{
   method,cache:'no-store',credentials:'include',signal:controller.signal,
   headers:{
    Accept:'application/json',
    'X-Trace-Id':id,
    ...(body?{'Content-Type':'application/json'}:{}),
    ...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{}),
    ...(mutating&&csrf?{'X-CSRF-Token':decodeURIComponent(csrf)}:{}),
   },
   ...(body?{body:JSON.stringify(body)}:{})
  })
  const returned=response.headers.get('x-trace-id')||id
  if(!response.ok){
   let message=`HTTP ${response.status}`
   try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}
   throw new WalletApiError(response.status,returned,`${message} · HTTP ${response.status} · Trace ${returned}`)
  }
  if(response.status===204)return undefined as T
  return (responseMode==='text'?response.text():response.json()) as Promise<T>
 }catch(error){
  if(error instanceof WalletApiError)throw error
  if(error instanceof DOMException&&error.name==='AbortError')throw new WalletApiError(408,id,`API timeout · HTTP 408 · Trace ${id}`)
  const message=error instanceof Error?error.message:'Network failure'
  throw new WalletApiError(0,id,`${message} · HTTP 0 · Trace ${id}`)
 }finally{window.clearTimeout(timeout)}
}

const walletTransferTransport=({path,method,body,idempotencyKey}:WalletTransferTransportRequest)=>request<string>(path,method,body,idempotencyKey,'text')
const walletTransactionTransport=({path,method}:WalletTransactionTransportRequest)=>request<string>(path,method,undefined,undefined,'text')

export const walletApi={
 register:(credentials:WalletCredentials)=>request<WalletSession>('/v1/auth/register','POST',credentials),
 login:(credentials:WalletCredentials)=>request<WalletSession>('/v1/auth/login','POST',credentials),
 refresh:()=>request<WalletSession>('/v1/auth/refresh','POST'),
 logout:()=>request<void>('/v1/auth/logout','POST'),
 session:()=>request<WalletSession>('/v1/session'),
 walletAccounts:async(session:WalletSession):Promise<WalletAccountRecord[]>=>readWalletTransferAccounts(walletTransferTransport,session,walletRuntime.environment),
 walletBalanceSummary:async(sessionEnvironment:FastLinkEnvironment):Promise<WalletBalanceSummary>=>{if(!walletBalanceSummaryReadAllowed(sessionEnvironment,walletRuntime.environment))throw new Error('Wallet balance summary is available only in the matching SANDBOX or TEST session');return parseWalletBalanceSummary(await request<string>(WALLET_BALANCE_SUMMARY_PATH,'GET',undefined,undefined,'text'))},
 walletBalance:async(accountId:string):Promise<WalletBalanceRecord>=>{const balance=parseWalletBalance(await request<unknown>(`/v1/wallet/accounts/${encodeURIComponent(accountId)}/balance`));if(balance.accountId!==accountId)throw new Error('Wallet balance account does not match the requested account');return balance},
 walletTransactions:async(session:WalletSession,filters:WalletTransactionFilters,previous:WalletTransactionHistoryState|null=null):Promise<WalletTransactionHistoryState>=>readWalletTransactionHistory(walletTransactionTransport,session,walletRuntime.environment,filters,previous),
 walletOperations:async(cursor?:string):Promise<WalletOperationPage>=>parseWalletOperationPage(await request<unknown>(walletOperationActivityPath(cursor))),
 walletOperationDetail:async(selected:WalletOperationRecord):Promise<WalletOperationRecord>=>parseWalletOperationDetail(await request<unknown>(walletOperationDetailPath(selected.id)),selected),
 walletTransactionDetail:async(session:WalletSession,selected:WalletTransactionRecord):Promise<WalletTransactionRecord>=>readWalletTransactionDetail(walletTransactionTransport,session,walletRuntime.environment,selected),
 internalTransfer:async(session:WalletSession,accounts:readonly WalletAccountRecord[],input:InternalTransferInput,idempotencyKey:string):Promise<WalletTransferReceipt>=>submitWalletTransfer(walletTransferTransport,session,walletRuntime.environment,accounts,input,idempotencyKey),
 walletTransferStatus:async(session:WalletSession,previous:WalletTransferReceipt):Promise<WalletTransferReceipt>=>readWalletTransferStatus(walletTransferTransport,session,walletRuntime.environment,previous),
 cards:async(cursor?:string)=>parseCardPage(await request<unknown>(cardListPath(cursor))),
 card:async(id:string)=>parseCardRecord(await request<unknown>(`/v1/cards/${encodeURIComponent(id)}`)),
 balance:async(id:string)=>parseCardBalance(await request<unknown>(cardBalancePath(id)),id),
 limits:async(id:string)=>parseCardLimits(await request<unknown>(cardLimitsPath(id)),id),
 transactions:async(id:string,cursor?:string)=>parseCardTransactionPage(await request<unknown>(cardTransactionPath(id,cursor))),
 createVirtualCard:async(input:VirtualCardCreateInput,idempotencyKey:string,sessionEnvironment:FastLinkEnvironment)=>{const decision=virtualCardCreateDecision(sessionEnvironment,walletRuntime.environment);if(!decision.allowed)throw new Error(decision.reason??'Virtual card creation is unavailable');const normalized=parseVirtualCardCreateInput(input);return parseVirtualCardCreateResponse(await request<unknown>(virtualCardCreatePath(),'POST',normalized,validateVirtualCardIdempotencyKey(idempotencyKey)),normalized)},
 replaceCard:async(card:import('./cardList').CardRecord,input:CardReplacementInput,idempotencyKey:string,sessionEnvironment:FastLinkEnvironment,scopeKey:string,currentScopeKey:string|null,currentCardId:string|null)=>{const decision=cardReplacementDecision(card,sessionEnvironment,walletRuntime.environment,scopeKey,currentScopeKey,currentCardId);if(!decision.allowed)throw new Error(decision.reason??'Card replacement is unavailable');const normalized=parseCardReplacementInput(input);return parseCardReplacementResponse(await request<unknown>(cardReplacementPath(card.id),'POST',normalized,validateCardReplacementIdempotencyKey(idempotencyKey)),card.id)},
 renewCard:async(card:import('./cardList').CardRecord,idempotencyKey:string,sessionEnvironment:FastLinkEnvironment,scopeKey:string,currentScopeKey:string|null,currentCardId:string|null)=>{const decision=cardRenewalDecision(card,sessionEnvironment,walletRuntime.environment,scopeKey,currentScopeKey,currentCardId);if(!decision.allowed)throw new Error(decision.reason??'Card renewal is unavailable');return parseCardRenewalResponse(await request<unknown>(cardRenewalPath(card.id),'POST',undefined,validateCardRenewalIdempotencyKey(idempotencyKey)),card)},
 freeze:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/freeze`,'POST',undefined,crypto.randomUUID()),
 unfreeze:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/unfreeze`,'POST',undefined,crypto.randomUUID()),
}
