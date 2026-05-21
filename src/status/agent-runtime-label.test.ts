import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveAgentRuntimeLabel } from "./agent-runtime-label.js";

const mocks = vi.hoisted(() => ({
  getActivePluginRegistryVersion: vi.fn(),
  isCliProvider: vi.fn(),
}));

vi.mock("../agents/model-selection.js", () => ({
  isCliProvider: mocks.isCliProvider,
}));

vi.mock("../plugins/runtime.js", () => ({
  getActivePluginRegistryVersion: mocks.getActivePluginRegistryVersion,
}));

describe("resolveAgentRuntimeLabel", () => {
  beforeEach(() => {
    mocks.getActivePluginRegistryVersion.mockReset();
    mocks.getActivePluginRegistryVersion.mockReturnValue(0);
    mocks.isCliProvider.mockReset();
  });

  it("memoizes CLI provider checks per config and normalized provider", () => {
    const cfg = {} as OpenClawConfig;
    mocks.isCliProvider.mockReturnValue(true);

    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "example-cli" },
      }),
    ).toBe("example-cli (cli)");
    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "EXAMPLE-CLI" },
      }),
    ).toBe("EXAMPLE-CLI (cli)");

    expect(mocks.isCliProvider).toHaveBeenCalledTimes(1);
    expect(mocks.isCliProvider).toHaveBeenCalledWith("example-cli", cfg);
  });

  it("does not reuse cached CLI provider checks across different config objects", () => {
    const firstConfig = {} as OpenClawConfig;
    const secondConfig = {} as OpenClawConfig;
    mocks.isCliProvider.mockReturnValue(true);

    resolveAgentRuntimeLabel({
      config: firstConfig,
      sessionEntry: { modelProvider: "example-cli" },
    });
    resolveAgentRuntimeLabel({
      config: secondConfig,
      sessionEntry: { modelProvider: "example-cli" },
    });

    expect(mocks.isCliProvider).toHaveBeenCalledTimes(2);
  });

  it("refreshes cached CLI provider checks after plugin registry changes", () => {
    const cfg = {} as OpenClawConfig;
    mocks.getActivePluginRegistryVersion
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2);
    mocks.isCliProvider.mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "example-cli" },
      }),
    ).toBe("OpenClaw Pi Default");
    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "example-cli" },
      }),
    ).toBe("OpenClaw Pi Default");
    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "example-cli" },
      }),
    ).toBe("example-cli (cli)");

    expect(mocks.isCliProvider).toHaveBeenCalledTimes(2);
  });

  it("drops cached CLI provider checks after the current turn", async () => {
    const cfg = {} as OpenClawConfig;
    mocks.isCliProvider.mockReturnValueOnce(false).mockReturnValueOnce(true);

    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "example-cli" },
      }),
    ).toBe("OpenClaw Pi Default");

    await Promise.resolve();

    expect(
      resolveAgentRuntimeLabel({
        config: cfg,
        sessionEntry: { modelProvider: "example-cli" },
      }),
    ).toBe("example-cli (cli)");
    expect(mocks.isCliProvider).toHaveBeenCalledTimes(2);
  });
});
