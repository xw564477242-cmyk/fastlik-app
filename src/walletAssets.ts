import type { WalletAccountTransactionHistoryState } from "./walletTransactions.ts";
import type { WalletBalanceSummary, WalletBalanceSummaryItem } from "./walletBalanceSummary.ts";
import type { WalletAccountRecord } from "./walletData.ts";
import {
  walletTransferSessionScope,
  type WalletTransferEnvironment,
  type WalletTransferSession,
} from "./walletTransfer.ts";

export const WALLET_ASSET_CATALOG_PATH = "/v1/wallet/assets";
export const WALLET_ASSET_CATALOG_MAX_ITEMS = 50;
export const WALLET_ASSET_CATALOG_MAX_JSON_BYTES = 4_096;
export const WALLET_ASSET_CATALOG_MAX_JSON_DEPTH = 8;

export const WALLET_ASSET_CLASSES = ["FIAT", "DIGITAL"] as const;
export type WalletAssetClass = (typeof WALLET_ASSET_CLASSES)[number];
export type WalletAssetEnvironment = Extract<WalletTransferEnvironment, "SANDBOX" | "TEST">;

export type WalletAssetMetadata = Readonly<{
  assetCode: string;
  assetClass: WalletAssetClass;
}>;

export type WalletAssetCatalog = Readonly<{
  environment: WalletAssetEnvironment;
  items: readonly WalletAssetMetadata[];
}>;

export type ClassifiedWalletBalance = Readonly<WalletBalanceSummaryItem & {
  assetClass: WalletAssetClass;
}>;

export type WalletAssetCatalogTransportRequest = Readonly<{
  path: typeof WALLET_ASSET_CATALOG_PATH;
  method: "GET";
  signal?: AbortSignal;
}>;

export type WalletAssetCatalogTransport = (
  request: WalletAssetCatalogTransportRequest,
) => Promise<string>;

export type WalletAssetCatalogRequestIdentity = Readonly<{
  requestId: number;
  scopeKey: string;
}>;

export type WalletAssetCatalogInitialization = Readonly<{
  controller: AbortController;
  request: WalletAssetCatalogRequestIdentity;
}>;

const responseFields = new Set(["environment", "items"]);
const itemFields = new Set(["assetCode", "assetClass"]);
type OwnData = Readonly<Record<string, PropertyDescriptor>>;

function invalid(label: string): never {
  throw new Error(`Invalid Wallet asset catalog ${label}`);
}

function rejectDuplicateJsonObjectKeys(raw: string): void {
  let index = 0;
  const malformed = () => new Error("Invalid Wallet asset catalog raw JSON");
  const skipWhitespace = () => {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index])) index += 1;
  };
  const readString = (): string => {
    const start = index;
    if (raw[index] !== '"') throw malformed();
    index += 1;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        try {
          const value = JSON.parse(raw.slice(start, index)) as unknown;
          if (typeof value !== "string") throw malformed();
          return value;
        } catch {
          throw malformed();
        }
      }
      if (code <= 0x1f) throw malformed();
      if (code === 0x5c) {
        index += 1;
        if (index >= raw.length) throw malformed();
        if (raw[index] === "u") {
          if (!/^[0-9A-Fa-f]{4}$/.test(raw.slice(index + 1, index + 5))) throw malformed();
          index += 5;
        } else index += 1;
      } else index += 1;
    }
    throw malformed();
  };
  const parseValue = (depth: number): void => {
    if (depth > WALLET_ASSET_CATALOG_MAX_JSON_DEPTH) throw malformed();
    skipWhitespace();
    if (raw[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (raw[index] === "}") {
        index += 1;
        return;
      }
      while (index < raw.length) {
        const key = readString();
        if (keys.has(key)) throw new Error("Duplicate Wallet asset catalog JSON object key");
        keys.add(key);
        skipWhitespace();
        if (raw[index] !== ":") throw malformed();
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") throw malformed();
        index += 1;
        skipWhitespace();
      }
      throw malformed();
    }
    if (raw[index] === "[") {
      index += 1;
      skipWhitespace();
      if (raw[index] === "]") {
        index += 1;
        return;
      }
      while (index < raw.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (raw[index] === "]") {
          index += 1;
          return;
        }
        if (raw[index] !== ",") throw malformed();
        index += 1;
        skipWhitespace();
      }
      throw malformed();
    }
    if (raw[index] === '"') {
      readString();
      return;
    }
    for (const literal of ["true", "false", "null"]) {
      if (raw.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(index));
    if (!number) throw malformed();
    index += number[0].length;
  };
  skipWhitespace();
  parseValue(0);
  skipWhitespace();
  if (index !== raw.length) throw malformed();
}

function ordinaryOwnData(value: unknown, allowed: ReadonlySet<string>, label: string): OwnData {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(label);
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid(label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) => typeof key !== "string" || !allowed.has(key),
    )
  ) invalid(`${label} fields`);
  if (
    Object.values(descriptors).some(
      (descriptor) => !("value" in descriptor),
    )
  ) invalid(`${label} fields`);
  return descriptors;
}

const valueOf = (source: OwnData, key: string): unknown => source[key]?.value;

function parseItem(value: unknown): WalletAssetMetadata {
  const source = ordinaryOwnData(value, itemFields, "item");
  const assetCode = valueOf(source, "assetCode");
  const assetClass = valueOf(source, "assetClass");
  if (typeof assetCode !== "string" || !/^[A-Z0-9]{2,12}$/.test(assetCode)) {
    invalid("assetCode");
  }
  if (assetClass !== "FIAT" && assetClass !== "DIGITAL") invalid("assetClass");
  return Object.freeze({ assetCode, assetClass });
}

export function parseWalletAssetCatalog(
  rawJson: unknown,
  expectedEnvironment: WalletAssetEnvironment,
): WalletAssetCatalog {
  if (
    typeof rawJson !== "string" ||
    rawJson.length > WALLET_ASSET_CATALOG_MAX_JSON_BYTES ||
    new TextEncoder().encode(rawJson).byteLength > WALLET_ASSET_CATALOG_MAX_JSON_BYTES
  ) invalid("raw JSON size");
  rejectDuplicateJsonObjectKeys(rawJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    invalid("raw JSON");
  }
  const source = ordinaryOwnData(parsed, responseFields, "response");
  const environment = valueOf(source, "environment");
  if (
    (environment !== "SANDBOX" && environment !== "TEST") ||
    environment !== expectedEnvironment
  ) invalid("environment");
  const rawItems = valueOf(source, "items");
  if (
    !Array.isArray(rawItems) ||
    rawItems.length < 1 ||
    rawItems.length > WALLET_ASSET_CATALOG_MAX_ITEMS
  ) invalid("items");
  const descriptors = Object.getOwnPropertyDescriptors(rawItems);
  if (Reflect.ownKeys(descriptors).length !== rawItems.length + 1) invalid("items fields");
  for (let index = 0; index < rawItems.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor)) invalid("items fields");
  }
  const items = rawItems.map(parseItem);
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1].assetCode >= items[index].assetCode) invalid("asset order");
  }
  return Object.freeze({ environment, items: Object.freeze(items) });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Wallet asset catalog request cancelled", "AbortError");
  }
}

export function walletAssetCatalogRequestWasAborted(value: unknown): boolean {
  return value instanceof DOMException && value.name === "AbortError";
}

export async function readWalletAssetCatalog(
  transport: WalletAssetCatalogTransport,
  session: WalletTransferSession,
  runtimeEnvironment: WalletTransferEnvironment,
  expectedScopeKey: string,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<WalletAssetCatalog> {
  const scopeKey = walletTransferSessionScope(session, runtimeEnvironment, now());
  if (
    !scopeKey ||
    scopeKey !== expectedScopeKey ||
    (runtimeEnvironment !== "SANDBOX" && runtimeEnvironment !== "TEST")
  ) throw new Error("Wallet asset catalog is unavailable for this session");
  throwIfAborted(signal);
  const raw = await transport({ path: WALLET_ASSET_CATALOG_PATH, method: "GET", signal });
  throwIfAborted(signal);
  if (walletTransferSessionScope(session, runtimeEnvironment, now()) !== scopeKey) {
    throw new Error("Wallet asset catalog session expired during the request");
  }
  return parseWalletAssetCatalog(raw, runtimeEnvironment);
}

export function createWalletAssetCatalogRequestIdentity(
  requestId: number,
  scopeKey: string,
): WalletAssetCatalogRequestIdentity {
  if (!Number.isSafeInteger(requestId) || requestId < 1 || scopeKey.length < 1 || scopeKey.length > 4_096) {
    throw new Error("Invalid Wallet asset catalog request identity");
  }
  return Object.freeze({ requestId, scopeKey });
}

export function beginWalletAssetCatalogSessionInitialization(input: Readonly<{
  scopeKey: string;
  invalidateAndClear: () => void;
  requestSequence: { current: number };
  activeController: { current: AbortController | null };
}>): WalletAssetCatalogInitialization {
  input.invalidateAndClear();
  const controller = new AbortController();
  input.activeController.current = controller;
  const request = createWalletAssetCatalogRequestIdentity(
    ++input.requestSequence.current,
    input.scopeKey,
  );
  return Object.freeze({ controller, request });
}

export function walletAssetCatalogRequestIsCurrent(
  request: WalletAssetCatalogRequestIdentity,
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

function ownedAssetCodes(accounts: readonly WalletAccountRecord[]): ReadonlySet<string> {
  return new Set(accounts.map((account) => account.assetCode));
}

function metadataByCode(catalog: WalletAssetCatalog): ReadonlyMap<string, WalletAssetMetadata> {
  return new Map(catalog.items.map((item) => [item.assetCode, item]));
}

export function walletAssetClassForOwnedAsset(
  catalog: WalletAssetCatalog | null,
  accounts: readonly WalletAccountRecord[],
  assetCode: string,
): WalletAssetClass | null {
  if (!catalog || !ownedAssetCodes(accounts).has(assetCode)) return null;
  return metadataByCode(catalog).get(assetCode)?.assetClass ?? null;
}

export function classifyOwnedWalletBalances(
  catalog: WalletAssetCatalog | null,
  accounts: readonly WalletAccountRecord[],
  summary: WalletBalanceSummary | null,
): readonly ClassifiedWalletBalance[] | null {
  if (!catalog || !summary) return null;
  const owned = ownedAssetCodes(accounts);
  const metadata = metadataByCode(catalog);
  const classified: ClassifiedWalletBalance[] = [];
  for (const item of summary.items) {
    const assetClass = metadata.get(item.assetCode)?.assetClass;
    if (!owned.has(item.assetCode) || !assetClass) return null;
    classified.push(Object.freeze({ ...item, assetClass }));
  }
  return Object.freeze(classified);
}

export function walletAssetClassForOwnedHistory(
  catalog: WalletAssetCatalog | null,
  accounts: readonly WalletAccountRecord[],
  account: WalletAccountRecord | null,
  history: WalletAccountTransactionHistoryState | null,
): WalletAssetClass | null {
  if (
    !account ||
    !history ||
    history.accountId !== account.id ||
    !accounts.some((candidate) => candidate.id === account.id && candidate.assetCode === account.assetCode) ||
    history.items.some((item) => item.assetCode !== account.assetCode)
  ) return null;
  return walletAssetClassForOwnedAsset(catalog, accounts, account.assetCode);
}
