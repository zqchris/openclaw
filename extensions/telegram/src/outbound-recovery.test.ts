import { describe, expect, it } from "vitest";
import {
  isTelegramSendMessageNetworkFailure,
  reconcileTelegramUnknownSend,
} from "./outbound-recovery.js";

describe("Telegram outbound recovery", () => {
  it("replays stored final text after sendMessage network failures", () => {
    expect(
      reconcileTelegramUnknownSend({
        cfg: {} as never,
        queueId: "queue-1",
        channel: "telegram",
        to: "435427284",
        enqueuedAt: 1,
        retryCount: 1,
        lastError:
          "Network request for 'sendMessage' failed! | Network request for 'sendMessage' failed!",
        payloads: [{ text: "hello" }],
      }),
    ).toEqual({ status: "not_sent" });
  });

  it("does not replay unrelated unknown send states", () => {
    expect(
      reconcileTelegramUnknownSend({
        cfg: {} as never,
        queueId: "queue-1",
        channel: "telegram",
        to: "435427284",
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
