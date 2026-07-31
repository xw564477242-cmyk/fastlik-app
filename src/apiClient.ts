import {cardListPath,parseCardPage,parseCardRecord} from './cardList'
import {cardBalancePath,parseCardBalance} from './cardBalance'
import {cardTransactionPath,parseCardTransactionPage} from './cardTransactions'
import {cardLimitsPath,parseCardLimits} from './cardLimits'
import {parseWalletAccounts,parseWalletBalance,parseWalletTransactionDetail,parseWalletTransactionPage,parseWalletTransferReceipt,walletOperationPath,walletTransactionDetailPath,walletTransactionPath} from './walletData'
import type {WalletAccountRecord,WalletBalanceRecord,WalletTransactionPage,WalletTransactionRecord,WalletTransferReceipt} from './walletData'

export type {WalletAccountRecord,WalletBalanceRecord,WalletTransactionPage,WalletTransactionRecord,WalletTransferReceipt} from './walletData'
export type {CardBalanceRecord} from './cardBalance'
export type {CardLimitsRecord} from './cardLimits'

export type FastLinkEnvironment='LOCAL'|'SANDBOX'|'TEST'|'UAT'|'PRODUCTION'
export type WalletSession={actorId:string;tenantId:string;customerId:string;environment:FastLinkEnvironment;expiresAt?:string}
export type WalletCredentials={tenantId:string;email:string;password:string}
export type InternalTransferInput={sourceAccountId:string;destinationAccountId:string;assetCode:string;amount:string}

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

async function request<T>(path:string,method='GET',body?:unknown,idempotencyKey?:string):Promise<T>{
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
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof WalletApiError)throw error
  if(error instanceof DOMException&&error.name==='AbortError')throw new WalletApiError(408,id,`API timeout · HTTP 408 · Trace ${id}`)
  const message=error instanceof Error?error.message:'Network failure'
  throw new WalletApiError(0,id,`${message} · HTTP 0 · Trace ${id}`)
 }finally{window.clearTimeout(timeout)}
}

export const walletApi={
 register:(credentials:WalletCredentials)=>request<WalletSession>('/v1/auth/register','POST',credentials),
 login:(credentials:WalletCredentials)=>request<WalletSession>('/v1/auth/login','POST',credentials),
 refresh:()=>request<WalletSession>('/v1/auth/refresh','POST'),
 logout:()=>request<void>('/v1/auth/logout','POST'),
 session:()=>request<WalletSession>('/v1/session'),
 walletAccounts:async():Promise<WalletAccountRecord[]>=>parseWalletAccounts(await request<unknown>('/v1/wallet/accounts')),
 walletBalance:async(accountId:string):Promise<WalletBalanceRecord>=>{const balance=parseWalletBalance(await request<unknown>(`/v1/wallet/accounts/${encodeURIComponent(accountId)}/balance`));if(balance.accountId!==accountId)throw new Error('Wallet balance account does not match the requested account');return balance},
 walletTransactions:async(selectedAsset:string,cursor?:string):Promise<WalletTransactionPage>=>parseWalletTransactionPage(await request<unknown>(walletTransactionPath(selectedAsset,cursor)),selectedAsset),
 walletTransactionDetail:async(selected:{id:string;assetCode:string;amount:string}):Promise<WalletTransactionRecord>=>parseWalletTransactionDetail(await request<unknown>(walletTransactionDetailPath(selected.id)),{transactionId:selected.id,assetCode:selected.assetCode,amount:selected.amount}),
 internalTransfer:async(input:InternalTransferInput):Promise<WalletTransferReceipt>=>{const idempotencyKey=crypto.randomUUID();return parseWalletTransferReceipt(await request<unknown>('/v1/wallet/transfers','POST',input,idempotencyKey),{assetCode:input.assetCode,amount:input.amount})},
 walletTransferStatus:async(operationId:string,expected:{assetCode:string;amount:string}):Promise<WalletTransferReceipt>=>parseWalletTransferReceipt(await request<unknown>(walletOperationPath(operationId)),{operationId,...expected}),
 cards:async(cursor?:string)=>parseCardPage(await request<unknown>(cardListPath(cursor))),
 card:async(id:string)=>parseCardRecord(await request<unknown>(`/v1/cards/${encodeURIComponent(id)}`)),
 balance:async(id:string)=>parseCardBalance(await request<unknown>(cardBalancePath(id)),id),
 limits:async(id:string)=>parseCardLimits(await request<unknown>(cardLimitsPath(id)),id),
 transactions:async(id:string,cursor?:string)=>parseCardTransactionPage(await request<unknown>(cardTransactionPath(id,cursor))),
 freeze:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/freeze`,'POST',undefined,crypto.randomUUID()),
 unfreeze:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/unfreeze`,'POST',undefined,crypto.randomUUID()),
}
