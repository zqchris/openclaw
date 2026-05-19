import type {
  ChannelMessageUnknownSendContext,
  ChannelMessageUnknownSendReconciliationResult,
} from "openclaw/plugin-sdk/channel-message";

const TELEGRAM_SEND_MESSAGE_NETWORK_FAILURE_RE =
  /(?:^|[:|]\s*)network request for ['"]sendMessage['"] failed!?/i;

export function isTelegramSendMessageNetworkFailure(error: unknown): boolean {
  return typeof error === "string" && TELEGRAM_SEND_MESSAGE_NETWORK_FAILURE_RE.test(error);
}

export function reconcileTelegramUnknownSend(
  ctx: ChannelMessageUnknownSendContext,
): ChannelMessageUnknownSendReconciliationResult | null {
  if (ctx.channel !== "telegram") {
    return null;
  }

  // grammY reports this when Telegram did not return a Bot API response for
  // sendMessage. The request may still have committed, so do not replay without
  // Telegram-side proof that the message was not delivered.
  if (isTelegramSendMessageNetworkFailure(ctx.lastError)) {
    return {
      status: "unresolved",
      error: "Telegram sendMessage network failure left delivery state unknown",
      retryable: false,
    };
  }

  return {
    status: "unresolved",
    error: "Telegram cannot reconcile this unknown send state automatically",
    retryable: false,
  };
}
