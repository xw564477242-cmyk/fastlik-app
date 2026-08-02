import type {WalletAccountRecord} from './walletData'

export type ConsumerTransferDraft={
 sourceAccountId:string
 destinationAccountId:string
 amount:string
}

export type ConsumerTransferUiRequest={
 generation:number
 sourceAccountId:string
 destinationAccountId:string
 amount:string
}

export function consumerTransferDestinations(
 accounts:readonly WalletAccountRecord[],
 source:WalletAccountRecord|null,
):WalletAccountRecord[]{
 if(!source||source.status!=='ACTIVE')return []
 return accounts.filter(account=>
  account.id!==source.id&&
  account.status==='ACTIVE'&&
  account.assetCode===source.assetCode
 )
}

export function createConsumerTransferUiRequest(
 generation:number,
 draft:ConsumerTransferDraft,
):ConsumerTransferUiRequest{
 if(!Number.isSafeInteger(generation)||generation<0)throw new Error('Invalid consumer transfer generation')
 return Object.freeze({generation,...draft})
}

export function consumerTransferUiRequestIsCurrent(
 request:ConsumerTransferUiRequest,
 currentGeneration:number,
 mounted:boolean,
 sourceAccountId:string|null,
 destinationAccountId:string,
 amount:string,
):boolean{
 return mounted&&
  request.generation===currentGeneration&&
  request.sourceAccountId===sourceAccountId&&
  request.destinationAccountId===destinationAccountId.trim()&&
  request.amount===amount
}
