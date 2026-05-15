/**
 * Tests for iMessage cron transcript mirror.
 *
 * Context: cron deliveries historically did not write anything to the target
 * channel's session transcript, so when an iMessage recipient replied in
 * plain text without a native reply quote, the agent saw an orphan user
 * message and could not reconstruct what cron had pushed earlier.
 *
 * Fix: when cron delivers to channel=imessage, set `mirror` on the
 * outbound delivery so deliver.ts appends the payload text to the target
 * session transcript. Scope limited to imessage — other channels keep
 * the previous no-mirror behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks (must be hoisted before imports) ---

const sendDurableMessageBatch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", results: [{ ok: true }] }),
);

vi.mock("../../config/sessions.js", () => ({
  resolveAgentMainSessionKey: vi.fn(({ agentId }: { agentId: string }) => `agent:${agentId}:main`),
  resolveMainSessionKey: vi.fn(() => "global"),
}));

vi.mock("../../agents/subagent-registry-read.js", () => ({
  countActiveDescendantRuns: vi.fn().mockReturnValue(0),
}));

vi.mock("../../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: vi.fn().mockResolvedValue([{ ok: true }]),
}));

vi.mock("./delivery-outbound.runtime.js", () => ({
  buildOutboundSessionContext: vi.fn().mockReturnValue({}),
  createOutboundSendDeps: vi.fn().mockReturnValue({}),
  resolveAgentOutboundIdentity: vi.fn().mockReturnValue({}),
  sendDurableMessageBatch,
}));

vi.mock("../../infra/outbound/identity.js", () => ({
  resolveAgentOutboundIdentity: vi.fn().mockReturnValue({}),
}));

vi.mock("../../infra/outbound/session-context.js", () => ({
  buildOutboundSessionContext: vi.fn().mockReturnValue({}),
}));

vi.mock("../../cli/outbound-send-deps.js", () => ({
  createOutboundSendDeps: vi.fn().mockReturnValue({}),
}));

vi.mock("../../gateway/call.runtime.js", () => ({
  callGateway: vi.fn().mockResolvedValue({ status: "ok" }),
}));

vi.mock("../../logger.js", () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: vi.fn(),
}));

vi.mock("../../infra/outbound/outbound-session.js", () => ({
  resolveOutboundSessionRoute: vi.fn(
    async ({ target, agentId }: { target: string; agentId: string }) => {
      if (target.includes(";-;")) {
        return {
          sessionKey: `agent:${agentId}:direct:+15551234567`,
          baseSessionKey: `agent:${agentId}:direct:+15551234567`,
          peer: { kind: "direct", id: "+15551234567" },
          chatType: "direct",
          from: "imessage:+15551234567",
          to: `imessage:${target}`,
        };
      }
      return {
        sessionKey: `agent:${agentId}:imessage:group:imessage;+;test-group-guid`,
        baseSessionKey: `agent:${agentId}:imessage:group:imessage;+;test-group-guid`,
        peer: { kind: "group", id: "iMessage;+;test-group-guid" },
        chatType: "group",
        from: "group:iMessage;+;test-group-guid",
        to: `imessage:${target}`,
      };
    },
  ),
}));

vi.mock("./subagent-followup-hints.js", () => ({
  expectsSubagentFollowup: vi.fn().mockReturnValue(false),
  isLikelyInterimCronMessage: vi.fn().mockReturnValue(false),
}));

vi.mock("./subagent-followup.runtime.js", () => ({
  readDescendantSubagentFallbackReply: vi.fn().mockResolvedValue(undefined),
  waitForDescendantSubagentSummary: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
import { resolveOutboundSessionRoute } from "../../infra/outbound/outbound-session.js";
import {
  dispatchCronDelivery,
  resetCompletedDirectCronDeliveriesForTests,
} from "./delivery-dispatch.js";
import type { DeliveryTargetResolution } from "./delivery-target.js";
import type { RunCronAgentTurnResult } from "./run.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImessageDelivery(): Extract<DeliveryTargetResolution, { ok: true }> {
  return {
    ok: true,
    channel: "imessage",
    to: "chat_guid:iMessage;+;test-group-guid",
    accountId: "default",
    threadId: undefined,
    mode: "explicit",
  };
}

function makeImessageDirectDelivery(): Extract<DeliveryTargetResolution, { ok: true }> {
  return {
    ok: true,
    channel: "imessage",
    to: "chat_guid:iMessage;-;+15551234567",
    accountId: "default",
    threadId: undefined,
    mode: "explicit",
  };
}

function makeTelegramDelivery(): Extract<DeliveryTargetResolution, { ok: true }> {
  return {
    ok: true,
    channel: "telegram",
    to: "-100123456",
    accountId: undefined,
    threadId: undefined,
    mode: "explicit",
  };
}

function makeWithRunSession() {
  return (
    result: Omit<RunCronAgentTurnResult, "sessionId" | "sessionKey">,
  ): RunCronAgentTurnResult => ({
    ...result,
    sessionId: "test-session-id",
    sessionKey: "test-session-key",
  });
}

function makeBaseParams(overrides: {
  resolvedDelivery: Extract<DeliveryTargetResolution, { ok: true }>;
  synthesizedText?: string;
}) {
  return {
    cfg: {} as never,
    cfgWithAgentDefaults: {} as never,
    deps: {} as never,
    job: {
      id: "oura-daily",
      name: "Oura Daily",
      sessionTarget: "isolated",
      deleteAfterRun: false,
      payload: { kind: "agentTurn", message: "summarize" },
    } as never,
    agentId: "main",
    agentSessionKey: "agent:main",
    runSessionKey: "agent:main:cron:oura-daily:run:test-run-id",
    sessionId: "test-session-id",
    runStartedAt: Date.now(),
    runEndedAt: Date.now(),
    timeoutMs: 30_000,
    resolvedDelivery: overrides.resolvedDelivery,
    deliveryRequested: true,
    skipHeartbeatDelivery: false,
    deliveryBestEffort: false,
    deliveryPayloadHasStructuredContent: false,
    deliveryPayloads: overrides.synthesizedText ? [{ text: overrides.synthesizedText }] : [],
    synthesizedText: overrides.synthesizedText ?? "Oura morning briefing...",
    summary: overrides.synthesizedText ?? "Oura morning briefing...",
    outputText: overrides.synthesizedText ?? "Oura morning briefing...",
    telemetry: undefined,
    abortSignal: undefined,
    isAborted: () => false,
    abortReason: () => "aborted",
    withRunSession: makeWithRunSession(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("dispatchCronDelivery - iMessage transcript mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCompletedDirectCronDeliveriesForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("iMessage cron delivery includes a mirror with the group target session key", async () => {
    const params = makeBaseParams({
      resolvedDelivery: makeImessageDelivery(),
      synthesizedText: "Oura morning briefing: sleep 7h23m, readiness 88, HRV 45",
    });
    await dispatchCronDelivery(params);

    expect(sendDurableMessageBatch).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(sendDurableMessageBatch).mock.calls[0]?.[0];
    expect(callArg?.mirror).toBeDefined();
    expect(callArg?.mirror).toMatchObject({
      sessionKey: "agent:main:imessage:group:imessage;+;test-group-guid",
      agentId: "main",
      text: "Oura morning briefing: sleep 7h23m, readiness 88, HRV 45",
      isGroup: true,
      groupId: "iMessage;+;test-group-guid",
    });
    expect(callArg?.mirror?.idempotencyKey).toBeDefined();
    // Reuses the delivery idempotency key (`cron-direct-delivery:v1:<execId>:<channel>:...`)
    // so retries dedup via appendMessage. Pin both the cron job id and the
    // channel to avoid asserting on the run-start timestamp embedded in the
    // execution id, which would couple the test to wall-clock state.
    expect(callArg?.mirror?.idempotencyKey).toContain("oura-daily");
    expect(callArg?.mirror?.idempotencyKey).toContain("imessage");

    // The generic outbound session resolver lets the iMessage plugin
    // normalize chat_guid targets before the mirror session key is chosen.
    expect(resolveOutboundSessionRoute).toHaveBeenCalledTimes(1);
    expect(resolveOutboundSessionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "imessage",
        accountId: "default",
        agentId: "main",
        target: "chat_guid:iMessage;+;test-group-guid",
      }),
    );
  });

  it("non-iMessage cron delivery does not set mirror (unchanged behavior)", async () => {
    const params = makeBaseParams({
      resolvedDelivery: makeTelegramDelivery(),
      synthesizedText: "Telegram topic push",
    });
    await dispatchCronDelivery(params);

    expect(sendDurableMessageBatch).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(sendDurableMessageBatch).mock.calls[0]?.[0];
    expect(callArg?.mirror).toBeUndefined();
    // The outbound session resolver must not be invoked for non-iMessage channels.
    expect(resolveOutboundSessionRoute).not.toHaveBeenCalled();
  });

  it("iMessage cron delivery routes a `;-;` DM target to a direct peer (no group session)", async () => {
    // Regression for codex review P1: mirror routing must use the same
    // iMessage target normalization as regular outbound sends. A DM
    // chat_guid target (`;-;`) should land in the handle-shaped DM transcript,
    // not in a raw `chat_guid:...` session key that later replies never use.
    const params = makeBaseParams({
      resolvedDelivery: makeImessageDirectDelivery(),
      synthesizedText: "Direct reminder for one recipient",
    });
    await dispatchCronDelivery(params);

    expect(sendDurableMessageBatch).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(sendDurableMessageBatch).mock.calls[0]?.[0];
    expect(callArg?.mirror).toMatchObject({
      sessionKey: "agent:main:direct:+15551234567",
      isGroup: false,
      text: "Direct reminder for one recipient",
    });
    expect(callArg?.mirror?.sessionKey).not.toContain("chat_guid");
    // groupId is omitted on DM mirrors.
    expect(callArg?.mirror).not.toHaveProperty("groupId");

    expect(resolveOutboundSessionRoute).toHaveBeenCalledTimes(1);
    expect(resolveOutboundSessionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "imessage",
        target: "chat_guid:iMessage;-;+15551234567",
      }),
    );
  });

  it("iMessage mirror falls back gracefully when route resolution throws", async () => {
    vi.mocked(resolveOutboundSessionRoute).mockImplementationOnce(() => {
      throw new Error("route resolution failed");
    });
    const params = makeBaseParams({
      resolvedDelivery: makeImessageDelivery(),
      synthesizedText: "Fallback text",
    });
    await dispatchCronDelivery(params);

    expect(sendDurableMessageBatch).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(sendDurableMessageBatch).mock.calls[0]?.[0];
    // Mirror is omitted but delivery still proceeds.
    expect(callArg?.mirror).toBeUndefined();
    expect(callArg?.channel).toBe("imessage");
  });

  it("multiple payloads are concatenated into the mirror text", async () => {
    const params = {
      ...makeBaseParams({
        resolvedDelivery: makeImessageDelivery(),
      }),
      deliveryPayloads: [{ text: "Briefing part 1" }, { text: "Briefing part 2" }],
      synthesizedText: "fallback",
    };
    await dispatchCronDelivery(params);

    expect(sendDurableMessageBatch).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(sendDurableMessageBatch).mock.calls[0]?.[0];
    expect(callArg?.mirror?.text).toBe("Briefing part 1\n\nBriefing part 2");
  });
});
