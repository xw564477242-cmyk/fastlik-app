import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const KYC_STATUS_PATH = "/api/v1/kyc/status";
export const KYC_STATUS_RESPONSE_MAX_BYTES = 4_096;
export const KYC_STATUS_REQUEST_DEADLINE_MS = 20_000;
export const KYC_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];
export type KycStatusRecord = Readonly<{
  status: KycStatus;
  reviewedAt: string | null;
}>;

export type KycStatusTransportRequest = Readonly<{
  path: typeof KYC_STATUS_PATH;
  method: "GET";
  credentials: "include";
  signal: AbortSignal;
}>;

export type KycStatusTransport = (
  request: KycStatusTransportRequest,
) => Promise<unknown>;

export type KycStatusRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
  sessionGeneration: number;
}>;

export class KycStatusError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status = 0,
  ) {
    super(message);
    this.status = status;
  }
}

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function validRfc3339(value: unknown): value is string {
  if (typeof value !== "string" || !RFC3339.test(value)) return false;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return false;
  const [date] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() === month - 1 &&
    normalized.getUTCDate() === day
  );
}

function rejectDuplicateTopLevelKeys(raw: string): void {
  const keys = new Set<string>();
  let depth = 0;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === "{" || character === "[") {
      depth += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      depth -= 1;
      continue;
    }
    if (character !== '"') continue;
    const start = index;
    index += 1;
    while (index < raw.length) {
      if (raw[index] === "\\") {
        index += 2;
        continue;
      }
      if (raw[index] === '"') break;
      index += 1;
    }
    if (index >= raw.length) return;
    let cursor = index + 1;
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (depth !== 1 || raw[cursor] !== ":") continue;
    let key: string;
    try {
      key = JSON.parse(raw.slice(start, index + 1)) as string;
    } catch {
      return;
    }
    if (keys.has(key)) throw new KycStatusError("Duplicate KYC status response field");
    keys.add(key);
  }
}

export function parseKycStatusJson(raw: string): KycStatusRecord {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > KYC_STATUS_RESPONSE_MAX_BYTES)
    throw new KycStatusError("KYC status response is too large");
  rejectDuplicateTopLevelKeys(raw);
  try {
    return parseKycStatus(JSON.parse(raw) as unknown);
  } catch (value) {
    if (value instanceof KycStatusError) throw value;
    throw new KycStatusError("Invalid KYC status JSON response");
  }
}

export function parseKycStatus(value: unknown): KycStatusRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new KycStatusError("Invalid KYC status response");
  if (Object.getPrototypeOf(value) !== Object.prototype)
    throw new KycStatusError("Invalid KYC status response object");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== 2 || keys[0] !== "reviewedAt" || keys[1] !== "status")
    throw new KycStatusError("KYC status response must contain exactly status and reviewedAt");
  const statusDescriptor = descriptors.status;
  const reviewedAtDescriptor = descriptors.reviewedAt;
  if (!("value" in statusDescriptor) || !("value" in reviewedAtDescriptor))
    throw new KycStatusError("Invalid KYC status response fields");
  if (!(KYC_STATUSES as readonly unknown[]).includes(statusDescriptor.value))
    throw new KycStatusError("Invalid KYC status");
  if (reviewedAtDescriptor.value !== null && !validRfc3339(reviewedAtDescriptor.value))
    throw new KycStatusError("Invalid KYC reviewedAt");
  return Object.freeze({
    status: statusDescriptor.value as KycStatus,
    reviewedAt: reviewedAtDescriptor.value as string | null,
  });
}

export function createKycStatusRequestIdentity(
  requestId: number,
  scopeKey: string,
  sessionGeneration: number,
): KycStatusRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1)
    throw new KycStatusError("Invalid KYC status request id");
  if (typeof scopeKey !== "string" || scopeKey.length === 0 || scopeKey.length > 4_096)
    throw new KycStatusError("Invalid KYC status scope");
  if (!Number.isSafeInteger(sessionGeneration) || sessionGeneration < 1)
    throw new KycStatusError("Invalid KYC status session generation");
  return Object.freeze({ requestId, scopeKey, sessionGeneration });
}

export function kycStatusRequestIsCurrent(
  request: KycStatusRequestIdentity,
  currentRequestId: number,
  currentScopeKey: string | null,
  currentSessionGeneration: number,
  mounted: boolean,
): boolean {
  return (
    mounted &&
    request.requestId === currentRequestId &&
    request.scopeKey === currentScopeKey &&
    request.sessionGeneration === currentSessionGeneration
  );
}

export function kycStatusRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

function kycStatusFailureStatus(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  try {
    const status = Object.getOwnPropertyDescriptor(value, "status");
    return status && "value" in status && typeof status.value === "number"
      ? status.value
      : null;
  } catch {
    return null;
  }
}

export function kycStatusFailureClearsSnapshot(
  value: unknown,
  isCurrent: boolean,
  signal: AbortSignal,
): boolean {
  if (!isCurrent || signal.aborted) return false;
  const status = kycStatusFailureStatus(value);
  return status === 401 || status === 403 || status === 404;
}

export function kycStatusFailureCanInvalidateSession(
  value: unknown,
  isCurrent: boolean,
  signal: AbortSignal,
): boolean {
  return isCurrent && !signal.aborted && kycStatusFailureStatus(value) === 401;
}

function throwIfKycStatusRequestAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("KYC status request cancelled", "AbortError");
}

export async function readKycStatus(
  transport: KycStatusTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment | undefined,
  expectedScopeKey: string,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<KycStatusRecord> {
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new KycStatusError("KYC status is unavailable for this session");
  throwIfKycStatusRequestAborted(signal);
  const value = await transport({
    path: KYC_STATUS_PATH,
    method: "GET",
    credentials: "include",
    signal,
  });
  throwIfKycStatusRequestAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== expectedScopeKey)
    throw new KycStatusError("KYC status session changed before completion");
  return parseKycStatus(value);
}

export async function sameOriginKycStatusTransport(
  request: KycStatusTransportRequest,
): Promise<unknown> {
  if (
    request.path !== KYC_STATUS_PATH ||
    request.method !== "GET" ||
    request.credentials !== "include"
  )
    throw new KycStatusError("Invalid KYC status request");

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (request.signal.aborted) cancel();
  else request.signal.addEventListener("abort", cancel, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, KYC_STATUS_REQUEST_DEADLINE_MS);

  try {
    const response = await fetch(request.path, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      throw new KycStatusError("KYC status request failed", response.status);
    return parseKycStatusJson(await response.text());
  } catch (value) {
    if (value instanceof KycStatusError) throw value;
    if (value instanceof DOMException && value.name === "AbortError" && timedOut)
      throw new KycStatusError("KYC status request timed out", 408);
    if (value instanceof DOMException && value.name === "AbortError") throw value;
    throw new KycStatusError("KYC status request unavailable");
  } finally {
    window.clearTimeout(timeout);
    request.signal.removeEventListener("abort", cancel);
  }
}
