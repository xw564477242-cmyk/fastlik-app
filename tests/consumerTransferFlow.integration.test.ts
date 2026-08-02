import assert from 'node:assert/strict'
import test from 'node:test'
import {consumerTransferUiRequestIsCurrent,createConsumerTransferUiRequest} from '../src/consumerTransferState.ts'
import {normalizeWalletTransferInput,submitWalletTransfer,walletTransferSessionScope,type WalletTransferTransportRequest} from '../src/walletTransfer.ts'

const configuredEnvironment=process.env.FASTLINK_TEST_ENVIRONMENT
const environment=configuredEnvironment==='SANDBOX'||configuredEnvironment==='TEST'?configuredEnvironment:null
const integration=environment?test:test.skip
const account=(id:string)=>({id,accountCode:`ACCOUNT-${id}`,name:`Wallet ${id}`,assetCode:'USD',status:'ACTIVE' as const,currentBalance:'100',postedBalance:'100',pendingBalance:'0',availableBalance:'100',updatedAt:'2026-08-02T00:00:00.000Z'})

integration(`Consumer transfer UI uses the existing exact contract once (${environment??'ENVIRONMENT_REQUIRED'})`,async()=>{
 const session={actorId:'actor-consumer-01',tenantId:'tenant-consumer-01',customerId:'customer-consumer-01',environment:environment!,expiresAt:'2099-08-02T00:00:00.000Z'}
 const accounts=[account('source'),account('destination')]
 assert.ok(walletTransferSessionScope(session,environment!))
 assert.equal(normalizeWalletTransferInput({sourceAccountId:accounts[0].id,destinationAccountId:accounts[1].id,assetCode:'USD',amount:'25'},accounts).amount,'25')
 const calls:WalletTransferTransportRequest[]=[]
 const transport=async(request:WalletTransferTransportRequest)=>{
  calls.push(request)
  return JSON.stringify({id:'operation-consumer-01',type:'INTERNAL_TRANSFER',status:'PROCESSING',assetCode:'USD',amount:'25',direction:'OUTGOING',createdAt:'2026-08-02T00:00:00.000Z',completedAt:null,updatedAt:'2026-08-02T00:00:00.000Z'})
 }
 const input={sourceAccountId:accounts[0].id,destinationAccountId:accounts[1].id,assetCode:'USD',amount:'25'}
 const receipt=await submitWalletTransfer(transport,session,environment!,accounts,input,'123e4567-e89b-42d3-a456-426614174000')
 assert.deepEqual(calls,[{path:'/v1/wallet/transfers',method:'POST',body:input,idempotencyKey:'123e4567-e89b-42d3-a456-426614174000'}])
 assert.deepEqual(Object.keys(receipt).sort(),['amount','assetCode','completedAt','createdAt','direction','id','status','type','updatedAt'])
})

integration('mounted completion becomes a zero-write result after any UI identity change',()=>{
 const request=createConsumerTransferUiRequest(1,{sourceAccountId:'source',destinationAccountId:'destination',amount:'25'})
 const changes:[number,boolean,string|null,string,string][]=[
  [2,true,'source','destination','25'],
  [1,false,'source','destination','25'],
  [1,true,'other','destination','25'],
  [1,true,'source','other','25'],
  [1,true,'source','destination','26'],
 ]
 for(const current of changes)assert.equal(consumerTransferUiRequestIsCurrent(request,...current),false)
})
