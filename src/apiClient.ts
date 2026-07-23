export type FastLinkEnvironment='LOCAL'|'SANDBOX'|'UAT'|'PRODUCTION'
const apiUrl=(import.meta.env.VITE_FASTLINK_API_URL as string|undefined)?.trim().replace(/\/$/,'')
const environment=(import.meta.env.VITE_FASTLINK_ENVIRONMENT as FastLinkEnvironment|undefined)
if(!apiUrl)throw new Error('Missing VITE_FASTLINK_API_URL')
if(!environment||!['LOCAL','SANDBOX','UAT','PRODUCTION'].includes(environment))throw new Error('Invalid VITE_FASTLINK_ENVIRONMENT')
if(environment==='PRODUCTION'&&!apiUrl.startsWith('https://'))throw new Error('Production API must use HTTPS')

export const walletRuntime=Object.freeze({apiUrl,environment,buildSha:(import.meta.env.VITE_FASTLINK_BUILD_SHA as string|undefined)?.trim()||'unknown'})
export class WalletApiError extends Error{constructor(public status:number,public traceId:string,message:string){super(message)}}
const trace=()=>crypto.randomUUID()

async function request<T>(path:string,token:string,method='GET',body?:unknown,idempotencyKey?:string):Promise<T>{
 const id=trace();const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),20_000)
 try{
  const response=await fetch(`${apiUrl}${path}`,{
   method,cache:'no-store',credentials:'omit',signal:controller.signal,
   headers:{Accept:'application/json','X-Trace-Id':id,Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  })
  const returned=response.headers.get('x-trace-id')||id
  if(!response.ok){
   let message=`HTTP ${response.status}`
   try{const payload=await response.json();message=Array.isArray(payload.message)?payload.message.join(', '):(payload.message||message)}catch{}
   throw new WalletApiError(response.status,returned,`${message} · HTTP ${response.status} · Trace ${returned}`)
  }
  return response.json() as Promise<T>
 }catch(error){
  if(error instanceof WalletApiError)throw error
  if(error instanceof DOMException&&error.name==='AbortError')throw new WalletApiError(408,id,`API timeout · HTTP 408 · Trace ${id}`)
  const message=error instanceof Error?error.message:'Network failure'
  throw new WalletApiError(0,id,`${message} · HTTP 0 · Trace ${id}`)
 }finally{window.clearTimeout(timeout)}
}

export const walletApi={
 session:(token:string)=>request<{environment:FastLinkEnvironment;tenantId:string;customerId:string}>('/v1/session',token),
 cards:(token:string)=>request<Array<Record<string,unknown>>>('/v1/cards',token),
 card:(token:string,id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}`,token),
 balance:(token:string,id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/balance`,token),
 transactions:(token:string,id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/transactions`,token),
 freeze:(token:string,id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/freeze`,token,'POST',undefined,crypto.randomUUID()),
 unfreeze:(token:string,id:string)=>request<Record<string,unknown>>(`/v1/cards/${encodeURIComponent(id)}/unfreeze`,token,'POST',undefined,crypto.randomUUID()),
}
