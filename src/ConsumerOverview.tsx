import { Activity, CreditCard, Landmark, ShieldCheck, WalletCards } from "lucide-react";
import type {
  WalletAccountRecord,
  WalletBalanceSummary,
  WalletOperationPage,
  WalletSession,
} from "./apiClient";
import type { CardRecord } from "./cardList";
import { createConsumerOverviewSnapshot } from "./consumerOverviewState";

type Props = Readonly<{
  session: WalletSession;
  summary: WalletBalanceSummary | null;
  summaryLoading: boolean;
  summaryUnavailable: boolean;
  accounts: readonly WalletAccountRecord[];
  selectedAccount: WalletAccountRecord | null;
  cards: readonly CardRecord[];
  selectedCard: CardRecord | null;
  operations: WalletOperationPage | null;
  operationsLoading: boolean;
  operationsUnavailable: boolean;
}>;

export function ConsumerOverview(props: Props) {
  const snapshot = createConsumerOverviewSnapshot(
    props.summary,
    props.accounts,
    props.selectedAccount,
    props.cards,
    props.selectedCard,
    props.operations,
  );

  return (
    <section className="consumer-overview" aria-labelledby="consumer-overview-title">
      <div className="consumer-overview-heading">
        <div>
          <span>Consumer wallet · {props.session.environment}</span>
          <h2 id="consumer-overview-title">Your verified FastLink snapshot</h2>
          <p>Current Backend data only. Amounts from different assets are never combined.</p>
        </div>
        <ShieldCheck aria-hidden="true" />
      </div>

      <nav className="consumer-overview-nav" aria-label="Wallet sections">
        <a href="#wallet-assets"><Landmark aria-hidden="true" />Assets</a>
        <a href="#wallet-cards"><WalletCards aria-hidden="true" />Cards</a>
        <a href="#wallet-activity"><Activity aria-hidden="true" />Activity</a>
        <a href="#wallet-kyc"><ShieldCheck aria-hidden="true" />KYC</a>
      </nav>

      <div className="consumer-overview-balances" aria-live="polite">
        {props.summaryLoading && !snapshot.balances.length ? (
          <p>Loading verified balances…</p>
        ) : snapshot.balances.length ? (
          snapshot.balances.map((balance) => (
            <article key={balance.assetCode}>
              <span>{balance.assetCode} available</span>
              <strong>{balance.availableBalance}</strong>
              <small>Ledger {balance.ledgerBalance} · Pending {balance.pendingBalance}</small>
            </article>
          ))
        ) : props.summaryUnavailable ? (
          <p>Verified balances are unavailable.</p>
        ) : (
          <p>No persisted Wallet balances returned.</p>
        )}
      </div>
      {props.summaryUnavailable && snapshot.balances.length > 0 && (
        <p className="consumer-overview-note">Showing only the last verified current-session balance snapshot.</p>
      )}

      <div className="consumer-overview-context">
        <article>
          <Landmark aria-hidden="true" />
          <div>
            <span>Selected Wallet</span>
            <b>{snapshot.selectedAccount
              ? `${snapshot.selectedAccount.availableBalance} ${snapshot.selectedAccount.assetCode}`
              : "No current Wallet selection"}</b>
            <small>{snapshot.selectedAccount?.name ?? "Select a persisted account below"}</small>
          </div>
        </article>
        <article>
          <CreditCard aria-hidden="true" />
          <div>
            <span>Selected Card · {snapshot.loadedCardCount} loaded</span>
            <b>{snapshot.selectedCard
              ? snapshot.selectedCard.last4
                ? `•••• ${snapshot.selectedCard.last4}`
                : snapshot.selectedCard.id
              : "No current Card selection"}</b>
            <small>{snapshot.selectedCard
              ? `${snapshot.selectedCard.status} · ${snapshot.selectedCard.currency}`
              : "Select a persisted Card below"}</small>
          </div>
        </article>
      </div>

      <div className="consumer-overview-activity" aria-live="polite">
        <div>
          <h3>Recent verified activity</h3>
          <a href="#wallet-activity">View all</a>
        </div>
        {props.operationsLoading && !snapshot.recentOperations.length ? (
          <p>Loading verified activity…</p>
        ) : snapshot.recentOperations.length ? (
          snapshot.recentOperations.map((operation) => (
            <article key={operation.id}>
              <span><b>{operation.type}</b><small>{operation.status} · {operation.direction}</small></span>
              <strong>{operation.amount} {operation.assetCode}</strong>
            </article>
          ))
        ) : props.operationsUnavailable ? (
          <p>Verified activity is unavailable.</p>
        ) : (
          <p>No persisted Wallet operations returned.</p>
        )}
        {props.operationsUnavailable && snapshot.recentOperations.length > 0 && (
          <p className="consumer-overview-note">Showing only the last verified current-session activity snapshot.</p>
        )}
      </div>
    </section>
  );
}
