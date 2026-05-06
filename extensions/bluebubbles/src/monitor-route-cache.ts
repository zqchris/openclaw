import { normalizeOptionalString } from "openclaw/plugin-sdk/text-runtime";

const RECENT_ROUTE_CONTEXT_MAX = 2000;
const RECENT_ROUTE_CONTEXT_TTL_MS = 6 * 60 * 60 * 1000;

type BlueBubblesRouteContextCarrier = {
  messageId?: string;
  associatedMessageGuid?: string;
  isGroup: boolean;
  chatGuid?: string;
  chatIdentifier?: string;
  chatId?: number;
  chatName?: string;
};

type BlueBubblesRouteContextEntry = {
  isGroup: boolean;
  chatGuid?: string;
  chatIdentifier?: string;
  chatId?: number;
  chatName?: string;
  timestamp: number;
};

const recentRouteContexts = new Map<string, BlueBubblesRouteContextEntry>();

function normalizeFiniteChatId(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hasRouteScope(value: {
  chatGuid?: string;
  chatIdentifier?: string;
  chatId?: number;
}): boolean {
  return Boolean(
    normalizeOptionalString(value.chatGuid) ||
    normalizeOptionalString(value.chatIdentifier) ||
    normalizeFiniteChatId(value.chatId) !== undefined,
  );
}

function routeCacheKey(accountId: string, messageId: string): string {
  return `${accountId}\0${messageId}`;
}

function routeCacheMessageIds(message: BlueBubblesRouteContextCarrier): string[] {
  const ids = [
    normalizeOptionalString(message.messageId),
    normalizeOptionalString(message.associatedMessageGuid),
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

function pruneRecentRouteContexts(now: number): void {
  const cutoff = now - RECENT_ROUTE_CONTEXT_TTL_MS;
  for (const [key, entry] of recentRouteContexts) {
    if (entry.timestamp >= cutoff) {
      break;
    }
    recentRouteContexts.delete(key);
  }

  while (recentRouteContexts.size > RECENT_ROUTE_CONTEXT_MAX) {
    const oldest = recentRouteContexts.keys().next().value;
    if (!oldest) {
      break;
    }
    recentRouteContexts.delete(oldest);
  }
}

function rememberRecentRouteContext(params: {
  accountId: string;
  message: BlueBubblesRouteContextCarrier;
  now: number;
}): void {
  const messageIds = routeCacheMessageIds(params.message);
  if (messageIds.length === 0 || !hasRouteScope(params.message)) {
    return;
  }

  for (const messageId of messageIds) {
    const key = routeCacheKey(params.accountId, messageId);
    recentRouteContexts.delete(key);
    recentRouteContexts.set(key, {
      isGroup: params.message.isGroup,
      chatGuid: normalizeOptionalString(params.message.chatGuid),
      chatIdentifier: normalizeOptionalString(params.message.chatIdentifier),
      chatId: normalizeFiniteChatId(params.message.chatId),
      chatName: normalizeOptionalString(params.message.chatName),
      timestamp: params.now,
    });
  }
  pruneRecentRouteContexts(params.now);
}

function applyRecentRouteContext<T extends BlueBubblesRouteContextCarrier>(params: {
  accountId: string;
  message: T;
  now?: number;
}): { message: T; restored: boolean } {
  const now = params.now ?? Date.now();
  pruneRecentRouteContexts(now);

  const messageIds = routeCacheMessageIds(params.message);
  if (messageIds.length === 0) {
    return { message: params.message, restored: false };
  }

  const cached = messageIds
    .map((messageId) => recentRouteContexts.get(routeCacheKey(params.accountId, messageId)))
    .find((entry): entry is BlueBubblesRouteContextEntry => Boolean(entry));
  const incomingHasRouteScope = hasRouteScope(params.message);
  const shouldRestore =
    Boolean(cached && hasRouteScope(cached)) &&
    (!incomingHasRouteScope || params.message.isGroup !== cached?.isGroup);
  if (!cached || !shouldRestore) {
    rememberRecentRouteContext({
      accountId: params.accountId,
      message: params.message,
      now,
    });
    return { message: params.message, restored: false };
  }

  const restored = {
    ...params.message,
    isGroup: cached.isGroup,
    chatGuid: normalizeOptionalString(params.message.chatGuid) ?? cached.chatGuid,
    chatIdentifier: normalizeOptionalString(params.message.chatIdentifier) ?? cached.chatIdentifier,
    chatId: normalizeFiniteChatId(params.message.chatId) ?? cached.chatId,
    chatName: normalizeOptionalString(params.message.chatName) ?? cached.chatName,
  } as T;

  rememberRecentRouteContext({
    accountId: params.accountId,
    message: restored,
    now,
  });
  return { message: restored, restored: true };
}

export function applyBlueBubblesRecentMessageRouteContext<
  T extends BlueBubblesRouteContextCarrier,
>(params: { accountId: string; message: T; now?: number }): { message: T; restored: boolean } {
  return applyRecentRouteContext(params);
}

export function _resetBlueBubblesRecentRouteContextCacheForTest(): void {
  recentRouteContexts.clear();
}
