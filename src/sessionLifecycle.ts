export class SessionValidationError extends Error {}

type HttpLikeError = Readonly<{ status: number; message?: string }>;

const SESSION_INVALIDATION_MESSAGE =
  /\b(session(?:\s+has\s+been|\s+is)?\s+(?:expired|revoked|invalid)|(?:account|user|tenant)(?:\s+is)?\s+disabled|environment\s+mismatch)\b/i;

function httpLikeError(value: unknown): HttpLikeError | null {
  if (!value || typeof value !== "object") return null;
  const statusDescriptor = Object.getOwnPropertyDescriptor(value, "status");
  if (!statusDescriptor || !("value" in statusDescriptor) || typeof statusDescriptor.value !== "number")
    return null;
  const messageDescriptor = Object.getOwnPropertyDescriptor(value, "message");
  const message = messageDescriptor && "value" in messageDescriptor && typeof messageDescriptor.value === "string"
    ? messageDescriptor.value
    : undefined;
  return { status: statusDescriptor.value, message };
}

function failureRequiresClear(value: unknown, visited: Set<object>): boolean {
  if (value instanceof SessionValidationError) return true;
  if (value && typeof value === "object") {
    if (visited.has(value)) return false;
    visited.add(value);
  }
  const error = httpLikeError(value);
  if (error?.status === 401) return true;
  if (error?.status === 403 && SESSION_INVALIDATION_MESSAGE.test(error.message ?? "")) return true;
  const causeDescriptor = value && typeof value === "object"
    ? Object.getOwnPropertyDescriptor(value, "cause")
    : undefined;
  return Boolean(causeDescriptor && "value" in causeDescriptor && failureRequiresClear(causeDescriptor.value, visited));
}

export function sessionFailureRequiresClear(value: unknown): boolean {
  return failureRequiresClear(value, new Set());
}

export type SessionInitializationRequest = Readonly<{
  requestId: number;
  scopeKey: string;
}>;

export function createSessionInitializationRequest(
  requestId: number,
  scopeKey: string,
): SessionInitializationRequest {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length === 0 || scopeKey.length > 4096)
    throw new Error("Invalid session initialization request");
  return Object.freeze({ requestId, scopeKey });
}

export function sessionInitializationRequestIsCurrent(
  request: SessionInitializationRequest,
  currentRequestId: number,
  currentScopeKey: string | null,
  mounted: boolean,
): boolean {
  return Boolean(
    mounted &&
      request.requestId === currentRequestId &&
      request.scopeKey === currentScopeKey,
  );
}

export async function runSessionInitializationModule<T>(input: Readonly<{
  load: () => Promise<T>;
  isCurrent: () => boolean;
  commit: (value: T) => void;
  moduleError: (value: unknown) => void;
  sessionInvalid: (value: unknown) => void;
}>): Promise<void> {
  try {
    const value = await input.load();
    if (input.isCurrent()) input.commit(value);
  } catch (value) {
    if (!input.isCurrent()) return;
    if (sessionFailureRequiresClear(value)) input.sessionInvalid(value);
    else input.moduleError(value);
  }
}
