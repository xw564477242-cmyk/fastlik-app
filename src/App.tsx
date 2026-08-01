import {FormEvent,useEffect,useRef,useState} from 'react'
import {ArrowRightLeft,CreditCard,Landmark,LogOut,RefreshCw,ShieldCheck,Snowflake,WalletCards} from 'lucide-react'
import {CardBalanceRecord,CardLimitsRecord,CardReplacementInput,CardReplacementReason,WalletAccountRecord,WalletBalanceRecord,WalletBalanceSummary,walletApi,walletRuntime,WalletApiError,WalletCredentials,WalletOperationPage,WalletOperationRecord,WalletSession,WalletTransactionPage,WalletTransactionRecord,WalletTransferReceipt} from './apiClient'
import {cardDetailRefreshCanRetainSnapshot,cardDetailRefreshRequestIsCurrent,cardDetailRefreshRequestWasAborted,createCardDetailRefreshRequestIdentity,readCardDetailRefresh} from './cardDetailRefresh'
import {CARD_LIMIT_UPDATE_FIELDS,CARD_LIMIT_UPDATE_MAX_MINOR,beginCardLimitsUpdate,cardLimitsUpdateDecision,cardLimitsUpdateDraft,cardLimitsUpdateInputFromDraft,cardLimitsUpdateRequestIsCurrent,createCardLimitsUpdateRequestIdentity,settleCardLimitsUpdate,type CardLimitUpdateField,type CardLimitsUpdateDraft} from './cardLimitsUpdate'
import {beginCardStatusAction,cardStatusDecision,cardStatusRequestIsCurrent,createCardStatusRequestIdentity,settleCardStatusAction} from './cardStatusAction'
import {CardRecord,cardRequestIsCurrent,mergeCardPages} from './cardList'
import {CARD_TRANSACTION_FILTERS,CardTransactionFilter,CardTransactionRecord,cardTransactionLifecycleType,parseCardTransactionFilter} from './cardTransactions'
import {CardTransactionDetailSelection,createCardTransactionDetailSelection,reconcileCardTransactionDetailSelection} from './cardTransactionDetail'
import {cardTransactionDetailRefreshRequestIsCurrent,cardTransactionDetailRefreshWasAborted,createCardTransactionDetailRefreshRequestIdentity} from './cardTransactionDetailRefresh'
import {CardTransactionHistoryState,cardTransactionHistoryRequestIsCurrent,commitCardTransactionHistoryPage,createCardTransactionHistoryRequestIdentity} from './cardTransactionHistory'
import {CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS,cardTransactionRefreshAllowed,cardTransactionRefreshRequestIsCurrent,commitCardTransactionRefreshPage,createCardTransactionRefreshRequestIdentity} from './cardTransactionRefresh'
import {WALLET_TRANSFER_STATUS_REFRESH_LIMIT,walletRequestIsCurrent,walletTransferStatusRequestIsCurrent} from './walletData'
import {DEFAULT_WALLET_OPERATION_FILTERS,WALLET_OPERATION_STATUSES,WALLET_OPERATION_TYPES,appendWalletOperationPage,createWalletOperationActivityRequestIdentity,createWalletOperationDetailRequestIdentity,walletOperationActivityRequestIsCurrent,walletOperationDetailRequestIsCurrent,walletOperationFilterKey,walletOperationRequestWasAborted,type WalletOperationFilterSelection} from './walletOperations'
import {parseVirtualCardCreateInput,virtualCardCreateDecision,virtualCardCreateRequestIsCurrent} from './virtualCardCreate'
import type {VirtualCardCreateInput} from './virtualCardCreate'
import {CARD_REPLACEMENT_REASONS,beginCardReplacement,captureCardReplacementVersion,cardReplacementDecision,cardReplacementRequestIsCurrent,cardReplacementVersionMatches,createCardReplacementCommit,createCardReplacementRequestIdentity,parseCardReplacementInput,settleCardReplacement} from './cardReplacement'
import {beginCardRenewal,captureCardRenewalVersion,cardRenewalDecision,cardRenewalRequestIsCurrent,cardRenewalVersionMatches,createCardRenewalCommit,createCardRenewalRequestIdentity,settleCardRenewal} from './cardRenewal'
import {captureWalletAccountsVersion,walletBalanceSummaryRequestIsCurrent} from './walletBalanceSummary'
import {beginWalletTransferSubmit,createWalletTransferRequestIdentity,normalizeWalletTransferInput,settleWalletTransferSubmit,walletTransferRequestIsCurrent,walletTransferSessionScope} from './walletTransfer'
import {WALLET_TRANSACTION_STATUSES,WALLET_TRANSACTION_TYPES,createWalletTransactionDetailRequestIdentity,createWalletTransactionHistoryRequestIdentity,normalizeWalletTransactionFilterSelection,walletTransactionDetailRefreshAllowed,walletTransactionDetailRequestIsCurrent,walletTransactionFilterKey,walletTransactionFilterRequestAllowed,walletTransactionFiltersForSelectedAsset,walletTransactionHistoryRequestIsCurrent,walletTransactionRequestWasAborted,type WalletTransactionFilterSelection} from './walletTransactions'

const sessionScope=(session:WalletSession)=>walletTransferSessionScope(session,walletRuntime.environment)??JSON.stringify([session.actorId,session.tenantId,session.customerId,session.environment,session.expiresAt??null])

export default function App(){
 const[mode,setMode]=useState<'login'|'register'>('login')
 const[tenantId,setTenantId]=useState('')
 const[email,setEmail]=useState('')
 const[password,setPassword]=useState('')
 const[session,setSession]=useState<WalletSession|null>(null)
 const[accounts,setAccounts]=useState<WalletAccountRecord[]>([])
 const[selectedAccount,setSelectedAccount]=useState<WalletAccountRecord|null>(null)
 const[walletBalanceSummary,setWalletBalanceSummary]=useState<WalletBalanceSummary|null>(null)
 const[walletBalanceSummaryLoading,setWalletBalanceSummaryLoading]=useState(false)
 const[walletBalanceSummaryError,setWalletBalanceSummaryError]=useState('')
 const[accountBalance,setAccountBalance]=useState<WalletBalanceRecord|null>(null)
 const[walletTransactions,setWalletTransactions]=useState<WalletTransactionPage|null>(null)
 const[walletOperations,setWalletOperations]=useState<WalletOperationPage|null>(null)
 const[walletOperationsLoading,setWalletOperationsLoading]=useState(false)
 const[walletOperationsLoadingMore,setWalletOperationsLoadingMore]=useState(false)
 const[walletOperationsRefreshing,setWalletOperationsRefreshing]=useState(false)
 const[walletOperationsError,setWalletOperationsError]=useState('')
 const[walletOperationTypeFilter,setWalletOperationTypeFilter]=useState<WalletOperationFilterSelection['type']>('ALL')
 const[walletOperationStatusFilter,setWalletOperationStatusFilter]=useState<WalletOperationFilterSelection['status']>('ALL')
 const[selectedWalletOperation,setSelectedWalletOperation]=useState<WalletOperationRecord|null>(null)
 const[walletOperationDetail,setWalletOperationDetail]=useState<WalletOperationRecord|null>(null)
 const[walletOperationDetailLoading,setWalletOperationDetailLoading]=useState(false)
 const[walletOperationDetailError,setWalletOperationDetailError]=useState('')
 const[walletLoading,setWalletLoading]=useState(false)
 const[walletHistoryLoading,setWalletHistoryLoading]=useState(false)
 const[walletTransactionLoadingMore,setWalletTransactionLoadingMore]=useState(false)
 const[walletError,setWalletError]=useState('')
 const[walletHistoryError,setWalletHistoryError]=useState('')
 const[walletTransactionTypeFilter,setWalletTransactionTypeFilter]=useState<WalletTransactionFilterSelection['type']>('ALL')
 const[walletTransactionStatusFilter,setWalletTransactionStatusFilter]=useState<WalletTransactionFilterSelection['status']>('ALL')
 const[selectedWalletTransaction,setSelectedWalletTransaction]=useState<WalletTransactionRecord|null>(null)
 const[walletTransactionDetail,setWalletTransactionDetail]=useState<WalletTransactionRecord|null>(null)
 const[walletTransactionDetailLoading,setWalletTransactionDetailLoading]=useState(false)
 const[walletTransactionDetailError,setWalletTransactionDetailError]=useState('')
 const[transferBusy,setTransferBusy]=useState(false)
 const[transferReceipt,setTransferReceipt]=useState<WalletTransferReceipt|null>(null)
 const[transferStatusBusy,setTransferStatusBusy]=useState(false)
 const[transferStatusRefreshCount,setTransferStatusRefreshCount]=useState(0)
 const[destinationAccountId,setDestinationAccountId]=useState('')
 const[transferAmount,setTransferAmount]=useState('')
 const[cards,setCards]=useState<CardRecord[]>([])
 const[cardNextCursor,setCardNextCursor]=useState<string|null>(null)
 const[cardListLoadingMore,setCardListLoadingMore]=useState(false)
 const[cardListError,setCardListError]=useState('')
 const[cardRefreshError,setCardRefreshError]=useState('')
 const[selectedCard,setSelectedCardState]=useState<CardRecord|null>(null)
 const[cardBalance,setCardBalance]=useState<CardBalanceRecord|null>(null)
 const[cardBalanceLoading,setCardBalanceLoading]=useState(false)
 const[cardBalanceError,setCardBalanceError]=useState('')
 const[cardLimits,setCardLimits]=useState<CardLimitsRecord|null>(null)
 const[cardLimitsLoading,setCardLimitsLoading]=useState(false)
 const[cardLimitsError,setCardLimitsError]=useState('')
 const[cardLimitsUpdateDraftState,setCardLimitsUpdateDraftState]=useState<CardLimitsUpdateDraft>({singleTransactionMinor:'',dailySpendMinor:'',monthlySpendMinor:'',dailyAtmMinor:''})
 const[cardLimitsUpdating,setCardLimitsUpdating]=useState(false)
 const[cardLimitsUpdateError,setCardLimitsUpdateError]=useState('')
 const[cardTransactions,setCardTransactions]=useState<CardTransactionRecord[]>([])
 const[selectedCardTransactionDetail,setSelectedCardTransactionDetailState]=useState<CardTransactionDetailSelection|null>(null)
 const[cardTransactionDetailRefreshing,setCardTransactionDetailRefreshing]=useState(false)
 const[cardTransactionDetailError,setCardTransactionDetailError]=useState('')
 const[cardTransactionFilter,setCardTransactionFilterState]=useState<CardTransactionFilter>('ALL')
 const[cardTransactionNextCursor,setCardTransactionNextCursor]=useState<string|null>(null)
 const[cardTransactionLoadingMore,setCardTransactionLoadingMore]=useState(false)
 const[cardTransactionRefreshing,setCardTransactionRefreshing]=useState(false)
 const[cardTransactionRefreshAttempt,setCardTransactionRefreshAttempt]=useState(0)
 const[cardTransactionError,setCardTransactionError]=useState('')
 const[virtualCardCurrency,setVirtualCardCurrency]=useState('USD')
 const[virtualCardAlias,setVirtualCardAlias]=useState('')
 const[virtualCardCreating,setVirtualCardCreating]=useState(false)
 const[virtualCardCreateError,setVirtualCardCreateError]=useState('')
 const[cardReplacementReason,setCardReplacementReasonState]=useState<CardReplacementReason>('LOST')
 const[cardReplacing,setCardReplacing]=useState(false)
 const[cardReplacementError,setCardReplacementError]=useState('')
 const[cardRenewing,setCardRenewing]=useState(false)
 const[cardRenewalError,setCardRenewalError]=useState('')
 const[busy,setBusy]=useState(true)
 const[error,setError]=useState('')
 const cardRequestSequence=useRef(0)
 const cardScope=useRef<string|null>(null)
 const cardDetailRequestSequence=useRef(0)
 const cardDetailTarget=useRef<string|null>(null)
 const cardDetailAbortController=useRef<AbortController|null>(null)
 const cardSnapshotTarget=useRef<string|null>(null)
 const cardBalanceRequestSequence=useRef(0)
 const cardBalanceTarget=useRef<string|null>(null)
 const cardLimitsRequestSequence=useRef(0)
 const cardLimitsTarget=useRef<string|null>(null)
 const cardLimitsRef=useRef<CardLimitsRecord|null>(null)
 const cardLimitsUpdateDraftRef=useRef<CardLimitsUpdateDraft>({singleTransactionMinor:'',dailySpendMinor:'',monthlySpendMinor:'',dailyAtmMinor:''})
 const cardLimitsUpdateRequestSequence=useRef(0)
 const cardLimitsUpdateSubmitGate=useRef<{activeRequestId:number|null}>({activeRequestId:null})
 const cardLimitsUpdateInFlight=useRef(false)
 const cardActionRequestSequence=useRef(0)
 const cardActionTarget=useRef<string|null>(null)
 const cardStatusSubmitGate=useRef<{activeRequestId:number|null}>({activeRequestId:null})
 const cardStatusInFlight=useRef(false)
 const cardTransactionRequestSequence=useRef(0)
 const cardTransactionTarget=useRef<string|null>(null)
 const cardTransactionFilterRef=useRef<CardTransactionFilter>('ALL')
 const cardTransactionCursorTarget=useRef<string|null>(null)
 const cardTransactionAbortController=useRef<AbortController|null>(null)
 const cardTransactionHistoryRef=useRef<CardTransactionHistoryState|null>(null)
 const cardTransactionRefreshAttemptRef=useRef(0)
 const cardTransactionsRef=useRef<CardTransactionRecord[]>([])
 const selectedCardTransactionDetailRef=useRef<CardTransactionDetailSelection|null>(null)
 const cardTransactionDetailRequestSequence=useRef(0)
 const cardTransactionDetailAbortController=useRef<AbortController|null>(null)
 const virtualCardCreateRequestSequence=useRef(0)
 const virtualCardCreateInFlight=useRef(false)
 const cardReplacementRequestSequence=useRef(0)
 const cardReplacementTarget=useRef<string|null>(null)
 const cardReplacementSubmitGate=useRef<{activeRequestId:number|null}>({activeRequestId:null})
 const cardReplacementInFlight=useRef(false)
 const cardReplacementReasonRef=useRef<CardReplacementReason>('LOST')
 const cardRenewalRequestSequence=useRef(0)
 const cardRenewalTarget=useRef<string|null>(null)
 const cardRenewalSubmitGate=useRef<{activeRequestId:number|null}>({activeRequestId:null})
 const cardRenewalInFlight=useRef(false)
 const selectedCardRef=useRef<CardRecord|null>(null)
 const cardsRef=useRef<CardRecord[]>([])
 const walletScope=useRef<string|null>(null)
 const accountsRef=useRef<WalletAccountRecord[]>([])
 const selectedAccountRef=useRef<WalletAccountRecord|null>(null)
 const walletBalanceSummaryRequestSequence=useRef(0)
 const walletOperationRequestSequence=useRef(0)
 const walletOperationCursorTarget=useRef<string|null>(null)
 const walletOperationTypeFilterTarget=useRef<WalletOperationFilterSelection['type']>('ALL')
 const walletOperationStatusFilterTarget=useRef<WalletOperationFilterSelection['status']>('ALL')
 const walletOperationsRef=useRef<WalletOperationPage|null>(null)
 const walletOperationAbortController=useRef<AbortController|null>(null)
 const walletOperationInFlight=useRef(false)
 const walletOperationDetailRequestSequence=useRef(0)
 const walletOperationDetailTarget=useRef<string|null>(null)
 const walletOperationDetailAbortController=useRef<AbortController|null>(null)
 const walletListRequestSequence=useRef(0)
 const walletAccountRequestSequence=useRef(0)
 const walletAccountTarget=useRef<string|null>(null)
 const walletHistoryRequestSequence=useRef(0)
 const walletHistoryAssetTarget=useRef<string|null>(null)
 const walletHistoryFilterTarget=useRef<string|null>(null)
 const walletHistoryCursorTarget=useRef<string|null>(null)
 const walletHistoryInFlight=useRef(false)
 const walletTransactionsRef=useRef<WalletTransactionPage|null>(null)
 const walletHistoryAbortController=useRef<AbortController|null>(null)
 const walletTransactionTypeFilterTarget=useRef<WalletTransactionFilterSelection['type']>('ALL')
 const walletTransactionStatusFilterTarget=useRef<WalletTransactionFilterSelection['status']>('ALL')
 const walletTransactionDetailRequestSequence=useRef(0)
 const walletTransactionDetailAssetTarget=useRef<string|null>(null)
 const walletTransactionDetailTarget=useRef<string|null>(null)
 const walletTransactionDetailAbortController=useRef<AbortController|null>(null)
 const selectedWalletTransactionRef=useRef<WalletTransactionRecord|null>(null)
 const walletRequestMounted=useRef(true)
 const walletTransferRequestSequence=useRef(0)
 const walletTransferTarget=useRef<string|null>(null)
 const walletTransferStatusRequestSequence=useRef(0)
 const walletTransferStatusTarget=useRef<string|null>(null)
 const walletTransferSubmitGate=useRef<{activeRequestId:number|null}>({activeRequestId:null})
 const walletTransferStatusInFlight=useRef(false)
 const describe=(value:unknown)=>value instanceof WalletApiError?`${value.message}`:value instanceof Error?value.message:'Unknown API error'
 const describeCardBalance=(value:unknown)=>value instanceof WalletApiError?`Card balance unavailable for this session · Trace ${value.traceId}`:'Card balance unavailable for this session'
 const describeCardLimits=(value:unknown)=>value instanceof WalletApiError?`Card limits unavailable for this session · Trace ${value.traceId}`:'Card limits unavailable for this session'
 const describeCardLimitsUpdate=(value:unknown)=>value instanceof WalletApiError?`Card limits update unavailable for this session · Trace ${value.traceId}`:'Card limits update unavailable for this session'
 const describeWalletTransactionDetail=(value:unknown)=>value instanceof WalletApiError?`Transaction detail unavailable for this session · Trace ${value.traceId}`:'Transaction detail unavailable for this session'
 const describeWalletOperations=(value:unknown)=>value instanceof WalletApiError?`Wallet activity unavailable for this session · Trace ${value.traceId}`:'Wallet activity unavailable for this session'
 const describeWalletOperationDetail=(value:unknown)=>value instanceof WalletApiError?`Wallet operation detail unavailable for this session · Trace ${value.traceId}`:'Wallet operation detail unavailable for this session'
 const describeWalletBalanceSummary=(value:unknown)=>value instanceof WalletApiError?`Wallet balance summary unavailable for this session · Trace ${value.traceId}`:'Wallet balance summary unavailable for this session'
 const describeVirtualCardCreate=(value:unknown)=>value instanceof WalletApiError?`Virtual card creation unavailable for this session · Trace ${value.traceId}`:'Virtual card creation unavailable for this session'
 const describeCardReplacement=(value:unknown)=>value instanceof WalletApiError?`Card replacement unavailable for this session · Trace ${value.traceId}`:'Card replacement unavailable for this session'
 const describeCardRenewal=(value:unknown)=>value instanceof WalletApiError?`Card renewal unavailable for this session · Trace ${value.traceId}`:'Card renewal unavailable for this session'
 const describeWalletTransfer=()=>`Wallet transfer unavailable for this session`
 const describeWalletHistory=()=>`Wallet transaction history unavailable for this session`
 const describeCardTransactionDetail=()=>`Card transaction detail unavailable for this session`
 const abortWalletOperationRequest=()=>{walletOperationAbortController.current?.abort();walletOperationAbortController.current=null}
 const abortWalletOperationDetailRequest=()=>{walletOperationDetailAbortController.current?.abort();walletOperationDetailAbortController.current=null}
 const abortWalletHistoryRequest=()=>{walletHistoryAbortController.current?.abort();walletHistoryAbortController.current=null}
 const abortWalletTransactionDetailRequest=()=>{walletTransactionDetailAbortController.current?.abort();walletTransactionDetailAbortController.current=null}
 const abortCardDetailRequest=()=>{cardDetailAbortController.current?.abort();cardDetailAbortController.current=null}
 const abortCardTransactionRequest=()=>{cardTransactionAbortController.current?.abort();cardTransactionAbortController.current=null}
 const abortCardTransactionDetailRequest=()=>{cardTransactionDetailAbortController.current?.abort();cardTransactionDetailAbortController.current=null}
 const resetWalletOperationFilters=()=>{walletOperationTypeFilterTarget.current=DEFAULT_WALLET_OPERATION_FILTERS.type;walletOperationStatusFilterTarget.current=DEFAULT_WALLET_OPERATION_FILTERS.status;setWalletOperationTypeFilter(DEFAULT_WALLET_OPERATION_FILTERS.type);setWalletOperationStatusFilter(DEFAULT_WALLET_OPERATION_FILTERS.status)}
 const resetWalletTransactionFilters=()=>{walletTransactionTypeFilterTarget.current='ALL';walletTransactionStatusFilterTarget.current='ALL';setWalletTransactionTypeFilter('ALL');setWalletTransactionStatusFilter('ALL')}
 const clearCardStatusAction=()=>{const wasActive=cardStatusInFlight.current;cardActionRequestSequence.current+=1;cardActionTarget.current=null;cardStatusSubmitGate.current.activeRequestId=null;cardStatusInFlight.current=false;if(wasActive)setBusy(false)}
 const invalidateCardDetail=()=>{abortCardDetailRequest();abortCardTransactionRequest();abortCardTransactionDetailRequest();cardDetailRequestSequence.current+=1;cardDetailTarget.current=null;cardSnapshotTarget.current=null;cardBalanceRequestSequence.current+=1;cardBalanceTarget.current=null;cardLimitsRequestSequence.current+=1;cardLimitsTarget.current=null;cardLimitsUpdateRequestSequence.current+=1;cardLimitsUpdateSubmitGate.current.activeRequestId=null;cardLimitsUpdateInFlight.current=false;clearCardStatusAction();cardTransactionRequestSequence.current+=1;cardTransactionTarget.current=null;cardTransactionCursorTarget.current=null;cardTransactionDetailRequestSequence.current+=1}
 const clearCardBalance=()=>{cardBalanceRequestSequence.current+=1;cardBalanceTarget.current=null;setCardBalance(null);setCardBalanceLoading(false);setCardBalanceError('')}
 const clearCardLimitsUpdate=()=>{cardLimitsUpdateRequestSequence.current+=1;cardLimitsUpdateSubmitGate.current.activeRequestId=null;cardLimitsUpdateInFlight.current=false;setCardLimitsUpdating(false);setCardLimitsUpdateError('')}
 const replaceCardLimits=(limits:CardLimitsRecord|null)=>{cardLimitsRef.current=limits;setCardLimits(limits);const draft:CardLimitsUpdateDraft=limits?cardLimitsUpdateDraft(limits):{singleTransactionMinor:'',dailySpendMinor:'',monthlySpendMinor:'',dailyAtmMinor:''};cardLimitsUpdateDraftRef.current=draft;setCardLimitsUpdateDraftState(draft)}
 const clearCardLimits=()=>{cardLimitsRequestSequence.current+=1;cardLimitsTarget.current=null;clearCardLimitsUpdate();replaceCardLimits(null);setCardLimitsLoading(false);setCardLimitsError('')}
 const replaceSelectedCardTransactionDetail=(selection:CardTransactionDetailSelection|null)=>{selectedCardTransactionDetailRef.current=selection;setSelectedCardTransactionDetailState(selection)}
 const invalidateCardTransactionDetailRefresh=()=>{abortCardTransactionDetailRequest();cardTransactionDetailRequestSequence.current+=1;setCardTransactionDetailRefreshing(false);setCardTransactionDetailError('')}
 const replaceCardTransactionHistory=(history:CardTransactionHistoryState|null)=>{invalidateCardTransactionDetailRefresh();cardTransactionHistoryRef.current=history;const next=history?[...history.transactions]:[];cardTransactionsRef.current=next;setCardTransactions(next);setCardTransactionNextCursor(history?.nextCursor??null);replaceSelectedCardTransactionDetail(reconcileCardTransactionDetailSelection(selectedCardTransactionDetailRef.current,cardScope.current,selectedCardRef.current?.id??null,next,walletRequestMounted.current))}
 const resetCardTransactionRefresh=()=>{cardTransactionRefreshAttemptRef.current=0;setCardTransactionRefreshAttempt(0);setCardTransactionRefreshing(false)}
 const clearCardTransactions=()=>{abortCardTransactionRequest();cardTransactionRequestSequence.current+=1;cardTransactionTarget.current=null;cardTransactionCursorTarget.current=null;replaceCardTransactionHistory(null);setCardTransactionLoadingMore(false);resetCardTransactionRefresh();setCardTransactionError('')}
 const resetCardTransactionFilter=()=>{cardTransactionFilterRef.current='ALL';setCardTransactionFilterState('ALL')}
 const clearVirtualCardCreate=()=>{virtualCardCreateRequestSequence.current+=1;virtualCardCreateInFlight.current=false;setVirtualCardCreating(false);setVirtualCardCreateError('');setVirtualCardCurrency('USD');setVirtualCardAlias('')}
 const clearCardReplacement=()=>{cardReplacementRequestSequence.current+=1;cardReplacementTarget.current=null;cardReplacementSubmitGate.current.activeRequestId=null;cardReplacementInFlight.current=false;cardReplacementReasonRef.current='LOST';setCardReplacing(false);setCardReplacementError('');setCardReplacementReasonState('LOST')}
 const clearCardRenewal=()=>{cardRenewalRequestSequence.current+=1;cardRenewalTarget.current=null;cardRenewalSubmitGate.current.activeRequestId=null;cardRenewalInFlight.current=false;setCardRenewing(false);setCardRenewalError('')}
 const replaceAccounts=(rows:WalletAccountRecord[])=>{accountsRef.current=rows;setAccounts(rows)}
 const replaceSelectedAccount=(account:WalletAccountRecord|null)=>{selectedAccountRef.current=account;setSelectedAccount(account)}
 const clearWalletBalanceSummary=()=>{walletBalanceSummaryRequestSequence.current+=1;setWalletBalanceSummary(null);setWalletBalanceSummaryLoading(false);setWalletBalanceSummaryError('')}
 const updateCardReplacementReason=(reason:CardReplacementReason)=>{if(cardReplacementInFlight.current&&cardReplacementReasonRef.current!==reason)clearCardReplacement();cardReplacementReasonRef.current=reason;setCardReplacementReasonState(reason)}
 const setSelectedCard=(card:CardRecord|null)=>{const previous=selectedCardRef.current;const versionChanged=Boolean(previous&&!cardReplacementVersionMatches(captureCardReplacementVersion(previous),card));if(cardReplacementInFlight.current&&versionChanged)clearCardReplacement();if(cardRenewalInFlight.current&&previous&&!cardRenewalVersionMatches(captureCardRenewalVersion(previous),card))clearCardRenewal();if(cardLimitsUpdateInFlight.current&&versionChanged)clearCardLimitsUpdate();if(cardStatusInFlight.current&&versionChanged)clearCardStatusAction();selectedCardRef.current=card;setSelectedCardState(card)}
 const invalidateWalletDetail=()=>{abortWalletHistoryRequest();abortWalletTransactionDetailRequest();walletAccountRequestSequence.current+=1;walletAccountTarget.current=null;walletHistoryRequestSequence.current+=1;walletHistoryAssetTarget.current=null;walletHistoryFilterTarget.current=null;walletHistoryCursorTarget.current=null;walletHistoryInFlight.current=false;walletTransactionDetailRequestSequence.current+=1;walletTransactionDetailAssetTarget.current=null;walletTransactionDetailTarget.current=null;walletTransferRequestSequence.current+=1;walletTransferTarget.current=null;walletTransferSubmitGate.current.activeRequestId=null;walletTransferStatusRequestSequence.current+=1;walletTransferStatusTarget.current=null;walletTransferStatusInFlight.current=false;walletBalanceSummaryRequestSequence.current+=1}
 const replaceSelectedWalletTransaction=(transaction:WalletTransactionRecord|null)=>{selectedWalletTransactionRef.current=transaction;setSelectedWalletTransaction(transaction)}
 const resetWalletTransactionDetailRequest=()=>{abortWalletTransactionDetailRequest();walletTransactionDetailRequestSequence.current+=1;walletTransactionDetailAssetTarget.current=null;walletTransactionDetailTarget.current=null;setWalletTransactionDetail(null);setWalletTransactionDetailLoading(false);setWalletTransactionDetailError('')}
 const clearWalletTransactionDetail=()=>{resetWalletTransactionDetailRequest();replaceSelectedWalletTransaction(null)}
 const replaceWalletTransactions=(history:WalletTransactionPage|null)=>{walletTransactionsRef.current=history;setWalletTransactions(history)}
 const clearWalletTransactions=()=>{abortWalletHistoryRequest();walletHistoryRequestSequence.current+=1;walletHistoryAssetTarget.current=null;walletHistoryFilterTarget.current=null;walletHistoryCursorTarget.current=null;walletHistoryInFlight.current=false;replaceWalletTransactions(null);setWalletHistoryLoading(false);setWalletTransactionLoadingMore(false);setWalletHistoryError('');clearWalletTransactionDetail()}
 const clearWalletDetail=()=>{replaceSelectedAccount(null);setAccountBalance(null);setWalletLoading(false);setWalletError('');setTransferBusy(false);setTransferReceipt(null);setTransferStatusBusy(false);setTransferStatusRefreshCount(0);setDestinationAccountId('');setTransferAmount('');clearWalletTransactions();clearWalletBalanceSummary()}
 const replaceWalletOperations=(page:WalletOperationPage|null)=>{walletOperationsRef.current=page;setWalletOperations(page)}
 const clearWalletOperationDetail=()=>{abortWalletOperationDetailRequest();walletOperationDetailRequestSequence.current+=1;walletOperationDetailTarget.current=null;setSelectedWalletOperation(null);setWalletOperationDetail(null);setWalletOperationDetailLoading(false);setWalletOperationDetailError('')}
 const clearWalletOperations=()=>{abortWalletOperationRequest();walletOperationRequestSequence.current+=1;walletOperationCursorTarget.current=null;walletOperationInFlight.current=false;replaceWalletOperations(null);setWalletOperationsLoading(false);setWalletOperationsLoadingMore(false);setWalletOperationsRefreshing(false);setWalletOperationsError('');clearWalletOperationDetail()}
 const clear=()=>{cardRequestSequence.current+=1;cardScope.current=null;invalidateCardDetail();clearVirtualCardCreate();clearCardReplacement();clearCardRenewal();walletListRequestSequence.current+=1;walletScope.current=null;invalidateWalletDetail();clearWalletOperations();resetWalletOperationFilters();setSession(null);replaceAccounts([]);clearWalletDetail();resetWalletTransactionFilters();resetCardTransactionFilter();setCards([]);setCardNextCursor(null);setCardListLoadingMore(false);setCardListError('');setSelectedCard(null);clearCardBalance();clearCardLimits();clearCardTransactions()}
 const loadWalletOperations=async(expectedScope=walletScope.current,activeSession=session,filters:WalletOperationFilterSelection={type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current})=>{if(!activeSession||!expectedScope||walletOperationInFlight.current||walletTransferSessionScope(activeSession,walletRuntime.environment)!==expectedScope||expectedScope!==walletScope.current||walletOperationFilterKey(filters)!==walletOperationFilterKey({type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current}))return;abortWalletOperationRequest();const snapshot=walletOperationsRef.current;let expectedPage=snapshot;const controller=new AbortController();walletOperationAbortController.current=controller;walletOperationInFlight.current=true;const request=createWalletOperationActivityRequestIdentity(++walletOperationRequestSequence.current,expectedScope,filters,null);walletOperationCursorTarget.current=null;const isCurrent=()=>walletOperationAbortController.current===controller&&walletTransferSessionScope(activeSession,walletRuntime.environment)===expectedScope&&walletOperationsRef.current===expectedPage&&walletOperationActivityRequestIsCurrent(request,walletOperationRequestSequence.current,walletScope.current,walletOperationFilterKey({type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current}),walletOperationCursorTarget.current,walletRequestMounted.current);clearWalletOperationDetail();setWalletOperationsLoading(snapshot===null);setWalletOperationsRefreshing(snapshot!==null);setWalletOperationsLoadingMore(false);setWalletOperationsError('');try{const page=await walletApi.walletOperations(activeSession,expectedScope,filters,undefined,controller.signal);if(isCurrent()){expectedPage=page;replaceWalletOperations(page)}}catch(value){if(isCurrent()&&!walletOperationRequestWasAborted(value))setWalletOperationsError(describeWalletOperations(value))}finally{if(isCurrent()){walletOperationAbortController.current=null;walletOperationInFlight.current=false;setWalletOperationsLoading(false);setWalletOperationsRefreshing(false)}}}
 const loadWalletBalanceSummary=async(rows:WalletAccountRecord[],account:WalletAccountRecord|null,sessionEnvironment:WalletSession['environment'],expectedScope=walletScope.current)=>{const request={requestId:++walletBalanceSummaryRequestSequence.current,scopeKey:expectedScope,accountId:account?.id??null,accountsVersion:captureWalletAccountsVersion(rows)};const isCurrent=()=>walletBalanceSummaryRequestIsCurrent(request,walletBalanceSummaryRequestSequence.current,walletScope.current,accountsRef.current,selectedAccountRef.current);setWalletBalanceSummary(null);setWalletBalanceSummaryLoading(true);setWalletBalanceSummaryError('');try{const summary=await walletApi.walletBalanceSummary(sessionEnvironment);if(isCurrent())setWalletBalanceSummary(summary)}catch(value){if(isCurrent())setWalletBalanceSummaryError(describeWalletBalanceSummary(value))}finally{if(isCurrent())setWalletBalanceSummaryLoading(false)}}
 const loadWalletTransactionHistory=async(account:WalletAccountRecord,expectedScope:string,activeSession:WalletSession,selection:WalletTransactionFilterSelection={type:walletTransactionTypeFilterTarget.current,status:walletTransactionStatusFilterTarget.current})=>{let filters;try{filters=walletTransactionFiltersForSelectedAsset(selection,account.assetCode)}catch{clearWalletTransactions();setWalletHistoryError(describeWalletHistory());return}const ownsAccount=accountsRef.current.some(row=>row.id===account.id&&row.assetCode===account.assetCode);if(!walletRequestMounted.current||!ownsAccount||walletTransferSessionScope(activeSession,walletRuntime.environment)!==expectedScope||walletScope.current!==expectedScope||selectedAccountRef.current?.id!==account.id||selectedAccountRef.current.assetCode!==account.assetCode){clearWalletTransactions();if(walletRequestMounted.current)setWalletHistoryError(describeWalletHistory());return}clearWalletTransactions();const filterKey=walletTransactionFilterKey(filters);const historyRequest=createWalletTransactionHistoryRequestIdentity(++walletHistoryRequestSequence.current,expectedScope,filters,null);const historyController=new AbortController();walletHistoryAbortController.current=historyController;walletHistoryAssetTarget.current=account.assetCode;walletHistoryFilterTarget.current=filterKey;walletHistoryCursorTarget.current=null;walletHistoryInFlight.current=true;const isCurrent=()=>walletRequestMounted.current&&walletHistoryAbortController.current===historyController&&walletTransferSessionScope(activeSession,walletRuntime.environment)===expectedScope&&walletTransactionHistoryRequestIsCurrent(historyRequest,walletHistoryRequestSequence.current,walletScope.current,walletHistoryFilterTarget.current,walletHistoryCursorTarget.current)&&accountsRef.current.some(row=>row.id===account.id&&row.assetCode===account.assetCode)&&selectedAccountRef.current?.id===account.id&&selectedAccountRef.current.assetCode===account.assetCode;setWalletHistoryLoading(true);setWalletTransactionLoadingMore(false);setWalletHistoryError('');try{const history=await walletApi.walletTransactions(activeSession,filters,null,historyController.signal);if(!isCurrent())return;replaceWalletTransactions(history);walletHistoryCursorTarget.current=history.nextCursor}catch(value){if(isCurrent()&&!walletTransactionRequestWasAborted(value)){replaceWalletTransactions(null);setWalletHistoryError(describeWalletHistory())}}finally{if(isCurrent()){walletHistoryAbortController.current=null;walletHistoryInFlight.current=false;setWalletHistoryLoading(false)}}}
 const loadWallet=async(account:WalletAccountRecord,expectedScope:string|null,activeSession:WalletSession)=>{replaceSelectedAccount(account);setAccountBalance(null);const request={requestId:++walletAccountRequestSequence.current,scopeKey:expectedScope,accountId:account.id};walletAccountTarget.current=account.id;const isCurrent=()=>walletRequestMounted.current&&walletRequestIsCurrent(request,walletAccountRequestSequence.current,walletScope.current,walletAccountTarget.current);setWalletLoading(true);setWalletError('');const historyPromise=expectedScope?loadWalletTransactionHistory(account,expectedScope,activeSession):Promise.resolve();const[balanceResult]=await Promise.all([walletApi.walletBalance(account.id).then(balance=>({balance,error:null})).catch(error=>({balance:null,error})),historyPromise]);if(isCurrent()){if(balanceResult.balance)setAccountBalance(balanceResult.balance);else{setAccountBalance(null);setWalletError(describe(balanceResult.error))}setWalletLoading(false)}}
 const loadCard=async(card:CardRecord,expectedScope=cardScope.current,callbacks?:{onError?:(value:unknown)=>void;onSettled?:()=>void})=>{
  abortCardDetailRequest()
  abortCardTransactionRequest()
  setCardTransactionLoadingMore(false)
  resetCardTransactionRefresh()
  cardActionRequestSequence.current+=1
  cardActionTarget.current=null
  clearCardLimitsUpdate()
  if(!expectedScope){
   const publicError=new Error('Card refresh unavailable for this session')
   callbacks?.onSettled?.()
   if(callbacks?.onError)callbacks.onError(publicError)
   else throw publicError
   return
  }
  if(!cardDetailRefreshCanRetainSnapshot(cardSnapshotTarget.current,card.id)){
   cardSnapshotTarget.current=null
   clearCardBalance()
   clearCardLimits()
   clearCardTransactions()
  }
  setCardRefreshError('')
  const request=createCardDetailRefreshRequestIdentity(++cardDetailRequestSequence.current,expectedScope,card.id)
  const transactionFilter=cardTransactionFilterRef.current
  const transactionRequest=createCardTransactionHistoryRequestIdentity(++cardTransactionRequestSequence.current,expectedScope,card.id,transactionFilter,null)
  cardDetailTarget.current=card.id
  cardBalanceRequestSequence.current+=1
  cardBalanceTarget.current=card.id
  cardLimitsRequestSequence.current+=1
  cardLimitsTarget.current=card.id
  cardTransactionTarget.current=card.id
  cardTransactionCursorTarget.current=null
  const detailController=new AbortController()
  cardDetailAbortController.current=detailController
  const isCurrent=()=>cardDetailAbortController.current===detailController&&cardDetailRefreshRequestIsCurrent(request,cardDetailRequestSequence.current,cardScope.current,selectedCardRef.current?.id??null,walletRequestMounted.current)&&cardDetailTarget.current===card.id&&cardBalanceTarget.current===card.id&&cardLimitsTarget.current===card.id&&cardTransactionTarget.current===card.id&&cardTransactionHistoryRequestIsCurrent(transactionRequest,cardTransactionRequestSequence.current,cardScope.current,selectedCardRef.current?.id??null,cardTransactionFilterRef.current,cardTransactionCursorTarget.current,walletRequestMounted.current)
  setCardBalanceLoading(true)
  setCardBalanceError('')
  setCardLimitsLoading(true)
  setCardLimitsError('')
  setCardTransactionError('')
  try{
   const snapshot=await readCardDetailRefresh({
    card:(id,signal)=>walletApi.card(id,signal),
    balance:(id,signal)=>walletApi.balance(id,signal),
    limits:(id,signal)=>walletApi.limits(id,signal),
    transactions:(id,signal)=>walletApi.transactions(id,{filter:transactionFilter},signal),
   },card.id,detailController.signal)
   if(!isCurrent())return
   setSelectedCard(snapshot.card)
   setCards(current=>current.map(row=>row.id===snapshot.card.id?snapshot.card:row))
   setCardBalance(snapshot.balance)
   replaceCardLimits(snapshot.limits)
   replaceCardTransactionHistory(commitCardTransactionHistoryPage(null,transactionRequest,snapshot.transactions))
   cardSnapshotTarget.current=card.id
  }catch(value){
   if(!isCurrent())return
   if(cardDetailRefreshRequestWasAborted(value))return
   detailController.abort()
   const publicError=new Error('Card refresh unavailable for this session')
   if(callbacks?.onError)callbacks.onError(publicError)
   else throw publicError
  }finally{
   if(isCurrent()){
    cardDetailAbortController.current=null
    setCardBalanceLoading(false)
    setCardLimitsLoading(false)
    callbacks?.onSettled?.()
   }
  }
 }
 const acceptSession=async(current:WalletSession)=>{if(current.environment!==walletRuntime.environment)throw new Error(`Build environment ${walletRuntime.environment} does not match session ${current.environment}`);const scope=walletTransferSessionScope(current,walletRuntime.environment);if(!scope)throw new Error('Session is expired or unavailable for this non-production Wallet');cardScope.current=scope;walletScope.current=scope;invalidateCardDetail();clearVirtualCardCreate();clearCardReplacement();clearCardRenewal();invalidateWalletDetail();clearWalletOperations();const cardRequestId=++cardRequestSequence.current;const walletListRequestId=++walletListRequestSequence.current;resetCardTransactionFilter();setCards([]);setCardNextCursor(null);setCardListError('');setSelectedCard(null);clearCardBalance();clearCardLimits();clearCardTransactions();replaceAccounts([]);clearWalletDetail();const[cardPage,accountRows]=await Promise.all([walletApi.cards(),walletApi.walletAccounts(current)]);if(!walletTransferSessionScope(current,walletRuntime.environment)||cardScope.current!==scope||cardRequestSequence.current!==cardRequestId||walletScope.current!==scope||walletListRequestSequence.current!==walletListRequestId)return;setSession(current);setCards(cardPage.cards);setCardNextCursor(cardPage.nextCursor);replaceAccounts(accountRows);const card=cardPage.cards[0]||null;const account=accountRows[0]||null;setSelectedCard(card);replaceSelectedAccount(account);await Promise.all([card?loadCard(card,scope):Promise.resolve(),account?loadWallet(account,scope,current):Promise.resolve(),loadWalletBalanceSummary(accountRows,account,current.environment,scope),loadWalletOperations(scope,current,{type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current})])}
 const loadMoreCards=async()=>{if(!session||!cardNextCursor||cardListLoadingMore)return;const scope=sessionScope(session);if(scope!==cardScope.current)return;const cursor=cardNextCursor;const requestId=++cardRequestSequence.current;setCardListLoadingMore(true);setCardListError('');try{const page=await walletApi.cards(cursor);if(cardScope.current!==scope||cardRequestSequence.current!==requestId)return;setCards(current=>mergeCardPages(current,page.cards));setCardNextCursor(page.nextCursor)}catch(value){if(cardScope.current===scope&&cardRequestSequence.current===requestId)setCardListError(describe(value))}finally{if(cardScope.current===scope&&cardRequestSequence.current===requestId)setCardListLoadingMore(false)}}
 const loadMoreCardTransactions=async()=>{
  const history=cardTransactionHistoryRef.current
  if(!session||!selectedCard||!history?.nextCursor||cardTransactionLoadingMore||cardTransactionAbortController.current)return
  const scope=sessionScope(session)
  const cardId=selectedCard.id
  const filter=cardTransactionFilterRef.current
  const cursor=history.nextCursor
  if(scope!==cardScope.current||cardId!==cardDetailTarget.current||cardId!==cardTransactionTarget.current||history.scopeKey!==scope||history.cardId!==cardId||history.filter!==filter)return
  const request=createCardTransactionHistoryRequestIdentity(++cardTransactionRequestSequence.current,scope,cardId,filter,cursor)
  const controller=new AbortController()
  cardTransactionAbortController.current=controller
  cardTransactionTarget.current=cardId
  cardTransactionCursorTarget.current=cursor
  const isCurrent=()=>cardTransactionAbortController.current===controller&&cardId===cardDetailTarget.current&&cardTransactionTarget.current===cardId&&cardTransactionHistoryRequestIsCurrent(request,cardTransactionRequestSequence.current,cardScope.current,selectedCardRef.current?.id??null,cardTransactionFilterRef.current,cardTransactionCursorTarget.current,walletRequestMounted.current)
  setCardTransactionLoadingMore(true)
  setCardTransactionError('')
  try{
   const page=await walletApi.transactions(cardId,{filter,cursor},controller.signal)
   if(!isCurrent())return
   replaceCardTransactionHistory(commitCardTransactionHistoryPage(cardTransactionHistoryRef.current,request,page))
  }catch(value){
   if(isCurrent()&&!(value instanceof DOMException&&value.name==='AbortError'))setCardTransactionError('Card transaction history unavailable for this session')
  }finally{
   if(isCurrent()){
    cardTransactionAbortController.current=null
    setCardTransactionLoadingMore(false)
   }
  }
 }
 const changeCardTransactionFilter=(value:unknown)=>{
  let filter:CardTransactionFilter
  try{filter=parseCardTransactionFilter(value)}catch{clearCardTransactions();setCardTransactionError('Card transaction history unavailable for this session');return}
  if(filter===cardTransactionFilterRef.current)return
  cardTransactionFilterRef.current=filter
  setCardTransactionFilterState(filter)
  clearCardTransactions()
  const activeSession=session
  const card=selectedCardRef.current
  const scope=activeSession?sessionScope(activeSession):null
  if(!activeSession||!card||!scope||scope!==cardScope.current||!walletRequestMounted.current){setCardTransactionError('Card transaction history unavailable for this session');return}
  setBusy(true)
  void loadCard(card,scope,{onError:()=>setCardTransactionError('Card transaction history unavailable for this session'),onSettled:()=>setBusy(false)})
 }
 const refreshCardTransactions=async()=>{
  const activeSession=session
  const card=selectedCardRef.current
  const scope=activeSession?walletTransferSessionScope(activeSession,walletRuntime.environment):null
  const filter=cardTransactionFilterRef.current
  const snapshot=cardTransactionHistoryRef.current
  const nextAttempt=cardTransactionRefreshAttemptRef.current+1
  if(nextAttempt>CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS)return
  if(
   !activeSession||
   !card||
   !scope||
   card.id!==cardTransactionTarget.current||
   !cardTransactionRefreshAllowed(activeSession.environment,walletRuntime.environment,scope,cardScope.current,card.id,cardDetailTarget.current,filter,cardTransactionFilterRef.current,snapshot)
  ){
   setCardTransactionError('Card transaction refresh unavailable for this session')
   return
  }
  abortCardTransactionRequest()
  setCardTransactionLoadingMore(false)
  const request=createCardTransactionRefreshRequestIdentity(++cardTransactionRequestSequence.current,scope,card.id,filter,nextAttempt,snapshot)
  const controller=new AbortController()
  cardTransactionAbortController.current=controller
  cardTransactionTarget.current=card.id
  cardTransactionCursorTarget.current=null
  cardTransactionRefreshAttemptRef.current=nextAttempt
  setCardTransactionRefreshAttempt(nextAttempt)
  const isCurrent=()=>cardTransactionAbortController.current===controller&&walletTransferSessionScope(activeSession,walletRuntime.environment)===scope&&card.id===cardDetailTarget.current&&cardTransactionTarget.current===card.id&&cardTransactionRefreshRequestIsCurrent(request,cardTransactionRequestSequence.current,cardScope.current,selectedCardRef.current?.id??null,cardTransactionFilterRef.current,cardTransactionRefreshAttemptRef.current,cardTransactionHistoryRef.current,walletRequestMounted.current)
  setCardTransactionRefreshing(true)
  setCardTransactionError('')
  try{
   const page=await walletApi.transactions(card.id,{filter},controller.signal)
   if(!isCurrent())return
   const refreshed=commitCardTransactionRefreshPage(request,page)
   cardTransactionAbortController.current=null
   replaceCardTransactionHistory(refreshed)
   cardTransactionRefreshAttemptRef.current=0
   setCardTransactionRefreshAttempt(0)
   setCardTransactionRefreshing(false)
   setCardTransactionError('')
  }catch(value){
   if(isCurrent()&&!(value instanceof DOMException&&value.name==='AbortError'))setCardTransactionError('Card transaction refresh unavailable for this session')
  }finally{
   if(isCurrent()){
    cardTransactionAbortController.current=null
    setCardTransactionRefreshing(false)
   }
  }
 }
 const selectCardTransactionDetail=(transaction:CardTransactionRecord)=>{invalidateCardTransactionDetailRefresh();const scope=cardScope.current;const card=selectedCardRef.current;if(!walletRequestMounted.current||!scope||!card){replaceSelectedCardTransactionDetail(null);return}try{replaceSelectedCardTransactionDetail(createCardTransactionDetailSelection(scope,card.id,transaction,cardTransactionsRef.current))}catch{replaceSelectedCardTransactionDetail(null)}}
 const refreshSelectedCardTransactionDetail=async()=>{
  const activeSession=session
  const card=selectedCardRef.current
  const selection=selectedCardTransactionDetailRef.current
  const history=cardTransactionHistoryRef.current
  const filter=cardTransactionFilterRef.current
  const scope=activeSession?walletTransferSessionScope(activeSession,walletRuntime.environment):null
  const listRow=selection&&history?history.transactions.find(transaction=>transaction.id===selection.transaction.id):null
  if(!activeSession||!card||!selection||!history||!listRow||!scope||scope!==cardScope.current||card.id!==cardDetailTarget.current||selection.scopeKey!==scope||selection.cardId!==card.id||history.scopeKey!==scope||history.cardId!==card.id||history.filter!==filter){setCardTransactionDetailError(describeCardTransactionDetail());return}
  invalidateCardTransactionDetailRefresh()
  let request
  try{request=createCardTransactionDetailRefreshRequestIdentity(++cardTransactionDetailRequestSequence.current,scope,card.id,filter,listRow.id,history)}catch{setCardTransactionDetailError(describeCardTransactionDetail());return}
  const controller=new AbortController()
  cardTransactionDetailAbortController.current=controller
  const isCurrent=()=>cardTransactionDetailAbortController.current===controller&&walletTransferSessionScope(activeSession,walletRuntime.environment)===scope&&card.id===cardDetailTarget.current&&cardTransactionDetailRefreshRequestIsCurrent(request,cardTransactionDetailRequestSequence.current,cardScope.current,selectedCardRef.current?.id??null,cardTransactionFilterRef.current,cardTransactionHistoryRef.current,selectedCardTransactionDetailRef.current?.transaction.id??null,walletRequestMounted.current)
  setCardTransactionDetailRefreshing(true)
  setCardTransactionDetailError('')
  try{
   const detail=await walletApi.cardTransactionDetail(activeSession,card.id,listRow,scope,controller.signal)
   if(!isCurrent())return
   replaceSelectedCardTransactionDetail(Object.freeze({scopeKey:scope,cardId:card.id,transaction:detail}))
   setCardTransactionDetailRefreshing(false)
   setCardTransactionDetailError('')
   cardTransactionDetailAbortController.current=null
  }catch(value){
   if(isCurrent()&&!cardTransactionDetailRefreshWasAborted(value))setCardTransactionDetailError(describeCardTransactionDetail())
  }finally{
   if(isCurrent()){
    cardTransactionDetailAbortController.current=null
    setCardTransactionDetailRefreshing(false)
   }
  }
 }
 const loadMoreWalletTransactions=async()=>{const previous=walletTransactionsRef.current;if(!session||!selectedAccount||!previous?.nextCursor||walletHistoryInFlight.current)return;const scope=walletTransferSessionScope(session,walletRuntime.environment);const selectedAsset=selectedAccount.assetCode;let filters;try{filters=walletTransactionFiltersForSelectedAsset({type:walletTransactionTypeFilterTarget.current,status:walletTransactionStatusFilterTarget.current},selectedAsset)}catch{clearWalletTransactions();setWalletHistoryError(describeWalletHistory());return}const filterKey=walletTransactionFilterKey(filters);const cursor=previous.nextCursor;const ownsAccount=accountsRef.current.some(row=>row.id===selectedAccount.id&&row.assetCode===selectedAsset);if(!scope||scope!==walletScope.current||!ownsAccount||selectedAccountRef.current?.id!==selectedAccount.id||selectedAsset!==walletHistoryAssetTarget.current||filterKey!==walletHistoryFilterTarget.current||cursor!==walletHistoryCursorTarget.current){clearWalletTransactions();setWalletHistoryError(describeWalletHistory());return}const request=createWalletTransactionHistoryRequestIdentity(++walletHistoryRequestSequence.current,scope,filters,cursor);const historyController=new AbortController();walletHistoryAbortController.current=historyController;walletHistoryInFlight.current=true;const isCurrent=()=>walletRequestMounted.current&&walletHistoryAbortController.current===historyController&&walletTransferSessionScope(session,walletRuntime.environment)===scope&&walletTransactionHistoryRequestIsCurrent(request,walletHistoryRequestSequence.current,walletScope.current,walletHistoryFilterTarget.current,walletHistoryCursorTarget.current)&&accountsRef.current.some(row=>row.id===selectedAccount.id&&row.assetCode===selectedAsset)&&selectedAccountRef.current?.id===selectedAccount.id;setWalletTransactionLoadingMore(true);setWalletHistoryError('');clearWalletTransactionDetail();try{const history=await walletApi.walletTransactions(session,filters,previous,historyController.signal);if(!isCurrent())return;replaceWalletTransactions(history);walletHistoryCursorTarget.current=history.nextCursor}catch(value){if(isCurrent()&&!walletTransactionRequestWasAborted(value))setWalletHistoryError(describeWalletHistory())}finally{if(isCurrent()){walletHistoryAbortController.current=null;walletHistoryInFlight.current=false;setWalletTransactionLoadingMore(false)}}}
 const changeWalletTransactionFilters=(selectionInput:unknown)=>{let selection;try{selection=normalizeWalletTransactionFilterSelection(selectionInput)}catch{clearWalletTransactions();setWalletHistoryError(describeWalletHistory());return}if(selection.type===walletTransactionTypeFilterTarget.current&&selection.status===walletTransactionStatusFilterTarget.current)return;walletTransactionTypeFilterTarget.current=selection.type;walletTransactionStatusFilterTarget.current=selection.status;setWalletTransactionTypeFilter(selection.type);setWalletTransactionStatusFilter(selection.status);const activeSession=session;const account=selectedAccountRef.current;const scope=activeSession?walletTransferSessionScope(activeSession,walletRuntime.environment):null;if(!activeSession||!account||!scope||!walletTransactionFilterRequestAllowed(account,accountsRef.current,selectedAccountRef.current,scope,walletScope.current)){clearWalletTransactions();setWalletHistoryError(describeWalletHistory());return}void loadWalletTransactionHistory(account,scope,activeSession,selection)}
 const loadMoreWalletOperations=async()=>{const snapshot=walletOperationsRef.current;if(!session||!snapshot?.nextCursor||walletOperationInFlight.current)return;let expectedPage=snapshot;const scope=walletTransferSessionScope(session,walletRuntime.environment);const filters:WalletOperationFilterSelection={type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current};const cursor=snapshot.nextCursor;if(!scope||scope!==walletScope.current)return;abortWalletOperationRequest();clearWalletOperationDetail();const controller=new AbortController();walletOperationAbortController.current=controller;walletOperationInFlight.current=true;const request=createWalletOperationActivityRequestIdentity(++walletOperationRequestSequence.current,scope,filters,cursor);walletOperationCursorTarget.current=cursor;const isCurrent=()=>walletOperationAbortController.current===controller&&walletTransferSessionScope(session,walletRuntime.environment)===scope&&walletOperationsRef.current===expectedPage&&walletOperationActivityRequestIsCurrent(request,walletOperationRequestSequence.current,walletScope.current,walletOperationFilterKey({type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current}),walletOperationCursorTarget.current,walletRequestMounted.current);setWalletOperationsLoadingMore(true);setWalletOperationsError('');try{const page=await walletApi.walletOperations(session,scope,filters,cursor,controller.signal);if(isCurrent()){const merged=appendWalletOperationPage(snapshot,page,cursor);expectedPage=merged;replaceWalletOperations(merged)}}catch(value){if(isCurrent()&&!walletOperationRequestWasAborted(value))setWalletOperationsError(describeWalletOperations(value))}finally{if(isCurrent()){walletOperationAbortController.current=null;walletOperationInFlight.current=false;setWalletOperationsLoadingMore(false)}}}
 const selectWalletOperation=async(operation:WalletOperationRecord)=>{const snapshot=walletOperationsRef.current;if(!session||!snapshot)return;const scope=walletTransferSessionScope(session,walletRuntime.environment);const filters:WalletOperationFilterSelection={type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current};if(!scope||scope!==walletScope.current||!snapshot.items.some(item=>item.id===operation.id)){clearWalletOperationDetail();setWalletOperationDetailError('Wallet operation detail unavailable for this session');return}clearWalletOperationDetail();const controller=new AbortController();walletOperationDetailAbortController.current=controller;const request=createWalletOperationDetailRequestIdentity(++walletOperationDetailRequestSequence.current,scope,filters,operation,snapshot);walletOperationDetailTarget.current=operation.id;const isCurrent=()=>walletOperationDetailAbortController.current===controller&&walletTransferSessionScope(session,walletRuntime.environment)===scope&&walletOperationDetailRequestIsCurrent(request,walletOperationDetailRequestSequence.current,walletScope.current,walletOperationFilterKey({type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current}),walletOperationsRef.current,walletOperationDetailTarget.current,walletRequestMounted.current);setSelectedWalletOperation(operation);setWalletOperationDetailLoading(true);setWalletOperationDetailError('');try{const detail=await walletApi.walletOperationDetail(session,scope,operation,controller.signal);if(isCurrent())setWalletOperationDetail(detail)}catch(value){if(isCurrent()&&!walletOperationRequestWasAborted(value))setWalletOperationDetailError(describeWalletOperationDetail(value))}finally{if(isCurrent()){walletOperationDetailAbortController.current=null;setWalletOperationDetailLoading(false)}}}
 const changeWalletOperationFilters=(patch:Partial<WalletOperationFilterSelection>)=>{const next:WalletOperationFilterSelection={type:patch.type??walletOperationTypeFilterTarget.current,status:patch.status??walletOperationStatusFilterTarget.current};if(walletOperationFilterKey(next)===walletOperationFilterKey({type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current}))return;walletOperationTypeFilterTarget.current=next.type;walletOperationStatusFilterTarget.current=next.status;setWalletOperationTypeFilter(next.type);setWalletOperationStatusFilter(next.status);clearWalletOperations();const activeSession=session;const scope=activeSession?walletTransferSessionScope(activeSession,walletRuntime.environment):null;if(activeSession&&scope&&scope===walletScope.current)void loadWalletOperations(scope,activeSession,next)}
 const loadWalletTransactionDetail=async(transaction:WalletTransactionRecord)=>{const activeSession=session;const account=selectedAccountRef.current;const scope=activeSession?walletTransferSessionScope(activeSession,walletRuntime.environment):null;let filters;try{filters=account?walletTransactionFiltersForSelectedAsset({type:walletTransactionTypeFilterTarget.current,status:walletTransactionStatusFilterTarget.current},account.assetCode):null}catch{filters=null}if(!activeSession||!account||!scope||!filters||!walletTransactionFilterRequestAllowed(account,accountsRef.current,selectedAccountRef.current,scope,walletScope.current)||account.assetCode!==walletHistoryAssetTarget.current||!walletTransactionDetailRefreshAllowed(transaction,walletTransactionsRef.current,filters)){clearWalletTransactionDetail();setWalletTransactionDetailError(describeWalletTransactionDetail(null));return}resetWalletTransactionDetailRequest();const request=createWalletTransactionDetailRequestIdentity(++walletTransactionDetailRequestSequence.current,scope,account.id,filters,transaction);const detailController=new AbortController();walletTransactionDetailAbortController.current=detailController;walletTransactionDetailAssetTarget.current=account.assetCode;walletTransactionDetailTarget.current=transaction.id;const isCurrent=()=>{const currentAccount=selectedAccountRef.current;let currentFilters;try{currentFilters=currentAccount?walletTransactionFiltersForSelectedAsset({type:walletTransactionTypeFilterTarget.current,status:walletTransactionStatusFilterTarget.current},currentAccount.assetCode):null}catch{return false}return Boolean(walletRequestMounted.current&&currentAccount&&currentFilters&&walletTransactionDetailAbortController.current===detailController&&walletTransferSessionScope(activeSession,walletRuntime.environment)===scope&&walletTransactionFilterRequestAllowed(currentAccount,accountsRef.current,selectedAccountRef.current,scope,walletScope.current)&&walletTransactionDetailAssetTarget.current===currentAccount.assetCode&&walletTransactionDetailTarget.current===transaction.id&&walletTransactionDetailRequestIsCurrent(request,walletTransactionDetailRequestSequence.current,walletScope.current,currentAccount.id,currentFilters,walletTransactionsRef.current,selectedWalletTransactionRef.current))};setWalletTransactionDetail(null);setWalletTransactionDetailLoading(true);setWalletTransactionDetailError('');try{const detail=await walletApi.walletTransactionDetail(activeSession,transaction,detailController.signal);if(!isCurrent())return;setWalletTransactionDetail(detail)}catch(value){if(isCurrent()&&!walletTransactionRequestWasAborted(value))setWalletTransactionDetailError(describeWalletTransactionDetail(null))}finally{if(isCurrent()){walletTransactionDetailAbortController.current=null;setWalletTransactionDetailLoading(false)}}}
 const selectWalletTransaction=async(transaction:WalletTransactionRecord)=>{replaceSelectedWalletTransaction(transaction);await loadWalletTransactionDetail(transaction)}
 const refreshSelectedWalletTransaction=()=>{const transaction=selectedWalletTransactionRef.current;if(transaction)void loadWalletTransactionDetail(transaction)}
 useEffect(()=>{cardsRef.current=cards},[cards])
 useEffect(()=>{walletRequestMounted.current=true;return()=>{walletRequestMounted.current=false;selectedCardTransactionDetailRef.current=null;cardDetailRequestSequence.current+=1;abortCardDetailRequest();abortCardTransactionRequest();abortCardTransactionDetailRequest();cardTransactionRequestSequence.current+=1;cardTransactionDetailRequestSequence.current+=1;cardTransactionTarget.current=null;cardTransactionCursorTarget.current=null;walletOperationRequestSequence.current+=1;walletOperationDetailRequestSequence.current+=1;walletOperationInFlight.current=false;abortWalletOperationRequest();abortWalletOperationDetailRequest();walletHistoryRequestSequence.current+=1;walletTransactionDetailRequestSequence.current+=1;cardLimitsUpdateRequestSequence.current+=1;cardLimitsUpdateSubmitGate.current.activeRequestId=null;cardLimitsUpdateInFlight.current=false;cardActionRequestSequence.current+=1;cardActionTarget.current=null;cardStatusSubmitGate.current.activeRequestId=null;cardStatusInFlight.current=false;cardReplacementRequestSequence.current+=1;cardReplacementTarget.current=null;cardReplacementSubmitGate.current.activeRequestId=null;cardReplacementInFlight.current=false;cardRenewalRequestSequence.current+=1;cardRenewalTarget.current=null;cardRenewalSubmitGate.current.activeRequestId=null;cardRenewalInFlight.current=false;abortWalletHistoryRequest();abortWalletTransactionDetailRequest()}},[])
 useEffect(()=>{void (async()=>{try{await acceptSession(await walletApi.session())}catch(value){clear();if(!(value instanceof WalletApiError&&value.status===401))setError(describe(value))}finally{if(walletRequestMounted.current)setBusy(false)}})()},[])
 useEffect(()=>{if(!session)return;const expiresAt=typeof session.expiresAt==='string'?Date.parse(session.expiresAt):Number.NaN;const remaining=expiresAt-Date.now();if(!Number.isFinite(remaining)||remaining<=0){clear();return}const timeout=window.setTimeout(()=>clear(),Math.min(remaining,2_147_483_647));return()=>window.clearTimeout(timeout)},[session])
 const authenticate=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');clear();try{const credentials:WalletCredentials={tenantId:tenantId.trim(),email:email.trim(),password};const current=mode==='login'?await walletApi.login(credentials):await walletApi.register(credentials);await acceptSession(current);setPassword('')}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 const detailCallbacks={onError:()=>setCardRefreshError('Card refresh unavailable for this session'),onSettled:()=>setBusy(false)}
 const selectCard=async(card:CardRecord)=>{if(!session||cardReplacementInFlight.current||cardRenewalInFlight.current||cardLimitsUpdateInFlight.current||cardStatusInFlight.current)return;clearCardReplacement();clearCardRenewal();clearCardLimitsUpdate();clearCardStatusAction();setBusy(true);setError('');setSelectedCard(card);clearCardBalance();clearCardLimits();clearCardTransactions();await loadCard(card,sessionScope(session),detailCallbacks)}
 const reloadCard=async()=>{if(!session||!selectedCard||cardReplacementInFlight.current||cardRenewalInFlight.current||cardLimitsUpdateInFlight.current||cardStatusInFlight.current)return;setBusy(true);setError('');await loadCard(selectedCard,sessionScope(session),detailCallbacks)}
 const createVirtualCard=async(event:FormEvent)=>{event.preventDefault();if(!session||virtualCardCreateInFlight.current||cardReplacementInFlight.current||cardRenewalInFlight.current)return;const scope=sessionScope(session);const decision=virtualCardCreateDecision(session.environment,walletRuntime.environment);if(!decision.allowed||scope!==cardScope.current){setVirtualCardCreateError('Virtual card creation unavailable for this session');return}let input:VirtualCardCreateInput;try{input=parseVirtualCardCreateInput({currency:virtualCardCurrency,alias:virtualCardAlias})}catch{setVirtualCardCreateError('Use a valid ISO currency and an optional alias of 30 characters or fewer.');return}const request={requestId:++virtualCardCreateRequestSequence.current,scopeKey:scope};const isCurrent=()=>virtualCardCreateRequestIsCurrent(request,virtualCardCreateRequestSequence.current,cardScope.current);virtualCardCreateInFlight.current=true;setVirtualCardCreating(true);setVirtualCardCreateError('');const idempotencyKey=crypto.randomUUID();try{const created=await walletApi.createVirtualCard(input,idempotencyKey,session.environment);if(!isCurrent())return;const page=await walletApi.cards();if(!isCurrent())return;setCards(mergeCardPages(page.cards,[created]));setCardNextCursor(page.nextCursor);setCardListError('');setSelectedCard(created);setVirtualCardAlias('');await loadCard(created,scope,{onError:()=>{if(isCurrent())setVirtualCardCreateError('Virtual card created, but refreshed card detail is unavailable for this session.')}})}catch(value){if(isCurrent())setVirtualCardCreateError(describeVirtualCardCreate(value))}finally{if(isCurrent()){virtualCardCreateInFlight.current=false;setVirtualCardCreating(false)}}}
 const replaceSelectedCard=async(event:FormEvent)=>{
  event.preventDefault()
  const activeSession=session
  const oldCard=selectedCardRef.current
  if(!activeSession||!oldCard||cardReplacementInFlight.current||virtualCardCreateInFlight.current||cardRenewalInFlight.current||cardLimitsUpdateInFlight.current||cardStatusInFlight.current)return
  const decision=cardReplacementDecision(oldCard,activeSession,walletRuntime.environment,cardScope.current,cardDetailTarget.current)
  if(!decision.allowed||!decision.scopeKey){setCardReplacementError('Card replacement unavailable for this session');return}
  let input:CardReplacementInput
  try{input=parseCardReplacementInput({reason:cardReplacementReasonRef.current})}
  catch{setCardReplacementError('Choose a valid replacement reason.');return}
  const requestId=++cardReplacementRequestSequence.current
  if(!beginCardReplacement(cardReplacementSubmitGate.current,requestId))return
  let request
  try{request=createCardReplacementRequestIdentity(requestId,decision.scopeKey,input.reason,oldCard,crypto.randomUUID())}
  catch{settleCardReplacement(cardReplacementSubmitGate.current,requestId);setCardReplacementError('Secure Card replacement is unavailable');return}
  cardReplacementTarget.current=oldCard.id
  const isCurrent=()=>Boolean(
   walletRequestMounted.current&&
   cardReplacementSubmitGate.current.activeRequestId===requestId&&
   cardReplacementTarget.current===oldCard.id&&
   cardReplacementRequestIsCurrent(request,cardReplacementRequestSequence.current,activeSession,walletRuntime.environment,cardScope.current,cardReplacementReasonRef.current,selectedCardRef.current)
  )
  cardReplacementInFlight.current=true
  setCardReplacing(true)
  setCardReplacementError('')
  try{
   const replacement=await walletApi.replaceCard(activeSession,oldCard,input,request.idempotencyKey,cardScope.current,cardDetailTarget.current)
   if(!isCurrent())return
   const commit=createCardReplacementCommit(cardsRef.current,selectedCardRef.current,request.oldCardVersion,replacement)
   settleCardReplacement(cardReplacementSubmitGate.current,requestId)
   cardReplacementInFlight.current=false
   cardReplacementTarget.current=null
   setCardReplacing(false)
   setCards(commit.cards)
   setSelectedCard(commit.selectedCard)
   setCardListError('')
   setBusy(true)
   await loadCard(commit.selectedCard,request.scopeKey,detailCallbacks)
  }catch(value){if(isCurrent())setCardReplacementError(describeCardReplacement(value))}
  finally{
   const currentRequest=isCurrent()
   const settled=settleCardReplacement(cardReplacementSubmitGate.current,requestId)
   if(currentRequest&&settled){cardReplacementInFlight.current=false;cardReplacementTarget.current=null;setCardReplacing(false)}
  }
 }
 const renewSelectedCard=async(event:FormEvent)=>{
  event.preventDefault()
  const activeSession=session
  const card=selectedCardRef.current
  if(!activeSession||!card||cardRenewalInFlight.current||virtualCardCreateInFlight.current||cardReplacementInFlight.current||cardLimitsUpdateInFlight.current||cardStatusInFlight.current)return
  const decision=cardRenewalDecision(card,activeSession,walletRuntime.environment,cardScope.current,cardDetailTarget.current)
  if(!decision.allowed||!decision.scopeKey){setCardRenewalError('Card renewal unavailable for this session');return}
  const requestId=++cardRenewalRequestSequence.current
  if(!beginCardRenewal(cardRenewalSubmitGate.current,requestId))return
  let request
  try{request=createCardRenewalRequestIdentity(requestId,decision.scopeKey,card,crypto.randomUUID())}
  catch{settleCardRenewal(cardRenewalSubmitGate.current,requestId);setCardRenewalError('Secure Card renewal is unavailable');return}
  cardRenewalTarget.current=card.id
  const isCurrent=()=>Boolean(
   walletRequestMounted.current&&
   cardRenewalSubmitGate.current.activeRequestId===requestId&&
   cardRenewalTarget.current===card.id&&
   cardRenewalRequestIsCurrent(request,cardRenewalRequestSequence.current,activeSession,walletRuntime.environment,cardScope.current,selectedCardRef.current)
  )
  cardRenewalInFlight.current=true
  setCardRenewing(true)
  setCardRenewalError('')
  try{
   const renewed=await walletApi.renewCard(activeSession,card,request.idempotencyKey,cardScope.current,cardDetailTarget.current)
   if(!isCurrent())return
   const commit=createCardRenewalCommit(cardsRef.current,selectedCardRef.current,request.oldCardVersion,renewed)
   settleCardRenewal(cardRenewalSubmitGate.current,requestId)
   cardRenewalInFlight.current=false
   cardRenewalTarget.current=null
   setCardRenewing(false)
   setCards(commit.cards)
   setSelectedCard(commit.selectedCard)
   setCardListError('')
   setBusy(true)
   await loadCard(commit.selectedCard,request.scopeKey,detailCallbacks)
  }catch(value){if(isCurrent())setCardRenewalError(describeCardRenewal(value))}
  finally{
   const currentRequest=isCurrent()
   const settled=settleCardRenewal(cardRenewalSubmitGate.current,requestId)
   if(currentRequest&&settled){cardRenewalInFlight.current=false;cardRenewalTarget.current=null;setCardRenewing(false)}
  }
 }
 const updateCardLimitsDraftValue=(field:CardLimitUpdateField,value:string)=>{if(cardLimitsUpdateDraftRef.current[field]===value)return;if(cardLimitsUpdateInFlight.current)clearCardLimitsUpdate();const next={...cardLimitsUpdateDraftRef.current,[field]:value};cardLimitsUpdateDraftRef.current=next;setCardLimitsUpdateDraftState(next);setCardLimitsUpdateError('')}
 const submitSelectedCardLimits=async(event:FormEvent)=>{
  event.preventDefault()
  const activeSession=session
  const card=selectedCardRef.current
  const current=cardLimitsRef.current
  if(!activeSession||!card||!current||cardLimitsUpdateInFlight.current||virtualCardCreateInFlight.current||cardReplacementInFlight.current||cardRenewalInFlight.current)return
  const scope=walletTransferSessionScope(activeSession,walletRuntime.environment)
  const decision=cardLimitsUpdateDecision(card,current,activeSession.environment,walletRuntime.environment,scope,cardScope.current,cardDetailTarget.current)
  if(!scope||!decision.allowed){setCardLimitsUpdateError('Card limits update unavailable for this session');return}
  let input
  try{input=cardLimitsUpdateInputFromDraft(cardLimitsUpdateDraftRef.current,current)}
  catch{setCardLimitsUpdateError(`Use one or more whole minor-unit values from 0 to ${CARD_LIMIT_UPDATE_MAX_MINOR.toLocaleString()}, with single ≤ daily ≤ monthly.`);return}
  const requestId=++cardLimitsUpdateRequestSequence.current
  if(!beginCardLimitsUpdate(cardLimitsUpdateSubmitGate.current,requestId))return
  let request
  try{
   const idempotencyKey=crypto.randomUUID()
   request=createCardLimitsUpdateRequestIdentity(requestId,scope,activeSession.environment as 'SANDBOX'|'TEST',card,current,input,idempotencyKey)
  }catch{
   settleCardLimitsUpdate(cardLimitsUpdateSubmitGate.current,requestId)
   setCardLimitsUpdateError('Secure Card limits submission is unavailable')
   return
  }
  const isCurrent=()=>{
   const currentCard=selectedCardRef.current
   const currentLimits=cardLimitsRef.current
   let currentInput
   try{currentInput=currentLimits?cardLimitsUpdateInputFromDraft(cardLimitsUpdateDraftRef.current,currentLimits):null}catch{return false}
   return Boolean(
    walletRequestMounted.current&&
    cardLimitsUpdateSubmitGate.current.activeRequestId===requestId&&
    walletTransferSessionScope(activeSession,walletRuntime.environment)===scope&&
    currentCard&&currentLimits&&currentInput&&
    cardLimitsUpdateDecision(currentCard,currentLimits,activeSession.environment,walletRuntime.environment,scope,cardScope.current,cardDetailTarget.current).allowed&&
    cardLimitsUpdateRequestIsCurrent(request,cardLimitsUpdateRequestSequence.current,cardScope.current,activeSession.environment,walletRuntime.environment,currentCard,currentLimits,currentInput)
   )
  }
  cardLimitsUpdateInFlight.current=true
  setCardLimitsUpdating(true)
  setCardLimitsUpdateError('')
  try{
   const updated=await walletApi.updateCardLimits(card,current,input,request.idempotencyKey,activeSession.environment,scope,cardScope.current,cardDetailTarget.current)
   if(!isCurrent())return
   settleCardLimitsUpdate(cardLimitsUpdateSubmitGate.current,requestId)
   cardLimitsUpdateInFlight.current=false
   setCardLimitsUpdating(false)
   replaceCardLimits(updated)
  }catch(value){
   if(isCurrent())setCardLimitsUpdateError(describeCardLimitsUpdate(value))
  }finally{
   const currentRequest=isCurrent()
   const settled=settleCardLimitsUpdate(cardLimitsUpdateSubmitGate.current,requestId)
   if(currentRequest&&settled){cardLimitsUpdateInFlight.current=false;setCardLimitsUpdating(false)}
  }
 }
 const selectWallet=async(account:WalletAccountRecord)=>{if(!session)return;walletTransferRequestSequence.current+=1;walletTransferTarget.current=null;walletTransferStatusRequestSequence.current+=1;walletTransferStatusTarget.current=null;setTransferBusy(false);setTransferReceipt(null);setTransferStatusBusy(false);setTransferStatusRefreshCount(0);setDestinationAccountId('');setTransferAmount('');replaceSelectedAccount(account);const scope=sessionScope(session);await Promise.all([loadWallet(account,scope,session),loadWalletBalanceSummary(accountsRef.current,account,session.environment,scope)])}
 const reloadWallet=async()=>{if(!session||!selectedAccount||transferBusy)return;const scope=sessionScope(session);await Promise.all([loadWallet(selectedAccount,scope,session),loadWalletBalanceSummary(accountsRef.current,selectedAccount,session.environment,scope)])}
 const virtualCardDecision=virtualCardCreateDecision(session?.environment??null,walletRuntime.environment)
 const replacementDecision=selectedCard?cardReplacementDecision(selectedCard,session,walletRuntime.environment,cardScope.current,cardDetailTarget.current):null
 const renewalDecision=selectedCard?cardRenewalDecision(selectedCard,session,walletRuntime.environment,cardScope.current,cardDetailTarget.current):null
 const limitsUpdateDecision=selectedCard?cardLimitsUpdateDecision(selectedCard,cardLimits,session?.environment??null,walletRuntime.environment,session?walletTransferSessionScope(session,walletRuntime.environment):null,cardScope.current,cardDetailTarget.current):null
 const toggleDecision=selectedCard?cardStatusDecision(selectedCard,session,walletRuntime.environment,cardScope.current,cardDetailTarget.current):null
 const selectedCardTransaction=selectedCardTransactionDetail?.transaction??null
 const transactionRefreshAllowed=Boolean(session&&selectedCard&&cardTransactionRefreshAllowed(session.environment,walletRuntime.environment,walletTransferSessionScope(session,walletRuntime.environment),cardScope.current,selectedCard.id,cardDetailTarget.current,cardTransactionFilter,cardTransactionFilterRef.current,cardTransactionHistoryRef.current))
 const toggle=async()=>{
  const activeSession=session
  const card=selectedCardRef.current
  if(!activeSession||!card||cardStatusInFlight.current||cardLimitsUpdateInFlight.current||virtualCardCreateInFlight.current||cardReplacementInFlight.current||cardRenewalInFlight.current)return
  const decision=cardStatusDecision(card,activeSession,walletRuntime.environment,cardScope.current,cardDetailTarget.current)
  if(!decision.allowed||!decision.operation||!decision.scopeKey){setError(`Card operation blocked · ${decision.reason??'Capability unavailable.'}`);return}
  const requestId=++cardActionRequestSequence.current
  if(!beginCardStatusAction(cardStatusSubmitGate.current,requestId))return
  let request
  try{request=createCardStatusRequestIdentity(requestId,decision.scopeKey,decision.operation,card,crypto.randomUUID())}
  catch{settleCardStatusAction(cardStatusSubmitGate.current,requestId);setError('Secure Card status action is unavailable');return}
  cardActionTarget.current=card.id
  const isCurrent=()=>Boolean(
   walletRequestMounted.current&&
   cardStatusSubmitGate.current.activeRequestId===requestId&&
   cardActionTarget.current===card.id&&
   cardStatusRequestIsCurrent(request,cardActionRequestSequence.current,activeSession,walletRuntime.environment,cardScope.current,selectedCardRef.current)
  )
  cardStatusInFlight.current=true
  setBusy(true)
  setError('')
  try{
   const updated=await walletApi.setCardStatus(activeSession,card,request.operation,request.idempotencyKey,cardScope.current,cardDetailTarget.current)
   if(!isCurrent())return
   settleCardStatusAction(cardStatusSubmitGate.current,requestId)
   cardStatusInFlight.current=false
   cardActionTarget.current=null
   setBusy(false)
   setSelectedCard(updated)
   setCards(current=>current.map(row=>row.id===updated.id?updated:row))
  }catch(value){
   if(isCurrent())setError(value instanceof WalletApiError?`Card status action unavailable for this session · Trace ${value.traceId}`:'Card status action unavailable for this session')
  }finally{
   const currentRequest=isCurrent()
   const settled=settleCardStatusAction(cardStatusSubmitGate.current,requestId)
   if(currentRequest&&settled){cardStatusInFlight.current=false;cardActionTarget.current=null;setBusy(false)}
  }
 }
 const transfer=async(event:FormEvent)=>{event.preventDefault();if(!session||!selectedAccount||walletTransferSubmitGate.current.activeRequestId!==null)return;const scope=walletTransferSessionScope(session,walletRuntime.environment);const account=selectedAccount;if(!scope||scope!==walletScope.current||account.id!==walletAccountTarget.current){setWalletError(describeWalletTransfer());return}let input;try{input=normalizeWalletTransferInput({sourceAccountId:account.id,destinationAccountId:destinationAccountId.trim(),assetCode:account.assetCode,amount:transferAmount},accountsRef.current)}catch{setWalletError('Use an active destination account, matching asset, positive amount, and sufficient available balance.');return}const requestId=++walletTransferRequestSequence.current;if(!beginWalletTransferSubmit(walletTransferSubmitGate.current,requestId))return;const idempotencyKey=crypto.randomUUID();const request=createWalletTransferRequestIdentity(requestId,scope,account,input,idempotencyKey);walletTransferTarget.current=account.id;walletTransferStatusRequestSequence.current+=1;walletTransferStatusTarget.current=null;walletTransferStatusInFlight.current=false;const isCurrent=()=>walletTransferSessionScope(session,walletRuntime.environment)===scope&&walletTransferRequestIsCurrent(request,walletTransferRequestSequence.current,walletScope.current,accountsRef.current,selectedAccountRef.current)&&account.id===walletTransferTarget.current&&account.id===walletAccountTarget.current;setTransferBusy(true);setTransferReceipt(null);setTransferStatusBusy(false);setTransferStatusRefreshCount(0);setWalletError('');try{const receipt=await walletApi.internalTransfer(session,accountsRef.current,input,idempotencyKey);if(!isCurrent())return;walletTransferStatusTarget.current=receipt.id;setTransferReceipt(receipt);setTransferBusy(false);const refreshed=await walletApi.walletAccounts(session);if(!isCurrent())return;const refreshedAccount=refreshed.find(row=>row.id===account.id);replaceAccounts(refreshed);if(!refreshedAccount){walletAccountRequestSequence.current+=1;walletAccountTarget.current=null;replaceSelectedAccount(null);clearWalletBalanceSummary();setAccountBalance(null);clearWalletTransactions();setWalletError('Transferred, but the source account is no longer available in this session.');return}replaceSelectedAccount(refreshedAccount);await Promise.all([loadWallet(refreshedAccount,scope,session),loadWalletBalanceSummary(refreshed,refreshedAccount,session.environment,scope)]);if(scope===walletScope.current)setTransferAmount('')}catch{if(isCurrent())setWalletError(describeWalletTransfer())}finally{const settled=settleWalletTransferSubmit(walletTransferSubmitGate.current,requestId);if(settled&&isCurrent())setTransferBusy(false)}}
 const refreshTransferStatus=async()=>{if(!session||!selectedAccount||!transferReceipt||walletTransferStatusInFlight.current||transferStatusRefreshCount>=WALLET_TRANSFER_STATUS_REFRESH_LIMIT)return;const scope=walletTransferSessionScope(session,walletRuntime.environment);const accountId=selectedAccount.id;const previousReceipt=transferReceipt;const operationId=previousReceipt.id;if(!scope||scope!==walletScope.current||accountId!==walletAccountTarget.current||operationId!==walletTransferStatusTarget.current){setWalletError(describeWalletTransfer());return}const request={requestId:++walletTransferStatusRequestSequence.current,scopeKey:scope,accountId,operationId};walletTransferStatusTarget.current=operationId;const isCurrent=()=>walletTransferSessionScope(session,walletRuntime.environment)===scope&&walletTransferStatusRequestIsCurrent(request,walletTransferStatusRequestSequence.current,walletScope.current,walletAccountTarget.current,walletTransferStatusTarget.current);walletTransferStatusInFlight.current=true;setTransferStatusBusy(true);setTransferStatusRefreshCount(current=>current+1);setWalletError('');try{const receipt=await walletApi.walletTransferStatus(session,previousReceipt);if(!isCurrent())return;setTransferReceipt(receipt)}catch{if(isCurrent())setWalletError(describeWalletTransfer())}finally{if(isCurrent()){walletTransferStatusInFlight.current=false;setTransferStatusBusy(false)}}}
 const refresh=async()=>{if(!session)return;abortCardDetailRequest();setBusy(true);setError('');try{await acceptSession(await walletApi.refresh())}catch(value){clear();setError(describe(value))}finally{setBusy(false)}}
 const logout=async()=>{setBusy(true);setError('');clear();try{await walletApi.logout()}catch(value){if(!(value instanceof WalletApiError&&value.status===401))setError(describe(value))}finally{setPassword('');setBusy(false)}}
 return <main style={{maxWidth:980,margin:'40px auto',padding:24,fontFamily:'Inter,system-ui'}}>
  <header><div><h1>FastLink Wallet</h1><p>Environment: <b>{walletRuntime.environment}</b> · Build: <b>{walletRuntime.buildSha}</b></p><p>API: <code>{walletRuntime.apiUrl}</code></p></div>{session&&<div className="session-actions"><button onClick={refresh} disabled={busy||cardReplacing||cardRenewing}><RefreshCw/> Refresh session</button><button onClick={logout} disabled={busy||cardReplacing||cardRenewing}><LogOut/> Sign out</button></div>}</header>
  {!session&&<section className="panel auth-panel"><ShieldCheck/><h2>{mode==='login'?'Sign in to FastLink':'Create your FastLink account'}</h2><p>Authentication is handled by the FastLink Backend using a secure HttpOnly cookie. Browser storage and pasted bearer tokens are disabled.</p><form onSubmit={authenticate}><label>Workspace<input value={tenantId} onChange={event=>setTenantId(event.target.value)} placeholder="Tenant ID or slug" autoComplete="organization" required/></label><label>Email<input type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={event=>setPassword(event.target.value)} placeholder="Minimum 12 characters" autoComplete={mode==='login'?'current-password':'new-password'} minLength={12} required/></label><button disabled={busy||!tenantId.trim()||!email.trim()||password.length<12}>{busy?'Please wait…':mode==='login'?'Sign in':'Register'}</button></form><button className="mode-switch" onClick={()=>{setMode(current=>current==='login'?'register':'login');setError('')}}>{mode==='login'?'New to FastLink? Register':'Already registered? Sign in'}</button></section>}
  {error&&<section className="panel"><h3>API unavailable</h3><p>{error}</p><p>Unavailable · no stale data displayed.</p></section>}
  {session&&<div className="wallet-grid">
   <section className="panel wallet-balance-summary"><h2><Landmark/> All Wallet balances · read only</h2><p className="card-action-note">Backend aggregate for this authenticated customer and environment. Only exact, current and internally reconciled records are displayed.</p>{walletBalanceSummaryError&&<div className="inline-error">{walletBalanceSummaryError} · No unvalidated, stale or cross-session summary displayed.</div>}{walletBalanceSummaryLoading&&<p>Loading Wallet balance summary…</p>}<div className="record-list">{!walletBalanceSummaryLoading&&walletBalanceSummary?.items.length?walletBalanceSummary.items.map(item=><div className="balance-record" key={item.assetCode}><b>{item.assetCode} {item.availableBalance} available</b><small>Ledger {item.ledgerBalance} · Pending {item.pendingBalance}</small><small>Updated {new Date(item.updatedAt).toLocaleString()}</small></div>):!walletBalanceSummaryLoading&&!walletBalanceSummaryError&&<p>No persisted Wallet balances returned.</p>}</div></section>
   <section className="panel">
    <div className="panel-row"><h2><Landmark/> Real wallet balances</h2>{selectedAccount&&<button onClick={()=>void reloadWallet()} disabled={busy||walletLoading||transferBusy}><RefreshCw/> Refresh</button>}</div>
    {accounts.length===0?<p>Unavailable · no wallet accounts returned by Backend.</p>:<select value={selectedAccount?.id||''} disabled={transferBusy} onChange={event=>{const account=accounts.find(row=>row.id===event.target.value);if(account)void selectWallet(account)}}>{accounts.map(account=><option key={account.id} value={account.id}>{account.assetCode} · {account.availableBalance} · {account.status}</option>)}</select>}
    {walletError&&<p className="inline-error">{walletError} · No unvalidated or cross-account response displayed.</p>}
    {selectedAccount&&<>
     <div className="balance-record"><b>{walletLoading?'Loading…':accountBalance?`${accountBalance.assetCode} ${accountBalance.availableBalance}`:'Unavailable'}</b><small>Persisted Backend balance · Account {selectedAccount.id}</small></div>
     <form className="transfer-form" onSubmit={transfer}><h3><ArrowRightLeft/> Internal transfer</h3><input value={destinationAccountId} onChange={event=>setDestinationAccountId(event.target.value)} placeholder="Destination wallet account ID" disabled={walletLoading||transferBusy} required/><input value={transferAmount} onChange={event=>setTransferAmount(event.target.value)} inputMode="decimal" pattern="^[0-9]+(?:\\.[0-9]{1,18})?$" placeholder={`Amount in ${selectedAccount.assetCode}`} disabled={walletLoading||transferBusy} required/><button disabled={busy||walletLoading||transferBusy||!accountBalance||selectedAccount.status!=='ACTIVE'||!destinationAccountId.trim()||!transferAmount}>{transferBusy?'Transferring…':'Transfer'}</button></form>
     {transferReceipt&&<div className="transfer-receipt"><div><span>Transfer receipt</span><b>{transferReceipt.status}</b></div><p><span>{transferReceipt.amount} {transferReceipt.assetCode} · {transferReceipt.direction}</span><small>Operation {transferReceipt.id}</small><small>Updated {new Date(transferReceipt.updatedAt).toLocaleString()}</small></p>{!['COMPLETED','FAILED'].includes(transferReceipt.status)&&<button onClick={()=>void refreshTransferStatus()} disabled={busy||transferBusy||transferStatusBusy||transferStatusRefreshCount>=WALLET_TRANSFER_STATUS_REFRESH_LIMIT}>{transferStatusBusy?'Refreshing status…':transferStatusRefreshCount>=WALLET_TRANSFER_STATUS_REFRESH_LIMIT?'Refresh limit reached':`Refresh status (${transferStatusRefreshCount}/${WALLET_TRANSFER_STATUS_REFRESH_LIMIT})`}</button>}</div>}
     <div className="record-list">
      <h3>Customer Wallet history · {selectedAccount.assetCode}</h3>
      <div className="wallet-history-filters">
       <label>Type<select aria-label="Wallet transaction type filter" value={walletTransactionTypeFilter} onChange={event=>changeWalletTransactionFilters({type:event.target.value,status:walletTransactionStatusFilterTarget.current})}><option value="ALL">All</option>{WALLET_TRANSACTION_TYPES.map(type=><option value={type} key={type}>{type}</option>)}</select></label>
       <label>Status<select aria-label="Wallet transaction status filter" value={walletTransactionStatusFilter} onChange={event=>changeWalletTransactionFilters({type:walletTransactionTypeFilterTarget.current,status:event.target.value})}><option value="ALL">All</option>{WALLET_TRANSACTION_STATUSES.map(status=><option value={status} key={status}>{status}</option>)}</select></label>
      </div>
      {walletHistoryError&&<div className="inline-error">{walletHistoryError} · No unvalidated transaction data displayed.</div>}
      {walletHistoryLoading&&<p>Loading Wallet history…</p>}
      {!walletHistoryLoading&&walletTransactions?.items.length?walletTransactions.items.map(row=><button className={`wallet-history-row${selectedWalletTransaction?.id===row.id?' selected':''}`} key={row.id} onClick={()=>void selectWalletTransaction(row)} disabled={walletHistoryLoading||walletTransactionLoadingMore}><span><b>{row.type} · {row.status}</b><small>{row.direction} · {new Date(row.createdAt).toLocaleString()}</small></span><b>{row.amount} {row.assetCode}</b></button>):!walletHistoryLoading&&!walletHistoryError&&<p>No persisted transactions returned.</p>}
      {walletTransactions?.nextCursor&&<button className="load-more" onClick={()=>void loadMoreWalletTransactions()} disabled={busy||walletHistoryLoading||walletTransactionLoadingMore||transferBusy}>{walletTransactionLoadingMore?'Loading more transactions…':'Load more transactions'}</button>}
      {selectedWalletTransaction&&<div className="wallet-transaction-detail"><div className="wallet-transaction-detail-heading"><h4>Selected transaction</h4><button type="button" onClick={refreshSelectedWalletTransaction} disabled={busy||walletTransactionLoadingMore||transferBusy}>{walletTransactionDetailLoading?'Refresh again':'Refresh detail'}</button></div><small>Manual only · one GET per click · no automatic retries.</small>{walletTransactionDetailLoading&&<p>Loading transaction detail…</p>}{walletTransactionDetailError&&<div className="inline-error">{walletTransactionDetailError} · No transaction detail displayed.</div>}{walletTransactionDetail&&<><div><span>Transaction</span><b>{walletTransactionDetail.id}</b></div><div><span>Type</span><b>{walletTransactionDetail.type}</b></div><div><span>Status</span><b>{walletTransactionDetail.status}</b></div><div><span>Direction</span><b>{walletTransactionDetail.direction}</b></div><div><span>Amount</span><b>{walletTransactionDetail.amount} {walletTransactionDetail.assetCode}</b></div><div><span>Created</span><b>{new Date(walletTransactionDetail.createdAt).toLocaleString()}</b></div><div><span>Updated</span><b>{new Date(walletTransactionDetail.updatedAt).toLocaleString()}</b></div></>}</div>}
     </div>
    </>}
   </section>
   <section className="panel">
    <div className="panel-row"><h2><WalletCards/> Real cards</h2><button onClick={reloadCard} disabled={busy||!selectedCard||virtualCardCreating||cardReplacing||cardRenewing}><RefreshCw/> Refresh</button></div>
    {virtualCardDecision.allowed&&<form className="transfer-form" onSubmit={createVirtualCard}><h3><CreditCard/> Create virtual card · {session?.environment}</h3><input value={virtualCardCurrency} onChange={event=>setVirtualCardCurrency(event.target.value.toUpperCase())} placeholder="ISO currency, e.g. USD" pattern="^[A-Z]{3}$" minLength={3} maxLength={3} disabled={virtualCardCreating||cardReplacing||cardRenewing} required/><input value={virtualCardAlias} onChange={event=>setVirtualCardAlias(event.target.value)} placeholder="Alias (optional, max 30 characters)" maxLength={30} disabled={virtualCardCreating||cardReplacing||cardRenewing}/><button disabled={busy||virtualCardCreating||cardReplacing||cardRenewing}>{virtualCardCreating?'Creating once…':'Create virtual card'}</button>{virtualCardCreateError&&<div className="inline-error">{virtualCardCreateError} · No Provider or internal error details displayed.</div>}<p className="card-action-note">One submission, one idempotency key. Automatic retries are disabled.</p></form>}
    {cards.length===0?<p>Unavailable · no cards returned by Backend.</p>:<select value={selectedCard?.id||''} disabled={virtualCardCreating||cardReplacing||cardRenewing} onChange={event=>{const card=cards.find(row=>row.id===event.target.value);if(card)void selectCard(card)}}>{cards.map(card=><option key={card.id} value={card.id}>{card.last4?`•••• ${card.last4}`:card.id} · {card.status}</option>)}</select>}
    {cardListError&&<p className="inline-error">{cardListError} · Current cards remain scoped to this session.</p>}
    {cardRefreshError&&<p className="inline-error">{cardRefreshError} · No partial Card data was applied.</p>}
    {cardNextCursor&&<button className="load-more" onClick={()=>void loadMoreCards()} disabled={busy||cardListLoadingMore||virtualCardCreating||cardReplacing||cardRenewing}>{cardListLoadingMore?'Loading more cards…':'Load more cards'}</button>}
    {selectedCard&&<>
     <div className="balance-record"><CreditCard/><b>{selectedCard.last4?`Card •••• ${selectedCard.last4}`:selectedCard.id}</b><small>Status: {selectedCard.status}</small><small>{cardBalanceLoading?'Loading Card balance…':cardBalance?`Available: ${cardBalance.availableBalanceMinor} minor ${cardBalance.currency}`:'Balance unavailable'}</small>{cardBalance&&<><small>Current: {cardBalance.currentBalanceMinor} minor · Pending: {cardBalance.pendingAmountMinor} minor</small><small>Updated: {new Date(cardBalance.updatedAt).toLocaleString()}</small></>}</div>
     {cardBalanceError&&<div className="inline-error">{cardBalanceError} · No unvalidated or cross-card balance displayed.</div>}
     <button onClick={toggle} disabled={busy||virtualCardCreating||cardReplacing||cardRenewing||!toggleDecision?.allowed} title={toggleDecision?.reason??undefined}><Snowflake/> {toggleDecision?.label??'Card action unavailable'}</button>
     <p className="card-action-note">Manual SANDBOX/TEST action · one bodyless POST per click · no automatic retries.</p>
     {toggleDecision?.reason&&<p className="card-action-note">{toggleDecision.reason}</p>}
     {replacementDecision?.allowed&&<form className="transfer-form" onSubmit={replaceSelectedCard}><h3><RefreshCw/> Replace selected Card · {session?.environment}</h3><select value={cardReplacementReason} onChange={event=>updateCardReplacementReason(event.target.value as CardReplacementReason)} disabled={cardReplacing||virtualCardCreating||cardRenewing}>{CARD_REPLACEMENT_REASONS.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select><button disabled={busy||cardReplacing||virtualCardCreating||cardRenewing}>{cardReplacing?'Replacing once…':'Replace selected Card'}</button>{cardReplacementError&&<div className="inline-error">{cardReplacementError} · No Provider or internal error details displayed.</div>}<p className="card-action-note">Manual SANDBOX/TEST only · one canonical UUIDv4 Idempotency-Key · at most one POST · no automatic retries.</p></form>}
     {renewalDecision?.allowed&&<form className="transfer-form" onSubmit={renewSelectedCard}><h3><RefreshCw/> Renew selected Card · {session?.environment}</h3><button disabled={busy||cardRenewing||virtualCardCreating||cardReplacing}>{cardRenewing?'Renewing once…':'Renew selected Card'}</button>{cardRenewalError&&<div className="inline-error">{cardRenewalError} · No Provider or internal error details displayed.</div>}<p className="card-action-note">Manual SANDBOX/TEST only · one canonical UUIDv4 Idempotency-Key · at most one bodyless POST · no automatic retries.</p></form>}
     <div className="record-list"><div className="panel-row"><h3>Card transactions</h3><button type="button" onClick={()=>void refreshCardTransactions()} disabled={busy||!transactionRefreshAllowed||cardTransactionRefreshAttempt>=CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS} title={transactionRefreshAllowed?'Refresh the current Card and status filter only':'Available only for the current SANDBOX/TEST Card and filter'}><RefreshCw/> {cardTransactionRefreshing?`Refresh again (${cardTransactionRefreshAttempt}/${CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS})`:cardTransactionError&&cardTransactionRefreshAttempt>0?cardTransactionRefreshAttempt>=CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS?'Retry limit reached':`Retry transactions (${cardTransactionRefreshAttempt}/${CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS})`:'Refresh transactions'}</button></div><p className="card-action-note">Manual SANDBOX/TEST GET · current Card and status filter only · at most {CARD_TRANSACTION_REFRESH_MAX_ATTEMPTS} attempts per cycle · no automatic retries.</p><div className="wallet-history-filters"><label>Status<select aria-label="Card transaction status filter" value={cardTransactionFilter} onChange={event=>changeCardTransactionFilter(event.target.value)} disabled={busy||cardTransactionLoadingMore}>{CARD_TRANSACTION_FILTERS.map(filter=><option value={filter} key={filter}>{filter==='ALL'?'All':filter}</option>)}</select></label></div>{cardTransactionRefreshing&&<p>Refreshing current Card transactions… Keeping the last verified snapshot until completion.</p>}{cardTransactionError&&<div className="inline-error">{cardTransactionError} · The verified same-filter state remains unchanged; no unvalidated or cross-filter data displayed.</div>}{cardTransactions.length===0&&!cardTransactionError&&!cardTransactionRefreshing&&<p>No Card transactions match this status.</p>}{cardTransactions.map(transaction=><button type="button" className={`wallet-history-row${selectedCardTransaction?.id===transaction.id?' selected':''}`} key={transaction.id} onClick={()=>selectCardTransactionDetail(transaction)} disabled={busy||cardTransactionLoadingMore}><span><b>{transaction.merchantName??'Card transaction'}</b><small>{transaction.status} · {new Date(transaction.occurredAt).toLocaleString()} {transaction.merchantCategory?`· MCC ${transaction.merchantCategory}`:''}</small></span><b>{transaction.amountMinor} minor {transaction.currency}</b></button>)}{cardTransactionNextCursor&&<button className="load-more" onClick={()=>void loadMoreCardTransactions()} disabled={busy||cardTransactionLoadingMore||cardTransactionRefreshing||virtualCardCreating||cardReplacing||cardRenewing}>{cardTransactionLoadingMore?'Loading more transactions…':'Load more transactions'}</button>}{selectedCardTransaction&&<div className="wallet-transaction-detail"><div className="panel-row"><h4>Selected Card transaction · read only</h4><button type="button" onClick={()=>void refreshSelectedCardTransactionDetail()} disabled={busy||!transactionRefreshAllowed}><RefreshCw/> {cardTransactionDetailRefreshing?'Refresh again':'Refresh detail'}</button></div><small>Manual only · one GET per click · no automatic retries · current unexpired session, Card, status filter and list snapshot only.</small>{cardTransactionDetailRefreshing&&<p>Refreshing selected transaction… Keeping the last verified detail until completion.</p>}{cardTransactionDetailError&&<div className="inline-error">{cardTransactionDetailError} · The last verified detail remains unchanged; no upstream details displayed.</div>}<div><span>Transaction</span><b>{selectedCardTransaction.id}</b></div><div><span>Type (from status)</span><b>{cardTransactionLifecycleType(selectedCardTransaction.status)}</b></div><div><span>Status</span><b>{selectedCardTransaction.status}</b></div><div><span>Amount</span><b>{selectedCardTransaction.amountMinor} minor {selectedCardTransaction.currency}</b></div><div><span>Authorized</span><b>{selectedCardTransaction.authorizedAmountMinor} minor</b></div><div><span>Cleared</span><b>{selectedCardTransaction.clearedAmountMinor} minor</b></div><div><span>Settled</span><b>{selectedCardTransaction.settledAmountMinor} minor</b></div><div><span>Reversed</span><b>{selectedCardTransaction.reversedAmountMinor} minor</b></div><div><span>Refunded</span><b>{selectedCardTransaction.refundedAmountMinor} minor</b></div><div><span>Currency</span><b>{selectedCardTransaction.currency}</b></div><div><span>Merchant</span><b>{selectedCardTransaction.merchantName??'Not provided'}</b></div><div><span>Merchant category</span><b>{selectedCardTransaction.merchantCategory??'Not provided'}</b></div><div><span>Occurred</span><b>{new Date(selectedCardTransaction.occurredAt).toLocaleString()}</b></div><div><span>Trace</span><b>{selectedCardTransaction.traceId??'Not provided'}</b></div></div>}</div>
    </>}
   </section>
   <section className="panel wallet-operation-activity"><div className="panel-row"><div><h2>All-account Wallet activity · read only</h2><p className="card-action-note">Persisted operations for every Wallet account owned by this customer. No asset filter is applied.</p></div><button className="wallet-operation-refresh" onClick={()=>{const scope=session?walletTransferSessionScope(session,walletRuntime.environment):null;if(session&&scope&&scope===walletScope.current)void loadWalletOperations(scope,session,{type:walletOperationTypeFilterTarget.current,status:walletOperationStatusFilterTarget.current})}} disabled={busy||walletOperationsLoading||walletOperationsLoadingMore||walletOperationsRefreshing}>{walletOperationsRefreshing?'Refreshing…':'Refresh activity'}</button></div><div className="wallet-operation-filters"><label>Type<select value={walletOperationTypeFilter} disabled={walletOperationsLoading||walletOperationsLoadingMore||walletOperationsRefreshing} onChange={event=>changeWalletOperationFilters({type:event.target.value as WalletOperationFilterSelection['type']})}><option value="ALL">ALL</option>{WALLET_OPERATION_TYPES.map(type=><option value={type} key={type}>{type}</option>)}</select></label><label>Status<select value={walletOperationStatusFilter} disabled={walletOperationsLoading||walletOperationsLoadingMore||walletOperationsRefreshing} onChange={event=>changeWalletOperationFilters({status:event.target.value as WalletOperationFilterSelection['status']})}><option value="ALL">ALL</option>{WALLET_OPERATION_STATUSES.map(status=><option value={status} key={status}>{status}</option>)}</select></label></div>{walletOperationsError&&<div className="inline-error">{walletOperationsError} · No unvalidated or cross-session activity displayed.</div>}{walletOperationsLoading&&<p>Loading Wallet activity…</p>}{walletOperationsRefreshing&&walletOperations&&<p className="card-action-note">Refreshing once · verified activity remains visible until the GET completes.</p>}<div className="record-list">{!walletOperationsLoading&&walletOperations?.items.length?walletOperations.items.map(operation=><button className={`wallet-history-row${selectedWalletOperation?.id===operation.id?' selected':''}`} key={operation.id} onClick={()=>void selectWalletOperation(operation)} disabled={walletOperationsLoading||walletOperationsLoadingMore||walletOperationsRefreshing}><span><b>{operation.type} · {operation.status}</b><small>{operation.direction} · Created {new Date(operation.createdAt).toLocaleString()}</small><small>{operation.completedAt?`Completed ${new Date(operation.completedAt).toLocaleString()}`:'Not completed'} · Updated {new Date(operation.updatedAt).toLocaleString()}</small><small>Operation {operation.id}</small></span><b>{operation.amount} {operation.assetCode}</b></button>):!walletOperationsLoading&&!walletOperationsError&&<p>No persisted Wallet operations returned.</p>}{walletOperations?.nextCursor&&<button className="load-more" onClick={()=>void loadMoreWalletOperations()} disabled={busy||walletOperationsLoading||walletOperationsLoadingMore||walletOperationsRefreshing}>{walletOperationsLoadingMore?'Loading more activity…':'Load more activity'}</button>}{selectedWalletOperation&&<div className="wallet-transaction-detail"><h4>Selected operation · read only</h4>{walletOperationDetailLoading&&<p>Loading operation detail…</p>}{walletOperationDetailError&&<div className="inline-error">{walletOperationDetailError} · No operation detail displayed.</div>}{walletOperationDetail&&<><div><span>Operation</span><b>{walletOperationDetail.id}</b></div><div><span>Type</span><b>{walletOperationDetail.type}</b></div><div><span>Status</span><b>{walletOperationDetail.status}</b></div><div><span>Direction</span><b>{walletOperationDetail.direction}</b></div><div><span>Amount</span><b>{walletOperationDetail.amount} {walletOperationDetail.assetCode}</b></div><div><span>Created</span><b>{new Date(walletOperationDetail.createdAt).toLocaleString()}</b></div><div><span>Completed</span><b>{walletOperationDetail.completedAt?new Date(walletOperationDetail.completedAt).toLocaleString():'Not completed'}</b></div><div><span>Updated</span><b>{new Date(walletOperationDetail.updatedAt).toLocaleString()}</b></div></>}</div>}</div></section>
   {selectedCard&&<section className="panel card-limits-record"><h2>Card limits · public contract</h2>{cardLimitsLoading&&<p>Loading Card limits…</p>}{cardLimitsError&&<div className="inline-error">{cardLimitsError} · No unvalidated or cross-card limits displayed.</div>}{cardLimits&&<><div><span>Single transaction</span><b>{cardLimits.singleTransactionMinor??'Not set'}</b></div><div><span>Daily spend</span><b>{cardLimits.dailySpendMinor??'Not set'}</b></div><div><span>Monthly spend</span><b>{cardLimits.monthlySpendMinor??'Not set'}</b></div><div><span>Daily ATM</span><b>{cardLimits.dailyAtmMinor??'Not set'}</b></div><small>{cardLimits.updatedAt?`Updated ${new Date(cardLimits.updatedAt).toLocaleString()}`:'No persisted limit update'}</small>{limitsUpdateDecision?.allowed&&<form className="card-limits-update-form" onSubmit={submitSelectedCardLimits}><h3>Update selected Card limits · {session?.environment}</h3>{CARD_LIMIT_UPDATE_FIELDS.map(field=><label key={field}>{field}<input value={cardLimitsUpdateDraftState[field]} onChange={event=>updateCardLimitsDraftValue(field,event.target.value)} inputMode="numeric" pattern="^(?:0|[1-9][0-9]*)$" maxLength={13} placeholder="Not set" disabled={cardLimitsUpdating} /></label>)}<button disabled={busy||cardLimitsUpdating||virtualCardCreating||cardReplacing||cardRenewing||!CARD_LIMIT_UPDATE_FIELDS.some(field=>cardLimitsUpdateDraftState[field]!=='')}>{cardLimitsUpdating?'Updating once…':'Apply limits once'}</button>{cardLimitsUpdateError&&<div className="inline-error">{cardLimitsUpdateError} · No Provider or internal response fields displayed.</div>}<p className="card-action-note">0–{CARD_LIMIT_UPDATE_MAX_MINOR.toLocaleString()} minor units · single ≤ daily ≤ monthly. One manual submission, one new UUIDv4 Idempotency-Key, at most one POST, no automatic retries.</p></form>}</>}</section>}
  </div>}
 </main>
}
