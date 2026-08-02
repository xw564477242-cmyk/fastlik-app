import { useEffect, useRef, useState } from "react";
import {
  createKycStatusRequestIdentity,
  kycStatusFailureCanInvalidateSession,
  kycStatusFailureClearsSnapshot,
  kycStatusRequestIsCurrent,
  kycStatusRequestWasAborted,
  readKycStatus,
  sameOriginKycStatusTransport,
  type KycStatusRecord,
} from "./kycStatus";
import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer";

type Props = Readonly<{
  session: WalletTransferSession;
  runtimeEnvironment: WalletTransferEnvironment | undefined;
}>;

type ScopedSnapshot = Readonly<{
  scopeKey: string;
  sessionGeneration: number;
  record: KycStatusRecord;
}>;

const statusLabel = (status: KycStatusRecord["status"]): string => {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Pending review";
};

export function KycStatusPanel({ session, runtimeEnvironment }: Props) {
  const scopeKey = walletTransferSessionScope(session, runtimeEnvironment);
  const sessionRef = useRef(session);
  const sessionIdentityRef = useRef(session);
  const sessionGenerationRef = useRef(1);
  const scopeRef = useRef(scopeKey);
  const mountedRef = useRef(false);
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const [snapshot, setSnapshot] = useState<ScopedSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  if (sessionIdentityRef.current !== session) {
    sessionIdentityRef.current = session;
    sessionGenerationRef.current += 1;
  }
  sessionRef.current = session;
  scopeRef.current = scopeKey;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequence.current += 1;
      inFlightRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    requestSequence.current += 1;
    inFlightRef.current = false;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSnapshot(null);
    setRefreshing(false);
    setError("");
  }, [scopeKey, session]);

  const refresh = async () => {
    const activeSession = sessionRef.current;
    const expectedSessionGeneration = sessionGenerationRef.current;
    const expectedScope = walletTransferSessionScope(activeSession, runtimeEnvironment);
    if (!expectedScope || expectedScope !== scopeRef.current || inFlightRef.current) return;

    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    inFlightRef.current = true;
    const request = createKycStatusRequestIdentity(
      ++requestSequence.current,
      expectedScope,
      expectedSessionGeneration,
    );
    const isCurrent = () =>
      controllerRef.current === controller &&
      !controller.signal.aborted &&
      sessionRef.current === activeSession &&
      sessionGenerationRef.current === expectedSessionGeneration &&
      walletTransferSessionScope(sessionRef.current, runtimeEnvironment) === expectedScope &&
      kycStatusRequestIsCurrent(
        request,
        requestSequence.current,
        scopeRef.current,
        sessionGenerationRef.current,
        mountedRef.current,
      );

    setRefreshing(true);
    setError("");
    try {
      const record = await readKycStatus(
        sameOriginKycStatusTransport,
        activeSession,
        runtimeEnvironment,
        expectedScope,
        controller.signal,
      );
      if (isCurrent()) setSnapshot(Object.freeze({
        scopeKey: expectedScope,
        sessionGeneration: expectedSessionGeneration,
        record,
      }));
    } catch (value) {
      const current = isCurrent();
      if (current && !kycStatusRequestWasAborted(value)) {
        const clearSnapshot = kycStatusFailureClearsSnapshot(value, current, controller.signal);
        if (clearSnapshot) setSnapshot(null);
        if (kycStatusFailureCanInvalidateSession(value, current, controller.signal)) {
          controllerRef.current = null;
          inFlightRef.current = false;
          setSnapshot(null);
          setRefreshing(false);
          setError("");
          window.dispatchEvent(new CustomEvent("fastlink:session-invalid", { detail: value }));
          return;
        }
        setError(clearSnapshot
          ? "KYC status is unavailable for this session. No prior KYC snapshot is displayed."
          : "KYC status is temporarily unavailable for this session. The last verified same-session snapshot remains unchanged.");
      }
    } finally {
      if (isCurrent()) {
        controllerRef.current = null;
        inFlightRef.current = false;
        setRefreshing(false);
      }
    }
  };

  const visibleSnapshot = snapshot?.scopeKey === scopeKey &&
    snapshot.sessionGeneration === sessionGenerationRef.current
    ? snapshot.record
    : null;

  return (
    <section className="panel kyc-status-panel">
      <div className="panel-row">
        <div>
          <h2>KYC status · read only</h2>
          <p className="card-action-note">
            Current authenticated customer and environment only. Manual same-origin GET; no Provider call or upload.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={!scopeKey || refreshing}>
          {refreshing ? "Refreshing…" : "Refresh KYC"}
        </button>
      </div>
      {!scopeKey && (
        <p className="card-action-note">Unavailable outside a matching, unexpired SANDBOX or TEST session.</p>
      )}
      {error && (
        <div className="inline-error">{error}</div>
      )}
      {refreshing && visibleSnapshot && (
        <p className="card-action-note">Refreshing once; keeping the last verified snapshot until completion.</p>
      )}
      {visibleSnapshot ? (
        <div className="balance-record">
          <b>{statusLabel(visibleSnapshot.status)}</b>
          <small>Status: {visibleSnapshot.status}</small>
          <small>
            {visibleSnapshot.reviewedAt
              ? `Reviewed ${new Date(visibleSnapshot.reviewedAt).toLocaleString()}`
              : "Not reviewed"}
          </small>
        </div>
      ) : (
        scopeKey && !refreshing && !error && <p>No verified KYC status loaded.</p>
      )}
    </section>
  );
}
