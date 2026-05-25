import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedFeishuAccount } from "./types.js";

const mockUserGet = vi.fn();
const mockCreateFeishuClient = vi.fn(() => ({
  contact: { user: { get: mockUserGet } },
}));

vi.mock("./client.js", () => ({
  createFeishuClient: mockCreateFeishuClient,
}));

function buildAccount(overrides: Partial<ResolvedFeishuAccount> = {}): ResolvedFeishuAccount {
  return {
    accountId: "default",
    appId: "cli_test",
    appSecret: "secret", // pragma: allowlist secret
    configured: true,
    ...overrides,
  } as ResolvedFeishuAccount;
}

function makeFeishuApiError(code: number, msg: string): Error {
  const err = new Error("Request failed with status code 400") as Error & {
    response: { data: { code: number; msg: string } };
  };
  err.response = { data: { code, msg } };
  return err;
}

describe("resolveFeishuSenderName", () => {
  beforeEach(() => {
    mockUserGet.mockReset();
    mockCreateFeishuClient.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns the resolved name on success and reuses the cache", async () => {
    const { resolveFeishuSenderName } = await import("./bot-sender-name.js");
    mockUserGet.mockResolvedValue({ data: { user: { name: "Alice" } } });
    const log = vi.fn();

    const first = await resolveFeishuSenderName({
      account: buildAccount(),
      senderId: "ou_alice_success",
      log,
    });
    const second = await resolveFeishuSenderName({
      account: buildAccount(),
      senderId: "ou_alice_success",
      log,
    });

    expect(first.name).toBe("Alice");
    expect(second.name).toBe("Alice");
    expect(mockUserGet).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("silences 41050 'no user authority error' and caches the negative result", async () => {
    const { resolveFeishuSenderName } = await import("./bot-sender-name.js");
    mockUserGet.mockRejectedValue(makeFeishuApiError(41050, "no user authority error"));
    const log = vi.fn();

    const first = await resolveFeishuSenderName({
      account: buildAccount(),
      senderId: "ou_unauthorized_user",
      log,
    });
    const second = await resolveFeishuSenderName({
      account: buildAccount(),
      senderId: "ou_unauthorized_user",
      log,
    });

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(mockUserGet).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("still logs and surfaces permission errors with grant URLs (code 99991672)", async () => {
    const { resolveFeishuSenderName } = await import("./bot-sender-name.js");
    mockUserGet.mockRejectedValue(
      makeFeishuApiError(
        99991672,
        "permission denied: contact:user.base:readonly https://open.feishu.cn/app/cli_test",
      ),
    );
    const log = vi.fn();

    const result = await resolveFeishuSenderName({
      account: buildAccount(),
      senderId: "ou_perm_user",
      log,
    });

    expect(result.permissionError?.code).toBe(99991672);
    expect(result.permissionError?.grantUrl).toBe("https://open.feishu.cn/app/cli_test");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("feishu: permission error resolving sender name"),
    );
  });

  it("logs a generic resolution failure when the error is not a known permission case", async () => {
    const { resolveFeishuSenderName } = await import("./bot-sender-name.js");
    mockUserGet.mockRejectedValue(new Error("network blip"));
    const log = vi.fn();

    const result = await resolveFeishuSenderName({
      account: buildAccount(),
      senderId: "ou_network_user",
      log,
    });

    expect(result).toEqual({});
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("feishu: failed to resolve sender name for ou_network_user"),
    );
  });
});

describe("isFeishuUserLookupUnauthorized", () => {
  it("recognizes 41050 'no user authority error'", async () => {
    const { isFeishuUserLookupUnauthorized } = await import("./bot-sender-name.js");
    expect(
      isFeishuUserLookupUnauthorized(makeFeishuApiError(41050, "no user authority error")),
    ).toBe(true);
  });

  it("does not classify other 4xx Feishu errors as user-lookup unauthorized", async () => {
    const { isFeishuUserLookupUnauthorized } = await import("./bot-sender-name.js");
    expect(isFeishuUserLookupUnauthorized(makeFeishuApiError(99991672, "permission denied"))).toBe(
      false,
    );
    expect(isFeishuUserLookupUnauthorized(makeFeishuApiError(99991400, "rate limited"))).toBe(
      false,
    );
  });

  it("returns false for non-Feishu errors and non-objects", async () => {
    const { isFeishuUserLookupUnauthorized } = await import("./bot-sender-name.js");
    expect(isFeishuUserLookupUnauthorized(new Error("network blip"))).toBe(false);
    expect(isFeishuUserLookupUnauthorized(undefined)).toBe(false);
    expect(isFeishuUserLookupUnauthorized(null)).toBe(false);
    expect(isFeishuUserLookupUnauthorized("string error")).toBe(false);
  });
});
