/**
 * Tests for BlueBubbles cron transcript mirror.
 *
 * Context: cron deliveries historically did not write anything to the target
 * channel's session transcript, so when a BlueBubbles recipient replied in
 * plain text (no iMessage reply-quote, which is how most people use BB
 * groups), the agent saw an orphan user message and could not reconstruct
 * what cron had pushed earlier.
 *
 * Fix: when cron delivers to channel=bluebubbles, set `mirror` on the
 * outbound delivery so deliver.ts appends the payload text to the target
 * session transcript. Scope limited to bluebubbles — other channels keep
 * the previous no-mirror behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks (must be hoisted before imports) ---

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
          from: "bluebubbles:+15551234567",
          to: `bluebubbles:${target}`,
        };
      }
      return {
        sessionKey: `agent:${agentId}:bluebubbles:group:imessage;+;test-group-guid`,
        baseSessionKey: `agent:${agentId}:bluebubbles:group:imessage;+;test-group-guid`,
        peer: { kind: "group", id: "iMessage;+;test-group-guid" },
        chatType: "group",
        from: "group:iMessage;+;test-group-guid",
        to: `bluebubbles:${target}`,
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
import { deliverOutboundPayloads } from "../../infra/outbound/deliver.js";
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

function makeBluebubblesDelivery(): Extract<DeliveryTargetResolution, { ok: true }> {
  return {
    ok: true,
    channel: "bluebubbles",
    to: "chat_guid:iMessage;+;test-group-guid",
    accountId: "default",
    threadId: undefined,
    mode: "explicit",
  };
}

function makeBluebubblesDirectDelivery(): Extract<DeliveryTargetResolution, { ok: true }> {
  return {
    ok: true,
    channel: "bluebubbles",
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

describe("dispatchCronDelivery — BlueBubbles transcript mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCompletedDirectCronDeliveriesForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("BlueBubbles cron delivery includes a mirror with the group target session key", async () => {
    const params = makeBaseParams({
      resolvedDelivery: makeBluebubblesDelivery(),
      synthesizedText: "Oura morning briefing: sleep 7h23m, readiness 88, HRV 45",
    });
    await dispatchCronDelivery(params);

    expect(deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0];
    expect(callArg?.mirror).toBeDefined();
    expect(callArg?.mirror).toMatchObject({
      sessionKey: "agent:main:bluebubbles:group:imessage;+;test-group-guid",
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
    expect(callArg?.mirror?.idempotencyKey).toContain("bluebubbles");

    // The generic outbound session resolver lets the BlueBubbles plugin
    // normalize chat_guid targets before the mirror session key is chosen.
    expect(resolveOutboundSessionRoute).toHaveBeenCalledTimes(1);
    expect(resolveOutboundSessionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "bluebubbles",
        accountId: "default",
        agentId: "main",
        target: "chat_guid:iMessage;+;test-group-guid",
      }),
    );
  });

  it("non-BlueBubbles cron delivery does not set mirror (unchanged behavior)", async () => {
    const params = makeBaseParams({
      resolvedDelivery: makeTelegramDelivery(),
      synthesizedText: "Telegram topic push",
    });
    await dispatchCronDelivery(params);

    expect(deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0];
    expect(callArg?.mirror).toBeUndefined();
    // The outbound session resolver must not be invoked for non-BB channels.
    expect(resolveOutboundSessionRoute).not.toHaveBeenCalled();
  });

  it("BlueBubbles cron delivery routes a `;-;` DM target to a direct peer (no group session)", async () => {
    // Regression for codex review P1: mirror routing must use the same
    // BlueBubbles target normalization as regular outbound sends. A DM
    // chat_guid target (`;-;`) should land in the handle-shaped DM transcript,
    // not in a raw `chat_guid:...` session key that later replies never use.
    const params = makeBaseParams({
      resolvedDelivery: makeBluebubblesDirectDelivery(),
      synthesizedText: "Direct reminder for one recipient",
    });
    await dispatchCronDelivery(params);

    expect(deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0];
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
        channel: "bluebubbles",
        target: "chat_guid:iMessage;-;+15551234567",
      }),
    );
  });

  it("BlueBubbles mirror falls back gracefully when route resolution throws", async () => {
    vi.mocked(resolveOutboundSessionRoute).mockImplementationOnce(() => {
      throw new Error("route resolution failed");
    });
    const params = makeBaseParams({
      resolvedDelivery: makeBluebubblesDelivery(),
      synthesizedText: "Fallback text",
    });
    await dispatchCronDelivery(params);

    expect(deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0];
    // Mirror is omitted but delivery still proceeds.
    expect(callArg?.mirror).toBeUndefined();
    expect(callArg?.channel).toBe("bluebubbles");
  });

  it("multiple payloads are concatenated into the mirror text", async () => {
    const params = {
      ...makeBaseParams({
        resolvedDelivery: makeBluebubblesDelivery(),
      }),
      deliveryPayloads: [{ text: "Briefing part 1" }, { text: "Briefing part 2" }],
      synthesizedText: "fallback",
    };
    await dispatchCronDelivery(params);

    expect(deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(deliverOutboundPayloads).mock.calls[0]?.[0];
    expect(callArg?.mirror?.text).toBe("Briefing part 1\n\nBriefing part 2");
  });
});
