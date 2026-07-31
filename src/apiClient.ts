import {cardListPath,parseCardPage,parseCardRecord} from './cardList'

export type FastLinkEnvironment='LOCAL'|'SANDBOX'|'TEST'|'UAT'|'PRODUCTION'
export type WalletSession={actorId:string;tenantId:string;customerId:string;environment:FastLinkEnvironment;expiresAt?:string}
export type WalletCredentials={tenantId:string;email:string;password:string}
export type WalletAccountRecord={id:string;accountCode:string;name:string;assetCode:string;status:string;currentBalance:string;postedBalance:string;pendingBalance:string;availableBalance:string;updatedAt:string}
export type WalletTransactionPage={items:Array<{id:string;type:string;status:string;assetCode:string;amount:string;createdAt:string;referenceType?:string}>;pagination:{total:number;limit:number;offset:number;hasMore:boolean}}
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
 walletAccounts:()=>request<WalletAccountRecord[]>('/v1/wallet/accounts'),
 walletBalance:(accountId:string)=>request<Record<string,unknown>>(`/v1/wallet/accounts/${encodeURIComponent(accountId)}/balance`),
 walletTransactions:(accountId:string)=>request<WalletTransactionPage>(`/v1/wallet/accounts/${encodeURIComponent(accountId)}/transactions?limit=100`),
 internalTransfer:(input:InternalTransferInput)=>request<Record<string,unknown>>('/v1/wallet/transfers','POST',input,crypto.randomUUID()),
 cards:async(cursor?:string)=>parseCardPage(await request<unknown>(cardListPath(cursor))),
 card:async(id:string)=>parseCardRecord(await request<unknown>(`/v1/cards/${encodeURIComponent(id)}`)),
 balance:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/balance`),
 transactions:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/transactions`),
 freeze:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/freeze`,'POST',undefined,crypto.randomUUID()),
 unfreeze:(id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/unfreeze`,'POST',undefined,crypto.randomUUID()),
}
