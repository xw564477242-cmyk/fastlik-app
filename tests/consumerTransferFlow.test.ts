import assert from 'node:assert/strict'
import test from 'node:test'
import {consumerTransferDestinations,consumerTransferUiRequestIsCurrent,createConsumerTransferUiRequest} from '../src/consumerTransferState.ts'
import {normalizeWalletTransferInput} from '../src/walletTransfer.ts'

const account=(id:string,overrides:Record<string,unknown>={})=>({
 id,
 accountCode:`ACCOUNT-${id}`,
 name:`Wallet ${id}`,
 assetCode:'USD',
 status:'ACTIVE' as const,
 currentBalance:'100',
 postedBalance:'100',
 pendingBalance:'0',
 availableBalance:'100',
 updatedAt:'2026-08-02T00:00:00.000Z',
 ...overrides,
})

test('offers only current customer-owned active same-asset destinations',()=>{
 const source=account('source')
 const accounts=[source,account('destination'),account('inactive',{status:'CLOSED'}),account('eur',{assetCode:'EUR'})]
 assert.deepEqual(consumerTransferDestinations(accounts,source).map(row=>row.id),['destination'])
 assert.deepEqual(consumerTransferDestinations(accounts,{...source,status:'CLOSED'}),[])
 assert.deepEqual(consumerTransferDestinations(accounts,null),[])
})

test('delegates strict asset, amount and balance checks to the verified transfer contract',()=>{
 const source=account('source')
 const destination=account('destination')
 const accounts=[source,destination]
 assert.equal(normalizeWalletTransferInput({sourceAccountId:source.id,destinationAccountId:destination.id,assetCode:'USD',amount:'25.00'},accounts).amount,'25')
 assert.throws(()=>normalizeWalletTransferInput({sourceAccountId:source.id,destinationAccountId:destination.id,assetCode:'USD',amount:'101'},accounts),/balance/)
 assert.throws(()=>normalizeWalletTransferInput({sourceAccountId:source.id,destinationAccountId:source.id,assetCode:'USD',amount:'1'},accounts),/differ/)
 assert.throws(()=>normalizeWalletTransferInput({sourceAccountId:source.id,destinationAccountId:destination.id,assetCode:'USD',amount:'1'},[{...source,status:'CLOSED'},destination]),/inactive/)
})

test('rejects UI completion after input, source, generation or mount changes',()=>{
 const request=createConsumerTransferUiRequest(7,{sourceAccountId:'source',destinationAccountId:'destination',amount:'25.00'})
 assert.equal(consumerTransferUiRequestIsCurrent(request,7,true,'source','destination','25.00'),true)
 assert.equal(consumerTransferUiRequestIsCurrent(request,8,true,'source','destination','25.00'),false)
 assert.equal(consumerTransferUiRequestIsCurrent(request,7,false,'source','destination','25.00'),false)
 assert.equal(consumerTransferUiRequestIsCurrent(request,7,true,'other','destination','25.00'),false)
 assert.equal(consumerTransferUiRequestIsCurrent(request,7,true,'source','other','25.00'),false)
 assert.equal(consumerTransferUiRequestIsCurrent(request,7,true,'source','destination','30'),false)
})
