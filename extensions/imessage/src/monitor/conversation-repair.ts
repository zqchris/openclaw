import type { IMessageRpcClient } from "../client.js";
import type { IMessageAttachment, IMessagePayload } from "./types.js";

const REPAIR_CHAT_LIST_LIMIT = 25;
const REPAIR_HISTORY_LIMIT = 10;
const REPAIR_MAX_TIME_DELTA_MS = 10 * 60 * 1000;

type IMessageConversationRepairResult =
  | { kind: "unchanged"; message: IMessagePayload }
  | { kind: "repaired"; message: IMessagePayload; chatId: number }
  | { kind: "drop"; reason: string };

type IMessageConversationRepairClient = Pick<IMessageRpcClient, "request">;

type ChatCandidate = {
  id: number;
  lastMessageAtMs?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseTimestampMs(value: unknown): number | undefined {
  const text = nonEmptyString(value);
  if (!text) {
    return undefined;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? values : undefined;
}

function attachmentsValue(value: unknown): IMessageAttachment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const attachments: IMessageAttachment[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    attachments.push({
      original_path: nonEmptyString(entry.original_path) ?? null,
      mime_type: nonEmptyString(entry.mime_type) ?? null,
      missing: booleanValue(entry.missing) ?? null,
      transfer_name: nonEmptyString(entry.transfer_name) ?? null,
      uti: nonEmptyString(entry.uti) ?? null,
    });
  }
  return attachments.length > 0 ? attachments : undefined;
}

function hasNonEmptyConversationField(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMalformedZeroChatAnchor(message: IMessagePayload): boolean {
  return (
    typeof message.chat_id === "number" &&
    message.chat_id <= 0 &&
    !hasNonEmptyConversationField(message.chat_guid) &&
    !hasNonEmptyConversationField(message.chat_identifier)
  );
}

function parseChatCandidates(result: unknown, sourceCreatedAtMs?: number): ChatCandidate[] {
  if (!isRecord(result) || !Array.isArray(result.chats)) {
    return [];
  }
  const candidates: ChatCandidate[] = [];
  for (const entry of result.chats) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = numberValue(entry.id);
    if (id == null || id <= 0) {
      continue;
    }
    const lastMessageAtMs = parseTimestampMs(entry.last_message_at);
    if (
      sourceCreatedAtMs != null &&
      lastMessageAtMs != null &&
      Math.abs(lastMessageAtMs - sourceCreatedAtMs) > REPAIR_MAX_TIME_DELTA_MS
    ) {
      continue;
    }
    candidates.push({ id, lastMessageAtMs });
  }
  return candidates.toSorted((a, b) => {
    if (sourceCreatedAtMs != null) {
      const aDelta =
        a.lastMessageAtMs != null ? Math.abs(a.lastMessageAtMs - sourceCreatedAtMs) : Infinity;
      const bDelta =
        b.lastMessageAtMs != null ? Math.abs(b.lastMessageAtMs - sourceCreatedAtMs) : Infinity;
      if (aDelta !== bDelta) {
        return aDelta - bDelta;
      }
    }
    return (b.lastMessageAtMs ?? 0) - (a.lastMessageAtMs ?? 0);
  });
}

function payloadFromHistoryRecord(record: Record<string, unknown>): IMessagePayload | null {
  const guid = nonEmptyString(record.guid);
  if (!guid) {
    return null;
  }
  return {
    id: numberValue(record.id) ?? null,
    guid,
    chat_id: numberValue(record.chat_id) ?? null,
    sender: nonEmptyString(record.sender) ?? null,
    destination_caller_id: nonEmptyString(record.destination_caller_id) ?? null,
    is_from_me: booleanValue(record.is_from_me) ?? null,
    text: nonEmptyString(record.text) ?? null,
    reply_to_id:
      nonEmptyString(record.reply_to_id) ??
      (typeof record.reply_to_id === "number" ? record.reply_to_id : null),
    reply_to_text: nonEmptyString(record.reply_to_text) ?? null,
    reply_to_sender: nonEmptyString(record.reply_to_sender) ?? null,
    created_at: nonEmptyString(record.created_at) ?? null,
    attachments: attachmentsValue(record.attachments) ?? null,
    chat_identifier: nonEmptyString(record.chat_identifier) ?? null,
    chat_guid: nonEmptyString(record.chat_guid) ?? null,
    chat_name: nonEmptyString(record.chat_name) ?? null,
    participants: stringArrayValue(record.participants) ?? null,
    is_group: booleanValue(record.is_group) ?? null,
  };
}

function findMessageByGuid(result: unknown, guid: string): IMessagePayload | null {
  if (!isRecord(result) || !Array.isArray(result.messages)) {
    return null;
  }
  for (const entry of result.messages) {
    if (!isRecord(entry)) {
      continue;
    }
    const message = payloadFromHistoryRecord(entry);
    if (message?.guid === guid) {
      return message;
    }
  }
  return null;
}

function mergeRepairedPayload(
  original: IMessagePayload,
  repaired: IMessagePayload,
): IMessagePayload {
  return {
    ...original,
    ...repaired,
    text: repaired.text ?? original.text,
    attachments: repaired.attachments ?? original.attachments,
  };
}

export function needsIMessageConversationRepair(message: IMessagePayload): boolean {
  return hasMalformedZeroChatAnchor(message);
}

export async function repairIMessageConversationFromHistory(params: {
  message: IMessagePayload;
  client: IMessageConversationRepairClient;
  timeoutMs?: number;
  logVerbose?: (message: string) => void;
}): Promise<IMessageConversationRepairResult> {
  const { message } = params;
  if (!needsIMessageConversationRepair(message)) {
    return { kind: "unchanged", message };
  }

  const guid = nonEmptyString(message.guid);
  if (!guid) {
    return { kind: "drop", reason: "invalid chat metadata" };
  }

  let candidates: ChatCandidate[];
  try {
    const chats = await params.client.request(
      "chats.list",
      { limit: REPAIR_CHAT_LIST_LIMIT },
      { timeoutMs: params.timeoutMs },
    );
    candidates = parseChatCandidates(chats, parseTimestampMs(message.created_at));
  } catch (err) {
    params.logVerbose?.(`imessage: failed to repair chat_id=0 payload: ${String(err)}`);
    return { kind: "drop", reason: "invalid chat metadata" };
  }

  for (const candidate of candidates) {
    let history: unknown;
    try {
      history = await params.client.request(
        "messages.history",
        { chat_id: candidate.id, limit: REPAIR_HISTORY_LIMIT },
        { timeoutMs: params.timeoutMs },
      );
    } catch (err) {
      params.logVerbose?.(
        `imessage: failed to inspect chat_id=${candidate.id} for chat_id=0 repair: ${String(err)}`,
      );
      continue;
    }
    const repaired = findMessageByGuid(history, guid);
    if (!repaired) {
      continue;
    }
    const chatId = repaired.chat_id;
    if (typeof chatId !== "number" || chatId <= 0) {
      continue;
    }
    return {
      kind: "repaired",
      message: mergeRepairedPayload(message, repaired),
      chatId,
    };
  }

  return { kind: "drop", reason: "invalid chat metadata" };
}
