import { describe, expect, it } from "vitest";
import {
  isTelegramSendMessageNetworkFailure,
  reconcileTelegramUnknownSend,
} from "./outbound-recovery.js";

describe("Telegram outbound recovery", () => {
  it("does not replay sendMessage network failures without platform proof", () => {
    expect(
      reconcileTelegramUnknownSend({
        cfg: {} as never,
        queueId: "queue-1",
        channel: "telegram",
        to: "telegram-chat-id",
        enqueuedAt: 1,
        retryCount: 1,
        lastError:
          "Network request for 'sendMessage' failed! | Network request for 'sendMessage' failed!",
        payloads: [{ text: "hello" }],
      }),
    ).toEqual({
      status: "unresolved",
      error: "Telegram sendMessage network failure left delivery state unknown",
      retryable: false,
    });
  });

  it("does not replay unrelated unknown send states", () => {
    expect(
      reconcileTelegramUnknownSend({
        cfg: {} as never,
        queueId: "queue-1",
        channel: "telegram",
        to: "telegram-chat-id",
        enqueuedAt: 1,
        retryCount: 1,
        lastError: "Cannot find module 'channel-outbound-send.js'",
        payloads: [{ text: "hello" }],
      }),
    ).toEqual({
      status: "unresolved",
      error: "Telegram cannot reconcile this unknown send state automatically",
      retryable: false,
    });
  });

  it("matches persisted grammY sendMessage network errors", () => {
    expect(isTelegramSendMessageNetworkFailure("Network request for 'sendMessage' failed!")).toBe(
      true,
    );
    expect(isTelegramSendMessageNetworkFailure("Network request for 'sendPhoto' failed!")).toBe(
      false,
    );
  });
});
