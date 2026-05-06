import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetBlueBubblesRecentRouteContextCacheForTest,
  applyBlueBubblesRecentMessageRouteContext,
} from "./monitor-route-cache.js";

describe("BlueBubbles recent route context cache", () => {
  beforeEach(() => {
    _resetBlueBubblesRecentRouteContextCacheForTest();
  });

  it("restores group route metadata for later same-message webhooks that omit chat fields", () => {
    applyBlueBubblesRecentMessageRouteContext({
      accountId: "default",
      message: {
        messageId: "msg-1",
        isGroup: true,
        chatGuid: "iMessage;+;group-1",
        chatName: "Family Chat",
      },
      now: 1000,
    });

    const restored = applyBlueBubblesRecentMessageRouteContext({
      accountId: "default",
      message: {
        messageId: "msg-1",
        isGroup: false,
      },
      now: 1500,
    });

    expect(restored.restored).toBe(true);
    expect(restored.message).toEqual({
      messageId: "msg-1",
      isGroup: true,
      chatGuid: "iMessage;+;group-1",
      chatName: "Family Chat",
    });
  });

  it("treats a later conflicting group flag as stale even when partial route fields remain", () => {
    applyBlueBubblesRecentMessageRouteContext({
      accountId: "default",
      message: {
        messageId: "msg-1",
        isGroup: true,
        chatGuid: "iMessage;+;group-1",
      },
      now: 1000,
    });

    const restored = applyBlueBubblesRecentMessageRouteContext({
      accountId: "default",
      message: {
        messageId: "msg-1",
        isGroup: false,
        chatId: 42,
      },
      now: 1500,
    });

    expect(restored.restored).toBe(true);
    expect(restored.message.isGroup).toBe(true);
    expect(restored.message.chatGuid).toBe("iMessage;+;group-1");
    expect(restored.message.chatId).toBe(42);
  });

  it("uses associatedMessageGuid as an alias for reaction and balloon follow-ups", () => {
    applyBlueBubblesRecentMessageRouteContext({
      accountId: "default",
      message: {
        messageId: "msg-1",
        isGroup: true,
        chatGuid: "iMessage;+;group-1",
      },
      now: 1000,
    });

    const restored = applyBlueBubblesRecentMessageRouteContext({
      accountId: "default",
      message: {
        messageId: "reaction-1",
        associatedMessageGuid: "msg-1",
        isGroup: false,
      },
      now: 1500,
    });

    expect(restored.restored).toBe(true);
    expect(restored.message.isGroup).toBe(true);
    expect(restored.message.chatGuid).toBe("iMessage;+;group-1");
  });
});
