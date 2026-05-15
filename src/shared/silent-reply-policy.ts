import { parseThreadSessionSuffix } from "../sessions/session-key-utils.js";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";

export type SilentReplyPolicy = "allow" | "disallow";
export type SilentReplyConversationType = "direct" | "group" | "internal";
export type SilentReplyPolicyShape = Partial<
  Record<Exclude<SilentReplyConversationType, "direct">, SilentReplyPolicy>
>;

export const DEFAULT_SILENT_REPLY_POLICY: Record<SilentReplyConversationType, SilentReplyPolicy> = {
  direct: "disallow",
  group: "allow",
  internal: "allow",
};

/** Classifies a reply context for silent-reply policy from explicit type, session key, or surface. */
export function classifySilentReplyConversationType(params: {
  sessionKey?: string;
  surface?: string;
  conversationType?: SilentReplyConversationType;
}): SilentReplyConversationType {
  if (params.conversationType) {
    return params.conversationType;
  }
  const normalizedSessionKey = normalizeLowercaseStringOrEmpty(params.sessionKey);
  if (normalizedSessionKey.includes(":group:") || normalizedSessionKey.includes(":channel:")) {
    return "group";
  }
  if (normalizedSessionKey.includes(":direct:") || normalizedSessionKey.includes(":dm:")) {
    return "direct";
  }
  // Treat generic thread suffixes as internal only after concrete channel
  // group/direct markers have had a chance to classify the conversation. This
  // keeps channel thread sessions such as `...:direct:<id>:thread:<topic>` from
  // suppressing direct-chat silent-reply rewrites, while still classifying
  // internal main/subagent/ACP thread sessions as internal.
  const { threadId } = parseThreadSessionSuffix(params.sessionKey);
  if (threadId) {
    return "internal";
  }
  const normalizedSurface = normalizeLowercaseStringOrEmpty(params.surface);
  if (normalizedSurface === "webchat") {
    return "direct";
  }
  return "internal";
}

/** Resolves silent-reply policy with surface overrides while keeping direct replies audible. */
export function resolveSilentReplyPolicyFromPolicies(params: {
  conversationType: SilentReplyConversationType;
  defaultPolicy?: SilentReplyPolicyShape;
  surfacePolicy?: SilentReplyPolicyShape;
}): SilentReplyPolicy {
  if (params.conversationType === "direct") {
    // Direct chats must never be silently swallowed, regardless of config overlays.
    return "disallow";
  }
  return (
    params.surfacePolicy?.[params.conversationType] ??
    params.defaultPolicy?.[params.conversationType] ??
    DEFAULT_SILENT_REPLY_POLICY[params.conversationType]
  );
}
