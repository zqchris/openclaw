import { describe, expect, it, vi } from "vitest";
import { repairIMessageConversationFromHistory } from "./conversation-repair.js";
import type { IMessagePayload } from "./types.js";

function malformedLinkPayload(overrides: Partial<IMessagePayload> = {}): IMessagePayload {
  return {
    id: 1,
    guid: "BF01B555-C3EC-4251-A49D-E2A41ECE3977",
    chat_id: 0,
    chat_guid: "",
    chat_identifier: "",
    sender: "chrisz83@gmail.com",
    is_from_me: false,
    is_group: false,
    text: "https://example.com\nwhat is this?",
    created_at: "2026-05-20T06:19:28.889Z",
    ...overrides,
  };
}

describe("iMessage malformed conversation repair", () => {
  it("recovers chat_id=0 link notifications from recent history by GUID", async () => {
    const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "chats.list") {
        return {
          chats: [
            { id: 1804, is_group: false, last_message_at: "2026-05-20T06:20:22.956Z" },
            { id: 349, is_group: true, last_message_at: "2026-05-20T06:19:28.889Z" },
          ],
        };
      }
      if (method === "messages.history" && params?.chat_id === 349) {
        return {
          messages: [
            {
              id: 14567,
              guid: "BF01B555-C3EC-4251-A49D-E2A41ECE3977",
              chat_id: 349,
              chat_guid: "any;+;chat240698944142298252",
              chat_identifier: "chat240698944142298252",
              chat_name: "小鬼当家",
              participants: ["+8618621181874", "+8618621185125"],
              sender: "+8618621181874",
              destination_caller_id: "chrisz83@gmail.com",
              is_group: true,
              is_from_me: false,
              text: "https://example.com\nwhat is this?",
              created_at: "2026-05-20T06:19:28.889Z",
            },
          ],
        };
      }
      return { messages: [] };
    });

    const result = await repairIMessageConversationFromHistory({
      message: malformedLinkPayload(),
      client: { request },
    });

    expect(result.kind).toBe("repaired");
    if (result.kind !== "repaired") {
      throw new Error("expected repair");
    }
    expect(result.chatId).toBe(349);
    expect(result.message).toMatchObject({
      chat_id: 349,
      chat_guid: "any;+;chat240698944142298252",
      chat_identifier: "chat240698944142298252",
      is_group: true,
      sender: "+8618621181874",
      chat_name: "小鬼当家",
    });
    expect(request).toHaveBeenCalledWith(
      "messages.history",
      { chat_id: 349, limit: 10 },
      { timeoutMs: undefined },
    );
  });

  it("drops chat_id=0 payloads when no recent history contains the GUID", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "chats.list") {
        return {
          chats: [{ id: 349, is_group: true, last_message_at: "2026-05-20T06:19:28.889Z" }],
        };
      }
      return { messages: [] };
    });

    const result = await repairIMessageConversationFromHistory({
      message: malformedLinkPayload(),
      client: { request },
    });

    expect(result).toEqual({ kind: "drop", reason: "invalid chat metadata" });
  });

  it("leaves valid direct messages unchanged without RPC lookups", async () => {
    const request = vi.fn();
    const message = malformedLinkPayload({
      chat_id: 1804,
      chat_guid: "any;-;+15555550123",
      chat_identifier: "+15555550123",
      sender: "+15555550123",
    });

    await expect(
      repairIMessageConversationFromHistory({ message, client: { request } }),
    ).resolves.toEqual({ kind: "unchanged", message });
    expect(request).not.toHaveBeenCalled();
  });
});
