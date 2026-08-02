import {CARD_LIST_MAX_JSON_BYTES,parseCardRecord,parseCardRecordRaw,readCardListPage} from './cardList'
import type {CardListTransportRequest,CardPage,CardRecord} from './cardList'
import {cardBalancePath,parseCardBalance} from './cardBalance'
import {cardTransactionPath,parseCardTransactionPage} from './cardTransactions'
import type {CardTransactionQuery} from './cardTransactions'
import {readCardTransactionDetailRefresh} from './cardTransactionDetailRefresh'
import type {CardTransactionDetailTransportRequest} from './cardTransactionDetailRefresh'
import {cardLimitsPath,parseCardLimits} from './cardLimits'
import {submitCardLimitsUpdate} from './cardLimitsUpdate'
import type {CardLimitsUpdateInput,CardLimitsUpdateTransportRequest} from './cardLimitsUpdate'
import {submitCardStatusAction} from './cardStatusAction'
import type {CardStatusOperation,CardStatusTransportRequest} from './cardStatusAction'
import {readCardActivationConfirmation} from './cardActivation'
import {readCardStatusConfirmation} from './cardStatusPostChain'
import type {WalletAccountRecord,WalletBalanceRecord,WalletTransferReceipt} from './walletData'
import {readWalletAccountBalance} from './walletAccountBalance'
import type {WalletAccountBalanceTransportRequest} from './walletAccountBalance'
import {readWalletOperationActivity,readWalletOperationDetail} from './walletOperations'
import type {WalletOperationFilterSelection,WalletOperationPage,WalletOperationRecord,WalletOperationTransportRequest} from './walletOperations'
import {parseVirtualCardCreateInput,parseVirtualCardCreateResponse,validateVirtualCardIdempotencyKey,virtualCardCreateDecision,virtualCardCreatePath} from './virtualCardCreate'
import type {VirtualCardCreateInput} from './virtualCardCreate'
import {submitCardReplacement} from './cardReplacement'
import type {CardReplacementInput,CardReplacementTransportRequest} from './cardReplacement'
import {readCardReplacementConfirmation} from './cardReplacementPostChain'
import {submitCardRenewal} from './cardRenewal'
import type {CardRenewalTransportRequest} from './cardRenewal'
import {readWalletBalanceSummary} from './walletBalanceSummary'
import type {WalletBalanceSummary,WalletBalanceSummaryTransportRequest} from './walletBalanceSummary'
import {WALLET_TRANSFER_ACCOUNTS_PATH,WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES,WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES,readWalletTransferAccounts,readWalletTransferStatus,submitWalletTransfer} from './walletTransfer'
import type {WalletTransferInput,WalletTransferTransportRequest} from './walletTransfer'
import {FX_QUOTE_RESPONSE_MAX_JSON_BYTES,readFxQuote} from './fxQuote'
import type {FxQuoteInput,FxQuoteTransportRequest} from './fxQuote'
import {readWalletTransactionDetail,readWalletTransactionHistory} from './walletTransactions'
import type {WalletTransactionFilters,WalletTransactionHistoryState,WalletTransactionRecord,WalletTransactionTransportRequest} from './walletTransactions'
import {API_REQUEST_DEADLINE_MS} from './requestPolicy'
import {sessionFailureRequiresClear} from './sessionLifecycle'
import {readCardTimelinePage} from './cardTimeline'
import type {CardTimelineTransportRequest} from './cardTimeline'

export type {WalletAccountRecord,WalletBalanceRecord,WalletTransferReceipt} from './walletData'
export type {WalletTransactionHistoryState as WalletTransactionPage,WalletTransactionRecord} from './walletTransactions'
export type {WalletOperationPage,WalletOperationRecord} from './walletOperations'
export type {CardBalanceRecord} from './cardBalance'
export type {CardLimitsRecord} from './cardLimits'
export type {CardLimitsUpdateInput} from './cardLimitsUpdate'
export type {VirtualCardCreateInput} from './virtualCardCreate'
export type {CardReplacementInput,CardReplacementReason} from './cardReplacement'
export type {WalletBalanceSummary} from './walletBalanceSummary'
export type {FxQuote,FxQuoteInput} from './fxQuote'
export type {CardTimelineEvent,CardTimelineHistory,CardTimelinePage} from './cardTimeline'

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

async function boundedResponseText(response:Response,maximumBytes:number):Promise<string>{
 const declared=response.headers.get('content-length')
 if(declared!==null){const length=Number(declared);if(Number.isFinite(length)&&length>maximumBytes){await response.body?.cancel();throw new Error('API response exceeds the consumer limit')}}
 if(!response.body){const value=await response.text();if(new TextEncoder().encode(value).byteLength>maximumBytes)throw new Error('API response exceeds the consumer limit');return value}
 const reader=response.body.getReader();const decoder=new TextDecoder();let received=0;let value=''
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;received+=chunk.value.byteLength;if(received>maximumBytes){await reader.cancel();throw new Error('API response exceeds the consumer limit')}value+=decoder.decode(chunk.value,{stream:true})}return value+decoder.decode()}finally{reader.releaseLock()}
}

async function request<T>(path:string,method='GET',body?:unknown,idempotencyKey?:string,responseMode:'json'|'text'='json',externalSignal?:AbortSignal,maximumResponseBytes?:number,sessionInvalidation:'broadcast'|'caller'='broadcast'):Promise<T>{
 const id=trace();const controller=new AbortController();let timedOut=false;const cancel=()=>controller.abort();if(externalSignal?.aborted)cancel();else externalSignal?.addEventListener('abort',cancel,{once:true});const timeout=window.setTimeout(()=>{timedOut=true;controller.abort()},API_REQUEST_DEADLINE_MS)
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
   try{const payload=maximumResponseBytes===undefined?await response.json():JSON.parse(await boundedResponseText(response,Math.min(maximumResponseBytes,16_384)));message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}
   throw new WalletApiError(response.status,returned,`${message} · HTTP ${response.status} · Trace ${returned}`)
  }
  if(response.status===204)return undefined as T
  return (responseMode==='text'?(maximumResponseBytes===undefined?response.text():boundedResponseText(response,maximumResponseBytes)):response.json()) as Promise<T>
 }catch(error){
  if(error instanceof WalletApiError){if(externalSignal?.aborted)throw new DOMException('Wallet request cancelled','AbortError');if(sessionInvalidation==='broadcast'&&sessionFailureRequiresClear(error))window.dispatchEvent(new CustomEvent('fastlink:session-invalid',{detail:error}));throw error}
  if(error instanceof DOMException&&error.name==='AbortError'&&timedOut)throw new WalletApiError(408,id,`API timeout · HTTP 408 · Trace ${id}`)
  if(error instanceof DOMException&&error.name==='AbortError'&&externalSignal?.aborted)throw new DOMException('Wallet transaction request cancelled','AbortError')
  const message=error instanceof Error?error.message:'Network failure'
  throw new WalletApiError(0,id,`${message} · HTTP 0 · Trace ${id}`)
 }finally{window.clearTimeout(timeout);externalSignal?.removeEventListener('abort',cancel)}
}

const walletTransferTransport=({path,method,body,idempotencyKey}:WalletTransferTransportRequest)=>request<string>(path,method,body,idempotencyKey,'text',undefined,path===WALLET_TRANSFER_ACCOUNTS_PATH?WALLET_TRANSFER_ACCOUNT_MAX_JSON_BYTES:WALLET_TRANSFER_RESPONSE_MAX_JSON_BYTES,'caller')
const walletTransactionTransport=({path,method,signal}:WalletTransactionTransportRequest)=>request<string>(path,method,undefined,undefined,'text',signal)
const walletBalanceSummaryTransport=({path,method,signal}:WalletBalanceSummaryTransportRequest)=>request<string>(path,method,undefined,undefined,'text',signal)
const walletAccountBalanceTransport=({path,method,signal}:WalletAccountBalanceTransportRequest)=>request<string>(path,method,undefined,undefined,'text',signal)
const cardListTransport=({path,method,signal}:CardListTransportRequest)=>request<string>(path,method,undefined,undefined,'text',signal,CARD_LIST_MAX_JSON_BYTES)
const walletOperationTransport=({path,method,signal}:WalletOperationTransportRequest)=>request<unknown>(path,method,undefined,undefined,'json',signal)
const cardTransactionDetailTransport=({path,method,signal}:CardTransactionDetailTransportRequest)=>request<unknown>(path,method,undefined,undefined,'json',signal)
const cardLimitsUpdateTransport=({path,method,body,idempotencyKey}:CardLimitsUpdateTransportRequest)=>request<unknown>(path,method,body,idempotencyKey)
const cardStatusTransport=({path,method,idempotencyKey,signal}:CardStatusTransportRequest)=>{
 if(!csrfToken())return Promise.reject(new WalletApiError(400,trace(),'Card status security context unavailable'))
 return request<unknown>(path,method,undefined,idempotencyKey,'json',signal,undefined,'caller')
}
const cardActivationListTransport=({path,method,signal}:CardListTransportRequest)=>request<string>(path,method,undefined,undefined,'text',signal,CARD_LIST_MAX_JSON_BYTES,'caller')
const cardReplacementTransport=({path,method,body,idempotencyKey,signal}:CardReplacementTransportRequest)=>request<unknown>(path,method,body,idempotencyKey,'json',signal,undefined,'caller')
const cardRenewalTransport=({path,method,idempotencyKey}:CardRenewalTransportRequest)=>request<unknown>(path,method,undefined,idempotencyKey)
const fxQuoteTransport=({path,method,body,signal}:FxQuoteTransportRequest)=>request<string>(path,method,body,undefined,'text',signal,FX_QUOTE_RESPONSE_MAX_JSON_BYTES,'caller')
const cardTimelineTransport=({path,method,signal}:CardTimelineTransportRequest)=>request<unknown>(path,method,undefined,undefined,'json',signal,undefined,'caller')

export const walletApi={
 register:(credentials:WalletCredentials)=>request<WalletSession>('/v1/auth/register','POST',credentials),
 login:(credentials:WalletCredentials)=>request<WalletSession>('/v1/auth/login','POST',credentials),
 refresh:()=>request<WalletSession>('/v1/auth/refresh','POST'),
 logout:()=>request<void>('/v1/auth/logout','POST'),
 session:()=>request<WalletSession>('/v1/session'),
 walletAccounts:async(session:WalletSession):Promise<WalletAccountRecord[]>=>readWalletTransferAccounts(walletTransferTransport,session,walletRuntime.environment),
 walletBalanceSummary:async(session:WalletSession,scopeKey:string,signal?:AbortSignal):Promise<WalletBalanceSummary>=>readWalletBalanceSummary(walletBalanceSummaryTransport,session,walletRuntime.environment,scopeKey,signal),
 walletBalance:async(session:WalletSession,scopeKey:string,account:WalletAccountRecord,signal?:AbortSignal):Promise<WalletBalanceRecord>=>readWalletAccountBalance(walletAccountBalanceTransport,session,walletRuntime.environment,scopeKey,account,signal),
 walletTransactions:async(session:WalletSession,filters:WalletTransactionFilters,previous:WalletTransactionHistoryState|null=null,signal?:AbortSignal):Promise<WalletTransactionHistoryState>=>readWalletTransactionHistory(walletTransactionTransport,session,walletRuntime.environment,filters,previous,signal),
 walletOperations:async(session:WalletSession,scopeKey:string,filters:WalletOperationFilterSelection,cursor:string|undefined,signal:AbortSignal):Promise<WalletOperationPage>=>readWalletOperationActivity(walletOperationTransport,session,walletRuntime.environment,scopeKey,filters,cursor,signal),
 walletOperationDetail:async(session:WalletSession,scopeKey:string,selected:WalletOperationRecord,signal:AbortSignal):Promise<WalletOperationRecord>=>readWalletOperationDetail(walletOperationTransport,session,walletRuntime.environment,scopeKey,selected,signal),
 walletTransactionDetail:async(session:WalletSession,selected:WalletTransactionRecord,signal?:AbortSignal):Promise<WalletTransactionRecord>=>readWalletTransactionDetail(walletTransactionTransport,session,walletRuntime.environment,selected,signal),
 internalTransfer:async(session:WalletSession,accounts:readonly WalletAccountRecord[],input:InternalTransferInput,idempotencyKey:string):Promise<WalletTransferReceipt>=>submitWalletTransfer(walletTransferTransport,session,walletRuntime.environment,accounts,input,idempotencyKey),
 walletTransferStatus:async(session:WalletSession,previous:WalletTransferReceipt):Promise<WalletTransferReceipt>=>readWalletTransferStatus(walletTransferTransport,session,walletRuntime.environment,previous),
 fxQuote:async(session:WalletSession,input:FxQuoteInput,signal:AbortSignal)=>readFxQuote(fxQuoteTransport,session,walletRuntime.environment,input,signal),
 cards:async(session:WalletSession,scopeKey:string,cursor:string|null=null,previousCards:readonly CardRecord[]=[],signal?:AbortSignal):Promise<CardPage>=>readCardListPage(cardListTransport,session,walletRuntime.environment,scopeKey,cursor,previousCards,signal),
 card:async(id:string,signal?:AbortSignal)=>parseCardRecord(await request<unknown>(`/v1/cards/${encodeURIComponent(id)}`,'GET',undefined,undefined,'json',signal)),
 balance:async(id:string,signal?:AbortSignal)=>parseCardBalance(await request<unknown>(cardBalancePath(id),'GET',undefined,undefined,'json',signal),id),
 limits:async(id:string,signal?:AbortSignal)=>parseCardLimits(await request<unknown>(cardLimitsPath(id),'GET',undefined,undefined,'json',signal),id),
 updateCardLimits:async(card:import('./cardList').CardRecord,current:import('./cardLimits').CardLimitsRecord,input:CardLimitsUpdateInput,idempotencyKey:string,sessionEnvironment:FastLinkEnvironment,scopeKey:string,currentScopeKey:string|null,currentCardId:string|null)=>submitCardLimitsUpdate(cardLimitsUpdateTransport,card,current,input,idempotencyKey,sessionEnvironment,walletRuntime.environment,scopeKey,currentScopeKey,currentCardId),
 transactions:async(id:string,query:CardTransactionQuery,signal?:AbortSignal)=>parseCardTransactionPage(await request<unknown>(cardTransactionPath(id,query),'GET',undefined,undefined,'json',signal),query.filter),
 timeline:async(session:WalletSession,scopeKey:string,id:string,cursor:string|null,signal:AbortSignal)=>readCardTimelinePage(cardTimelineTransport,session,walletRuntime.environment,scopeKey,id,cursor,signal),
 cardTransactionDetail:async(session:WalletSession,cardId:string,selected:import('./cardTransactions').CardTransactionRecord,scopeKey:string,signal:AbortSignal)=>readCardTransactionDetailRefresh(cardTransactionDetailTransport,session,walletRuntime.environment,scopeKey,cardId,selected,signal),
 createVirtualCard:async(input:VirtualCardCreateInput,idempotencyKey:string,sessionEnvironment:FastLinkEnvironment)=>{const decision=virtualCardCreateDecision(sessionEnvironment,walletRuntime.environment);if(!decision.allowed)throw new Error(decision.reason??'Virtual card creation is unavailable');const normalized=parseVirtualCardCreateInput(input);return parseVirtualCardCreateResponse(await request<unknown>(virtualCardCreatePath(),'POST',normalized,validateVirtualCardIdempotencyKey(idempotencyKey)),normalized)},
 replaceCard:async(session:WalletSession,card:import('./cardList').CardRecord,input:CardReplacementInput,idempotencyKey:string,currentScopeKey:string|null,currentCardId:string|null,signal?:AbortSignal)=>submitCardReplacement(cardReplacementTransport,session,walletRuntime.environment,currentScopeKey,currentCardId,card,input,idempotencyKey,Date.now(),signal),
 renewCard:async(session:WalletSession,card:import('./cardList').CardRecord,idempotencyKey:string,currentScopeKey:string|null,currentCardId:string|null)=>submitCardRenewal(cardRenewalTransport,session,walletRuntime.environment,currentScopeKey,currentCardId,card,idempotencyKey),
 setCardStatus:async(session:WalletSession,card:import('./cardList').CardRecord,operation:CardStatusOperation,idempotencyKey:string,currentScopeKey:string|null,currentCardId:string|null,signal?:AbortSignal)=>submitCardStatusAction(cardStatusTransport,session,walletRuntime.environment,currentScopeKey,currentCardId,card,operation,idempotencyKey,Date.now(),signal),
 confirmCardActivation:async(session:WalletSession,scopeKey:string,card:import('./cardList').CardRecord,signal?:AbortSignal)=>readCardActivationConfirmation({
  card:async(id,readSignal)=>parseCardRecordRaw(await request<string>(`/v1/cards/${encodeURIComponent(id)}`,'GET',undefined,undefined,'text',readSignal,CARD_LIST_MAX_JSON_BYTES,'caller')),
  cards:(cursor,previousCards,readSignal)=>readCardListPage(cardActivationListTransport,session,walletRuntime.environment,scopeKey,cursor,previousCards,readSignal),
 },card,signal),
 confirmCardStatus:async(session:WalletSession,scopeKey:string,selected:import('./cardList').CardRecord,submitted:import('./cardList').CardRecord,operation:Extract<CardStatusOperation,'freeze'|'unfreeze'>,signal?:AbortSignal)=>readCardStatusConfirmation({
  card:async(id,readSignal)=>parseCardRecordRaw(await request<string>(`/v1/cards/${encodeURIComponent(id)}`,'GET',undefined,undefined,'text',readSignal,CARD_LIST_MAX_JSON_BYTES,'caller')),
  cards:(cursor,previousCards,readSignal)=>readCardListPage(cardActivationListTransport,session,walletRuntime.environment,scopeKey,cursor,previousCards,readSignal),
 },selected,submitted,operation,signal),
 confirmCardReplacement:async(session:WalletSession,scopeKey:string,selected:import('./cardList').CardRecord,submitted:import('./cardList').CardRecord,signal?:AbortSignal)=>readCardReplacementConfirmation({
  card:async(id,readSignal)=>parseCardRecordRaw(await request<string>(`/v1/cards/${encodeURIComponent(id)}`,'GET',undefined,undefined,'text',readSignal,CARD_LIST_MAX_JSON_BYTES,'caller')),
  cards:(cursor,previousCards,readSignal)=>readCardListPage(cardActivationListTransport,session,walletRuntime.environment,scopeKey,cursor,previousCards,readSignal),
 },selected,submitted,signal),
}
